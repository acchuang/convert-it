'use client';

import { useState, useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import {
  convertFile,
  getFileExtension,
  getTargetFormats,
  DEFAULT_SETTINGS,
  getFormatInfo,
  sharedSettings,
} from '@/lib/converters';
import type { ConversionSettings } from '@/lib/types';
import { FILE_SIZE_LIMITS } from '@/lib/types';
import { CancelledError, cancelInWorker, runInWorker, runsOnMainThread } from '@/lib/worker-pool';
import { terminateFFmpeg } from '@/lib/audio-video-converters';
import type { FileJob } from '@/app/components/JobCard';
import { classifyError, type ConversionFailure } from './errors';
import { canMerge } from './pdf-options';
import { DEFAULT_NAME_TEMPLATE, applyNameTemplate, safeFileStem, uniqueName } from './filenames';
import type { PickedFile } from './drop-files';
import { extensionOf, identify, NEAREST, needsIdentifying, renamed } from './identify';
import { addHistoryEntry, getHistory, historyEnabled, type HistoryEntry } from '@/lib/history';
import { recordConversion } from '@/lib/stats';
import { readStored, writeStored } from '@/lib/storage';

/**
 * The download name for a finished job. Multi-page PDF → image comes back as a
 * zip blob, so it is named .zip whatever image format was picked.
 */
export function outputFilename(
  job: Pick<FileJob, 'file' | 'targetExt' | 'resultBlob' | 'sourceExt'> &
    Partial<Pick<FileJob, 'resultWidth' | 'resultHeight'>>,
  template = DEFAULT_NAME_TEMPLATE,
  n = 1,
  total = 1,
): string {
  return applyNameTemplate(template, {
    name: job.file.name.replace(/\.[^.]+$/, ''),
    ext: job.resultBlob?.type === 'application/zip' ? 'zip' : (job.targetExt ?? ''),
    source: job.sourceExt,
    n,
    total,
    width: job.resultWidth,
    height: job.resultHeight,
  });
}

const TEMPLATE_KEY = 'convert-it:name-template';
const templateListeners = new Set<() => void>();
const subscribeTemplate = (listener: () => void) => {
  templateListeners.add(listener);
  return () => templateListeners.delete(listener);
};
const readTemplate = () => readStored(TEMPLATE_KEY) ?? DEFAULT_NAME_TEMPLATE;

// Output images the browser can decode, to read their size for {w}x{h}.
const MEASURABLE = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'ico']);

