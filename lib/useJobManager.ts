'use client';

import { useState, useCallback, useRef } from 'react';
import {
  convertFile,
  getFileExtension,
  getTargetFormats,
  DEFAULT_SETTINGS,
  getFormatInfo,
} from '@/lib/converters';
import type { ConversionSettings } from '@/lib/types';
import { FILE_SIZE_LIMITS } from '@/lib/types';
import type { FileJob } from '@/app/components/JobCard';
import { addHistoryEntry, getHistory, type HistoryEntry } from '@/lib/history';

interface UseJobManagerOptions {
  onHistoryUpdate?: () => void;
}

interface UseJobManagerReturn {
  jobs: FileJob[];
  addFiles: (files: FileList | File[]) => void;
  updateJob: (id: string, patch: Partial<FileJob>) => void;
  updateJobSettings: (id: string, patch: Partial<ConversionSettings>) => void;
  convertJob: (job: FileJob) => Promise<void>;
  downloadJob: (job: FileJob) => void;
  downloadAllAsZip: () => Promise<void>;
  applyBatchFormat: (format: string) => void;
  removeJob: (id: string) => void;
  convertAll: () => void;
  clearAll: () => void;
  doneCount: number;
}

export function useJobManager(options?: UseJobManagerOptions): UseJobManagerReturn {
  const [jobs, setJobs] = useState<FileJob[]>([]);
  const convertingRef = useRef(new Set<string>());

  const addFiles = useCallback((files: FileList | File[]) => {
    const newJobs: FileJob[] = [];
    for (const file of Array.from(files)) {
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
          error: `File too large (${(file.size / (1024 * 1024)).toFixed(0)}MB exceeds ${limit / (1024 * 1024)}MB limit)`,
          settings: { ...DEFAULT_SETTINGS },
        });
        continue;
      }

      newJobs.push({
        id: crypto.randomUUID(),
        file,
        sourceExt: ext,
        targetExt: getTargetFormats(ext)[0] ?? null,
        status: 'idle',
        progress: 0,
        settings: { ...DEFAULT_SETTINGS },
      });
    }
    setJobs(prev => [...prev, ...newJobs]);
  }, []);

  const updateJob = useCallback((id: string, patch: Partial<FileJob>) =>
    setJobs(prev => prev.map(j => (j.id === id ? { ...j, ...patch } : j))), []);

  const updateJobSettings = useCallback((id: string, patch: Partial<ConversionSettings>) =>
    setJobs(prev =>
      prev.map(j =>
        j.id === id
          ? { ...j, settings: { ...j.settings, ...patch }, status: 'idle', resultBlob: undefined }
          : j
      )
    ), []);

  const convertJob = useCallback(async (job: FileJob) => {
    if (!job.targetExt) return;
    if (convertingRef.current.has(job.id)) return;
    convertingRef.current.add(job.id);
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'converting', progress: 10 } : j));
    try {
      const blob = await convertFile(
        job.file,
        job.targetExt,
        job.settings,
        (pct) => setJobs(prev => prev.map(j => j.id === job.id ? { ...j, progress: pct } : j))
      );
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'done', resultBlob: blob, progress: 100 } : j));

      addHistoryEntry({
        filename: job.file.name,
        sourceExt: job.sourceExt,
        targetExt: job.targetExt,
        convertedAt: new Date().toISOString(),
        fileSize: job.file.size,
        resultSize: blob.size,
      });
      options?.onHistoryUpdate?.();
    } catch (err) {
      setJobs(prev => prev.map(j => j.id === job.id ? {
        ...j,
        status: 'error',
        error: err instanceof Error ? err.message : 'Conversion failed',
        progress: 0,
      } : j));
    } finally {
      convertingRef.current.delete(job.id);
    }
  }, []);

  const downloadJob = useCallback((job: FileJob) => {
    if (!job.resultBlob || !job.targetExt) return;
    const url = URL.createObjectURL(job.resultBlob);
    const a = document.createElement('a');
    const base = job.file.name.replace(/\.[^.]+$/, '');
    a.href = url;
    a.download = `${base}.${job.targetExt}`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const downloadAllAsZip = useCallback(async () => {
    const doneJobs = jobs.filter(j => j.status === 'done' && j.resultBlob && j.targetExt);
    if (doneJobs.length === 0) return;

    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    for (const job of doneJobs) {
      const base = job.file.name.replace(/\.[^.]+$/, '');
      zip.file(`${base}.${job.targetExt}`, job.resultBlob!);
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'converted-files.zip';
    a.click();
    URL.revokeObjectURL(url);
  }, [jobs]);

  const applyBatchFormat = useCallback((format: string) => {
    if (!format) return;
    setJobs(prev =>
      prev.map(j => {
        if (j.status !== 'idle') return j;
        const targets = getTargetFormats(j.sourceExt);
        if (!targets.includes(format)) return j;
        return { ...j, targetExt: format, resultBlob: undefined };
      })
    );
  }, []);

  const removeJob = useCallback((id: string) =>
    setJobs(prev => prev.filter(j => j.id !== id)), []);

  const convertAll = useCallback(() => {
    jobs.filter(j => j.status === 'idle' && j.targetExt).forEach(convertJob);
  }, [jobs, convertJob]);

  const clearAll = useCallback(() => setJobs([]), []);

  const doneCount = jobs.filter(j => j.status === 'done').length;

  return {
    jobs,
    addFiles,
    updateJob,
    updateJobSettings,
    convertJob,
    downloadJob,
    downloadAllAsZip,
    applyBatchFormat,
    removeJob,
    convertAll,
    clearAll,
    doneCount,
  };
}