async function measure(
  blob: Blob,
  ext: string,
): Promise<{ resultWidth?: number; resultHeight?: number }> {
  if (!MEASURABLE.has(ext) || blob.type === 'application/zip') return {};
  try {
    const bitmap = await createImageBitmap(blob);
    const size = { resultWidth: bitmap.width, resultHeight: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return {};
  }
}

export { uniqueName } from './filenames';

// How long a download's object URL outlives the click. Revoking straight after
// click() races the download itself in Firefox and Safari, which then save a
// zero-byte or failed file for anything large.
const REVOKE_DELAY_MS = 60_000;

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

interface UseJobManagerOptions {
  onHistoryUpdate?: () => void;
  /** Preselected on any added file that supports it; falls back to the first
   *  registered target otherwise. Set by the /convert/[pair] landing pages. */
  preferredTarget?: string;
}

interface UseJobManagerReturn {
  jobs: FileJob[];
  addFiles: (files: FileList | File[] | PickedFile[]) => void;
  updateJob: (id: string, patch: Partial<FileJob>) => void;
  updateJobSettings: (id: string, patch: Partial<ConversionSettings>) => void;
  /** Copies a job's settings to the other jobs with the same target (see sharedSettings). */
  applySettingsToSimilar: (id: string) => void;
  convertJob: (job: FileJob) => Promise<void>;
  cancelJob: (id: string) => void;
  downloadJob: (job: FileJob) => void;
  downloadAllAsZip: () => Promise<void>;
  applyBatchFormat: (format: string) => void;
  removeJob: (id: string) => void;
  /** What the last remove/Clear took out (for the Undo toast), and putting it back. */
  removed: FileJob[];
  undoRemove: () => void;
  dismissUndo: () => void;
  convertAll: () => void;
  clearAll: () => void;
  doneCount: number;
  moveJob: (id: string, delta: -1 | 1) => void;
  merge: MergeState;
  /** PDFs and images in the list: what "merge into PDF" would take. */
  mergeableCount: number;
  mergeToPdf: () => Promise<void>;
  /** Output-name template ({name}.{ext} by default) and the name it gives a job. */
  nameTemplate: string;
  setNameTemplate: (template: string) => void;
  nameFor: (job: FileJob) => string;
}

export function useJobManager(options?: UseJobManagerOptions): UseJobManagerReturn {
  const [jobs, setJobs] = useState<FileJob[]>([]);
  const convertingRef = useRef(new Set<string>());
  const cancelledRef = useRef(new Set<string>());
  // ffmpeg runs one job at a time in call order (see the queue in
  // audio-video-converters), so the head of this list is the job actually
  // executing — the only one it makes sense to kill the instance for.
  const mediaQueueRef = useRef<string[]>([]);
  const preferredTarget = options?.preferredTarget;

  // Callers pass an inline options object, so hold the latest callback in a ref
  // rather than making every returned function change identity each render.
  const onHistoryUpdateRef = useRef(options?.onHistoryUpdate);
  useEffect(() => {
    onHistoryUpdateRef.current = options?.onHistoryUpdate;
  });

  const addFiles = useCallback(
    (picked: FileList | File[] | PickedFile[]) => {
      const files: PickedFile[] = Array.from(picked as ArrayLike<File | PickedFile>).map((f) =>
        f instanceof File ? { file: f, folder: '' } : f,
      );
      const pickTarget = (ext: string) => {
        const targets = getTargetFormats(ext);
        if (preferredTarget && targets.includes(preferredTarget)) return preferredTarget;
        return targets[0] ?? null;
      };

      const newJobs: FileJob[] = [];
      for (const { file, folder } of files) {
        const ext = getFileExtension(file.name);
        const category = getFormatInfo(ext)?.category;
        const limit = category ? FILE_SIZE_LIMITS[category] : FILE_SIZE_LIMITS.document;

        if (file.size > limit) {
          newJobs.push({
            id: crypto.randomUUID(),
            file,
            sourceExt: ext,
            targetExt: null,
            status: 'error',
            progress: 0,
            error: {
              code: 'too-large',
              detail: `File too large (${(file.size / (1024 * 1024)).toFixed(0)}MB exceeds ${limit / (1024 * 1024)}MB limit)`,
              params: {
                size: Math.round(file.size / (1024 * 1024)),
                limit: limit / (1024 * 1024),
              },
            },
            settings: { ...DEFAULT_SETTINGS },
            folder,
          });
          continue;
        }

        newJobs.push({
          id: crypto.randomUUID(),
          file,
          sourceExt: ext,
          targetExt: pickTarget(ext),
          status: 'idle',
          progress: 0,
          settings: { ...DEFAULT_SETTINGS },
          folder,
        });
      }
      setJobs((prev) => [...prev, ...newJobs]);

      // No route from the name: look at the bytes, then either read it as
      // what it really is or say why it can't be converted.
      for (const job of newJobs) {
        if (job.status !== 'idle' || !needsIdentifying(job.file.name)) continue;
        void identify(job.file).then(
          (found) => {
            const from = extensionOf(job.file.name);
            const patch: Partial<FileJob> =
              'ext' in found
                ? {
                    file: renamed(job.file, found.ext),
                    sourceExt: found.ext,
                    targetExt: pickTarget(found.ext),
                    identified: { from, reason: found.reason },
                  }
                : {
                    status: 'error',
                    error: {
                      code: 'unsupported',
                      detail: `No converter reads ${from ? `.${from}` : 'files without an extension'}`,
                      params: {
                        kind: found.kind,
                        label: found.label,
                        formats: NEAREST[found.kind],
                      },
                    },
                  };
            setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, ...patch } : j)));
          },
          () => {},
        );
      }
    },
    [preferredTarget],
  );

  const updateJob = useCallback(
    (id: string, patch: Partial<FileJob>) =>
      setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j))),
    [],
  );

  const updateJobSettings = useCallback(
    (id: string, patch: Partial<ConversionSettings>) =>
      setJobs((prev) =>
        prev.map((j) =>
          j.id === id
            ? { ...j, settings: { ...j.settings, ...patch }, status: 'idle', resultBlob: undefined }
            : j,
        ),
      ),
    [],
  );

  const applySettingsToSimilar = useCallback(
    (id: string) =>
      setJobs((prev) => {
        const from = prev.find((j) => j.id === id);
        if (!from) return prev;
        return prev.map((j) => {
          if (j.id === id || j.status === 'converting') return j;
          const patch = sharedSettings(from, j);
          const changed = Object.entries(patch).some(
            ([key, value]) => j.settings[key as keyof ConversionSettings] !== value,
          );
          return changed
            ? { ...j, settings: { ...j.settings, ...patch }, status: 'idle', resultBlob: undefined }
            : j;
        });
      }),
    [],
  );

  const convertJob = useCallback(async (job: FileJob) => {
    if (!job.targetExt) return;
    if (convertingRef.current.has(job.id)) return;
    convertingRef.current.add(job.id);
    cancelledRef.current.delete(job.id);

    const category = getFormatInfo(job.sourceExt)?.category;
    const onMainThread = runsOnMainThread(job.sourceExt, job.targetExt, category);
    const isMedia = category === 'video' || category === 'audio';
    if (isMedia) mediaQueueRef.current.push(job.id);

    setJobs((prev) =>
      prev.map((j) =>
        j.id === job.id
          ? {
              ...j,
              status: 'converting',
              progress: 10,
              stage: isMedia ? 'engine' : 'converting',
            }
          : j,
      ),
    );
    const onProgress = (pct: number) =>
      setJobs((prev) =>
        prev.map((j) =>
          j.id === job.id
            ? {
                ...j,
                progress: pct,
                stage: pct >= 100 ? 'finalizing' : 'processing',
              }
            : j,
        ),
      );

    const startedAt = Date.now();
    try {
      const blob = onMainThread
        ? await convertFile(job.file, job.targetExt, job.settings, onProgress)
        : await runInWorker(job.id, job.file, job.targetExt, job.settings, onProgress);

      if (cancelledRef.current.delete(job.id)) return;
      const size = await measure(blob, job.targetExt);
      setJobs((prev) =>
        prev.map((j) =>
          j.id === job.id
            ? { ...j, status: 'done', resultBlob: blob, progress: 100, stage: 'complete', ...size }
            : j,
        ),
      );

      if (historyEnabled()) {
        recordConversion(job.sourceExt, job.targetExt, { ok: true, ms: Date.now() - startedAt });
      }
      addHistoryEntry({
        filename: job.file.name,
        sourceExt: job.sourceExt,
        targetExt: job.targetExt,
        convertedAt: new Date().toISOString(),
        fileSize: job.file.size,
        resultSize: blob.size,
      });
      onHistoryUpdateRef.current?.();
    } catch (err) {
      // A cancelled job already went back to idle, and killing ffmpeg mid-exec
      // surfaces as a generic wasm abort — neither is an error worth showing.
      if (cancelledRef.current.delete(job.id) || err instanceof CancelledError) return;
      const failure = classifyError(err);
      if (historyEnabled()) {
        recordConversion(job.sourceExt, job.targetExt, { ok: false, code: failure.code });
      }
      setJobs((prev) =>
        prev.map((j) =>
          j.id === job.id
            ? {
                ...j,
                status: 'error',
                error: failure,
                progress: 0,
              }
            : j,
        ),
      );
    } finally {
      convertingRef.current.delete(job.id);
      if (isMedia) {
        mediaQueueRef.current = mediaQueueRef.current.filter((id) => id !== job.id);
      }
    }
  }, []);

  const cancelJob = useCallback((id: string) => {
    if (!cancelInWorker(id)) {
      // Main-thread job: only the head of the ffmpeg queue is actually running,
      // so that is the only one worth killing the instance for. Anything else
      // has its result discarded when it lands.
      if (mediaQueueRef.current[0] === id) terminateFFmpeg();
      cancelledRef.current.add(id);
      mediaQueueRef.current = mediaQueueRef.current.filter((queued) => queued !== id);
    }
    setJobs((prev) =>
      prev.map((j) => (j.id === id ? { ...j, status: 'idle', progress: 0, error: undefined } : j)),
    );
  }, []);

  // The output-name template, remembered per viewer (a convenience only).
  // Read through lib/storage (memory if storage is blocked), so it applies
  // for the visit either way; the static page renders the default.
  const nameTemplate = useSyncExternalStore(
    subscribeTemplate,
    readTemplate,
    () => DEFAULT_NAME_TEMPLATE,
  );
  const setNameTemplate = useCallback((template: string) => {
    writeStored(TEMPLATE_KEY, template);
    for (const listener of templateListeners) listener();
  }, []);

  const nameFor = useCallback(
    (job: FileJob) =>
      outputFilename(job, nameTemplate, jobs.indexOf(job) + 1 || 1, jobs.length || 1),
    [jobs, nameTemplate],
  );

  const downloadJob = useCallback(
    (job: FileJob) => {
      if (!job.resultBlob || !job.targetExt) return;
      saveBlob(job.resultBlob, nameFor(job));
    },
    [nameFor],
  );

  const downloadAllAsZip = useCallback(async () => {
    const doneJobs = jobs.filter((j) => j.status === 'done' && j.resultBlob && j.targetExt);
    if (doneJobs.length === 0) return;

    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const used = new Set<string>();

    // Files from a dropped folder go back into the same folders.
    for (const job of doneJobs) {
      const path = job.folder ? `${job.folder}/${nameFor(job)}` : nameFor(job);
      zip.file(uniqueName(path, used), job.resultBlob!);
    }

    saveBlob(await zip.generateAsync({ type: 'blob' }), 'converted-files.zip');
  }, [jobs, nameFor]);

  const applyBatchFormat = useCallback((format: string) => {
    if (!format) return;
    setJobs((prev) =>
      prev.map((j) => {
        if (j.status !== 'idle') return j;
        const targets = getTargetFormats(j.sourceExt);
        if (!targets.includes(format)) return j;
        return { ...j, targetExt: format, resultBlob: undefined };
      }),
    );
  }, []);

  const moveJob = useCallback(
    (id: string, delta: -1 | 1) =>
      setJobs((prev) => {
        const from = prev.findIndex((j) => j.id === id);
        const to = from + delta;
        if (from < 0 || to < 0 || to >= prev.length) return prev;
        const next = [...prev];
        [next[from], next[to]] = [next[to], next[from]];
        return next;
      }),
    [],
  );

  // Merge: every PDF and image in the list, in list order, into one PDF. A
  // batch action rather than a route, since it takes many inputs.
  const [merge, setMerge] = useState<MergeState>({ status: 'idle' });
  const mergeable = jobs.filter((j) => canMerge(j.sourceExt));
  const mergeToPdf = useCallback(async () => {
    const sources = jobs.filter((j) => canMerge(j.sourceExt));
    if (sources.length < 2) return;
    setMerge({ status: 'running', progress: 0 });
    try {
      const { mergePdf } = await import('@/lib/pdf-tools');
      // Images use the page size set on the first image job (A4 by default).
      const pageSize = sources.find((j) => j.sourceExt !== 'pdf')?.settings.pdfPageSize;
      const blob = await mergePdf(
        sources.map((j) => j.file),
        { pdfPageSize: pageSize ?? 'a4' },
        (progress) => setMerge({ status: 'running', progress }),
      );
      saveBlob(blob, `${safeFileStem(sources[0].file.name.replace(/\.[^.]+$/, ''))}-merged.pdf`);
      setMerge({ status: 'idle' });
    } catch (err) {
      setMerge({ status: 'error', error: classifyError(err) });
    }
  }, [jobs]);

  // The last removal (one card or Clear), kept so it can be undone, with each
  // job's place in the list. A new removal replaces it; dismissing frees the
  // blobs it holds.
  const [removed, setRemoved] = useState<{ job: FileJob; index: number }[] | null>(null);

  const removeWhere = useCallback(
    (pick: (job: FileJob) => boolean) => {
      const taken = jobs.flatMap((job, index) => (pick(job) ? [{ job, index }] : []));
      if (!taken.length) return;
      for (const { job } of taken) if (job.status === 'converting') cancelJob(job.id);
      const ids = new Set(taken.map(({ job }) => job.id));
      setJobs((prev) => prev.filter((j) => !ids.has(j.id)));
      setRemoved(
        taken.map(({ job, index }) => ({
          index,
          // A cancelled conversion comes back ready to run again.
          job: job.status === 'converting' ? { ...job, status: 'idle', progress: 0 } : job,
        })),
      );
    },
    [jobs, cancelJob],
  );

  const removeJob = useCallback((id: string) => removeWhere((j) => j.id === id), [removeWhere]);

  const undoRemove = useCallback(() => {
    if (!removed) return;
    setJobs((prev) => {
      const out = [...prev];
      // Ascending original positions put every job back where it was.
      for (const { job, index } of removed) out.splice(Math.min(index, out.length), 0, job);
      return out;
    });
    setRemoved(null);
  }, [removed]);

  const dismissUndo = useCallback(() => setRemoved(null), []);

  const convertAll = useCallback(() => {
    jobs.filter((j) => j.status === 'idle' && j.targetExt).forEach(convertJob);
  }, [jobs, convertJob]);

  const clearAll = useCallback(() => removeWhere(() => true), [removeWhere]);

  const doneCount = jobs.filter((j) => j.status === 'done').length;
  const removedJobs = useMemo(() => removed?.map((r) => r.job) ?? [], [removed]);

  return {
    jobs,
    addFiles,
    updateJob,
    updateJobSettings,
    applySettingsToSimilar,
    convertJob,
    cancelJob,
    downloadJob,
    downloadAllAsZip,
    applyBatchFormat,
    removeJob,
    removed: removedJobs,
    undoRemove,
    dismissUndo,
    convertAll,
    clearAll,
    doneCount,
    moveJob,
    merge,
    mergeableCount: mergeable.length,
    mergeToPdf,
    nameTemplate,
    setNameTemplate,
    nameFor,
  };
}

export type MergeState =
  | { status: 'idle' }
  | { status: 'running'; progress: number }
  | { status: 'error'; error: ConversionFailure };
