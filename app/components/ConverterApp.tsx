'use client';

import { useState, useRef, useMemo, useEffect, useCallback, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getFileExtension,
  getTargetFormats,
  FORMATS,
  getFormatInfo,
  sharedSettings,
} from '@/lib/converters';
import { JobCard, describeError, type FileJob } from './JobCard';
import { HistoryPanel } from './HistoryPanel';
import { getHistory, type HistoryEntry } from '@/lib/history';
import { useLocale } from './LocaleProvider';
import { useJobManager } from '@/lib/useJobManager';
import ErrorBoundary from './ErrorBoundary';
import Footer from './Footer';
import { AppHeader } from './AppHeader';
import NetworkBadge from './NetworkBadge';
import { DragOverlay, DropZone } from './DropZone';
import { filesFromDrop, filesFromInput } from '@/lib/drop-files';
import { filesFromClipboard } from '@/lib/paste';
import { onLaunchFiles, takeSharedFiles } from '@/lib/launch';
import { DEFAULT_NAME_TEMPLATE } from '@/lib/filenames';

const LARGE_FILE_THRESHOLD_MB = 100;
const WARN_FILE_THRESHOLD_MB = 250;

function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(0);
}

interface ConverterAppProps {
  /** Landing pages preselect the pair they rank for, so a dropped file lands
   *  on the format the visitor searched for instead of the registry default. */
  preferredTarget?: string;
  /** SEO copy rendered above the drop zone on /convert/[pair] routes. */
  intro?: ReactNode;
}

// How long the Undo toast stays after a remove or Clear.
const UNDO_MS = 10_000;

export default function ConverterApp({ preferredTarget, intro }: ConverterAppProps = {}) {
  const {
    jobs,
    addFiles,
    updateJob,
    updateJobSettings,
    applySettingsToSimilar,
    convertJob,
    cancelJob,
    downloadJob,
    downloadAllAsZip,
    applyBatchFormat: applyBatch,
    removeJob,
    removed,
    undoRemove,
    dismissUndo,
    convertAll,
    clearAll,
    doneCount,
    moveJob,
    merge,
    mergeableCount,
    mergeToPdf,
    nameTemplate,
    setNameTemplate,
    nameFor,
  } = useJobManager({ preferredTarget, onHistoryUpdate: () => setHistory(getHistory()) });
  const [dragging, setDragging] = useState(false);
  const [dragCategory, setDragCategory] = useState<string | null>(null);
  const [batchFormat, setBatchFormat] = useState('');
  // Seeded empty, filled after mount: the prerender has no localStorage, so
  // reading it during the first render makes hydration disagree with the
  // server HTML (React #418) for anyone who has converted something before.
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement | null>(null);
  const { t } = useLocale();

  useEffect(() => setHistory(getHistory()), []);

  const largeFiles = useMemo(
    () =>
      jobs.filter((j) => {
        const cat = getFormatInfo(j.sourceExt)?.category;
        return (
          (cat === 'video' || cat === 'audio') &&
          j.file.size > LARGE_FILE_THRESHOLD_MB * 1024 * 1024
        );
      }),
    [jobs],
  );

  const groupedFormats = useMemo(() => {
    const groups: Record<string, typeof FORMATS> = {};
    for (const f of FORMATS) {
      if (!groups[f.category]) groups[f.category] = [];
      groups[f.category].push(f);
    }
    return groups;
  }, []);

  // The other jobs "apply to similar files" would change: same target, some
  // setting in common, not mid-conversion.
  const similarCount = (job: FileJob) =>
    jobs.filter(
      (other) =>
        other.id !== job.id &&
        other.status !== 'converting' &&
        Object.keys(sharedSettings(job, other)).length > 0,
    ).length;

  const applyBatchFormat = () => {
    if (!batchFormat) return;
    applyBatch(batchFormat);
  };

  const detectDragCategory = useCallback(
    (files: FileList) => {
      if (files.length === 0) return;
      const ext = getFileExtension(files[0].name);
      const info = getFormatInfo(ext);
      setDragCategory(info?.category ?? null);
    },
    [setDragCategory],
  );

  // Window-level drag event listeners to ensure dragging anywhere on the page
  // activates the drop overlay and prevents the browser from navigating away.
  useEffect(() => {
    let dragCounter = 0;

    const onWindowDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter++;
      if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
        setDragging(true);
        if (e.dataTransfer.items) {
          const files = e.dataTransfer.files;
          if (files && files.length > 0) detectDragCategory(files);
        }
      }
    };

    const onWindowDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        setDragging(false);
        setDragCategory(null);
      }
    };

    const onWindowDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    };

    const onWindowDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounter = 0;
      setDragging(false);
      setDragCategory(null);
      // Every drop lands here, the drop zone's included: folders are expanded
      // (entries must be read inside this handler, before any await).
      if (e.dataTransfer) {
        filesFromDrop(e.dataTransfer).then((files) => files.length && addFiles(files));
      }
    };

    window.addEventListener('dragenter', onWindowDragEnter);
    window.addEventListener('dragleave', onWindowDragLeave);
    window.addEventListener('dragover', onWindowDragOver);
    window.addEventListener('drop', onWindowDrop);

    return () => {
      window.removeEventListener('dragenter', onWindowDragEnter);
      window.removeEventListener('dragleave', onWindowDragLeave);
      window.removeEventListener('dragover', onWindowDragOver);
      window.removeEventListener('drop', onWindowDrop);
    };
  }, [addFiles, detectDragCategory]);

  // Keyboard shortcuts: Cmd/Ctrl + Enter converts all queued jobs; Cmd/Ctrl + Z
  // undoes the last remove or Clear (outside text fields, which keep their own undo).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        convertAll();
      }
      const typing = e.target instanceof HTMLElement && e.target.closest('input, textarea, select');
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'z' && removed.length && !typing) {
        e.preventDefault();
        undoRemove();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [convertAll, removed.length, undoRemove]);

  // Paste anywhere outside a text field: files and screenshots as they are,
  // text as a file named for what it looks like (lib/paste).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.closest('input, textarea, select') || target.isContentEditable)
      ) {
        return;
      }
      const files = filesFromClipboard(e.clipboardData);
      if (!files.length) return;
      e.preventDefault();
      addFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addFiles]);

  // Installed app: files from "Open with" and from the share sheet.
  const tookShared = useRef(false);
  useEffect(() => {
    onLaunchFiles(addFiles);
    if (tookShared.current) return;
    tookShared.current = true;
    const params = new URLSearchParams(window.location.search);
    if (!params.has('shared')) return;
    params.delete('shared');
    const rest = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''));
    void takeSharedFiles()
      .then((files) => files.length && addFiles(files))
      .catch(() => {});
  }, [addFiles]);

  // The Undo toast goes away on its own; the removed files are then let go.
  useEffect(() => {
    if (!removed.length) return;
    const timer = setTimeout(dismissUndo, UNDO_MS);
    return () => clearTimeout(timer);
  }, [removed, dismissUndo]);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
    if (e.dataTransfer.files.length) detectDragCategory(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragging(false);
    setDragCategory(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    setDragCategory(null);
    // Not addFiles: the drop bubbles on to the window listener, which adds the
    // files. Adding them here too put every dropped file in the list twice.
  };

  return (
    <main
      className="min-h-screen bg-app"
      style={{ fontFamily: 'var(--font-body)' }}
      role="main"
      aria-label={t('app.label')}
    >
      <AppHeader />

      {/* Full-viewport drag overlay active whenever files hover over window */}
      <AnimatePresence>
        {dragging && <DragOverlay key="overlay" dragCategory={dragCategory} />}
      </AnimatePresence>

      <ErrorBoundary
        labels={{ title: t('errors.boundary.title'), retry: t('errors.boundary.retry') }}
      >
        <div className="max-w-5xl mx-auto px-4 py-8">
          {intro}

          {/* Ambient Privacy & Local Telemetry Status */}
          <div
            className="flex items-center justify-between px-3.5 py-2 mb-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-xs text-[var(--text-muted)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-[var(--accent)]" />
              <span className="text-[var(--text-primary)] font-semibold tracking-wider">
                {t('status.local')}
              </span>
              <span className="hidden sm:inline text-[var(--text-muted)]">
                · {t('status.inBrowser')}
              </span>
            </div>
            {/* Measured, not asserted: the service worker's count (NetworkBadge). */}
            <NetworkBadge />
          </div>

          {/* Drop zone */}
          <input
            ref={inputRef}
            type="file"
            multiple
            onChange={(e) => {
              if (e.target.files) addFiles(filesFromInput(e.target.files));
              e.target.value = '';
            }}
            className="hidden"
            aria-hidden="true"
          />
          <input
            ref={(el) => {
              folderRef.current = el;
              // Not a React prop: set as an attribute so every browser sees it.
              el?.setAttribute('webkitdirectory', '');
            }}
            type="file"
            onChange={(e) => {
              if (e.target.files) addFiles(filesFromInput(e.target.files));
              e.target.value = '';
            }}
            className="hidden"
            aria-hidden="true"
          />
          <AnimatePresence>
            {(jobs.length === 0 || dragging) && (
              <DropZone
                key="dropzone"
                dragging={dragging}
                dragCategory={dragCategory}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onBrowse={() => inputRef.current?.click()}
                onBrowseFolder={() => folderRef.current?.click()}
              />
            )}
          </AnimatePresence>

          {/* Active jobs section */}
          <AnimatePresence>
            {jobs.length > 0 && (
              <motion.section
                key="jobs"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 100, damping: 20 }}
                aria-label={t('toolbar.files')}
              >
                {/* File size warning */}
                {largeFiles.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-4 px-4 py-3 rounded-xl border flex items-start gap-3"
                    style={{
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      borderColor: 'rgba(239, 68, 68, 0.3)',
                      color: 'var(--error)',
                    }}
                    role="alert"
                    aria-live="assertive"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="flex-shrink-0 mt-0.5"
                    >
                      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <div>
                      <p
                        className="text-xs font-semibold"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      >
                        {t('warning.largeFile')}
                      </p>
                      <p className="text-xs mt-0.5 opacity-80">
                        {largeFiles
                          .map((j) => `${j.file.name} (${formatMB(j.file.size)}MB)`)
                          .join(', ')}
                        {' — '}
                        {largeFiles.some((j) => j.file.size > WARN_FILE_THRESHOLD_MB * 1024 * 1024)
                          ? t('warning.mayFail')
                          : t('warning.slow')}
                      </p>
                    </div>
                  </motion.div>
                )}

                {/* Compact drop target when jobs exist */}
                <div
                  onClick={() => inputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={t('toolbar.addFiles')}
                  className="border border-dashed border-[var(--border-secondary)] hover:border-[var(--accent)] rounded-xl py-2.5 px-4 text-center cursor-pointer transition-all bg-[var(--bg-secondary)]/50 hover:bg-[var(--bg-secondary)] flex items-center justify-center gap-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-4 group"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    className="text-[var(--accent)]"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  <span>{t('toolbar.dropMore')}</span>
                </div>

                {/* Toolbar */}
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        inputRef.current?.click();
                      }}
                      className="px-4 py-2 border border-[var(--border-secondary)] rounded-lg text-xs text-[var(--text-muted)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] transition-all flex items-center gap-1.5 font-medium"
                      style={{ fontFamily: 'var(--font-mono)' }}
                      aria-label={t('toolbar.addFiles')}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                      {t('toolbar.addFiles')}
                    </button>
                    <button
                      onClick={() => folderRef.current?.click()}
                      className="px-4 py-2 border border-[var(--border-secondary)] rounded-lg text-xs text-[var(--text-muted)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] transition-all font-medium"
                      style={{ fontFamily: 'var(--font-mono)' }}
                      aria-label={t('toolbar.addFolder')}
                    >
                      {t('toolbar.addFolder')}
                    </button>

                    <span
                      className="text-xs text-[var(--text-muted)]"
                      style={{ fontFamily: 'var(--font-mono)' }}
                    >
                      {jobs.length} {t('toolbar.files')}
                      {doneCount > 0 && ` · ${doneCount} ${t('toolbar.done')}`}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {mergeableCount >= 2 && (
                      <button
                        onClick={mergeToPdf}
                        disabled={merge.status === 'running'}
                        className="px-4 py-2 border border-[var(--border-secondary)] rounded-lg text-xs text-[var(--text-muted)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] transition-all disabled:opacity-60"
                        style={{ fontFamily: 'var(--font-mono)' }}
                        aria-label={t('toolbar.mergePdf')}
                      >
                        {merge.status === 'running'
                          ? `${t('toolbar.merging')} ${merge.progress}%`
                          : `${t('toolbar.mergePdf')} (${mergeableCount})`}
                      </button>
                    )}

                    {doneCount > 0 && (
                      <button
                        onClick={downloadAllAsZip}
                        className="px-4 py-2 border border-[var(--border-secondary)] rounded-lg text-xs text-[var(--text-muted)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] transition-all"
                        style={{ fontFamily: 'var(--font-mono)' }}
                        aria-label={t('toolbar.zipAll')}
                      >
                        {t('toolbar.zipAll')}
                      </button>
                    )}

                    {jobs.some((j) => j.status === 'idle' && j.targetExt) && (
                      <button
                        onClick={convertAll}
                        className="px-4 py-2 bg-[var(--accent)] text-[var(--accent-text)] text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity flex items-center gap-1.5 shadow-sm"
                        style={{ fontFamily: 'var(--font-mono)' }}
                        aria-label={t('toolbar.convertAll')}
                        title={t('toolbar.shortcut')}
                      >
                        <span>{t('toolbar.convertAll')}</span>
                        <span className="opacity-60 text-xs hidden sm:inline font-normal">⌘↵</span>
                      </button>
                    )}

                    <button
                      onClick={clearAll}
                      className="px-3 py-2 text-xs text-[var(--text-muted)] hover:text-[var(--error)] transition-colors"
                      style={{ fontFamily: 'var(--font-mono)' }}
                      aria-label={t('toolbar.clear')}
                    >
                      {t('toolbar.clear')}
                    </button>
                  </div>
                </div>

                {merge.status === 'error' && (
                  <div
                    role="alert"
                    className="mb-4 px-4 py-3 rounded-xl border text-xs"
                    style={{
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      borderColor: 'rgba(239, 68, 68, 0.3)',
                      color: 'var(--error)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    <p className="font-semibold">{describeError(merge.error, 'pdf', t).title}</p>
                    <p className="mt-0.5 opacity-80">{merge.error.detail}</p>
                  </div>
                )}

                {/* Batch format selector */}
                {jobs.length > 1 && (
                  <div
                    className="flex items-center gap-2 mb-4"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
                      {t('toolbar.setAllTo')}
                    </span>
                    <div className="relative inline-flex items-center">
                      <select
                        value={batchFormat}
                        onChange={(e) => setBatchFormat(e.target.value)}
                        className="bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] text-[var(--text-primary)] text-xs rounded-lg pl-3 pr-8 py-1.5 appearance-none cursor-pointer hover:border-[var(--border-hover)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                        aria-label={t('toolbar.setAllTo')}
                      >
                        <option value="">{t('toolbar.pickFormat')}</option>
                        {Object.entries(groupedFormats).map(([category, formats]) => (
                          <optgroup key={category} label={category.toUpperCase()}>
                            {formats.map((f) => (
                              <option key={f.ext} value={f.ext}>
                                .{f.ext.toUpperCase()} ({f.label})
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      <svg
                        className="absolute right-2.5 pointer-events-none text-[var(--text-muted)]"
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        aria-hidden="true"
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </div>
                    <button
                      onClick={applyBatchFormat}
                      disabled={!batchFormat}
                      className="px-3 py-1.5 text-xs border border-[var(--border-secondary)] rounded-lg text-[var(--text-muted)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed transition-all font-medium"
                      aria-label={t('toolbar.apply')}
                    >
                      {t('toolbar.apply')}
                    </button>
                  </div>
                )}

                {/* Output names */}
                <div
                  className="flex items-center gap-2 mb-4 flex-wrap"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  <label
                    htmlFor="name-template"
                    className="text-xs text-[var(--text-muted)] uppercase tracking-wider"
                  >
                    {t('toolbar.nameAs')}
                  </label>
                  <input
                    id="name-template"
                    type="text"
                    value={nameTemplate}
                    onChange={(e) => setNameTemplate(e.target.value)}
                    placeholder={DEFAULT_NAME_TEMPLATE}
                    title={t('toolbar.nameHint')}
                    className="bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] text-[var(--text-primary)] text-xs rounded-lg px-3 py-1.5 w-56 focus:outline-none focus:border-[var(--accent)]"
                  />
                  {jobs[0]?.targetExt && (
                    <span
                      className="text-xs text-[var(--text-muted)] truncate"
                      data-testid="name-preview"
                    >
                      → {nameFor(jobs[0])}
                    </span>
                  )}
                  <span className="text-xs text-[var(--text-muted)] w-full sm:w-auto">
                    {t('toolbar.nameHint')}
                  </span>
                </div>

                {/* Job cards */}
                <div className="space-y-3" role="list" aria-label={t('toolbar.files')}>
                  <AnimatePresence>
                    {jobs.map((job, index) => (
                      <JobCard
                        key={job.id}
                        job={job}
                        onTargetChange={(ext) =>
                          updateJob(job.id, {
                            targetExt: ext,
                            status: 'idle',
                            resultBlob: undefined,
                          })
                        }
                        onConvert={() => convertJob(job)}
                        onCancel={() => cancelJob(job.id)}
                        onDownload={() => downloadJob(job)}
                        onRemove={() => removeJob(job.id)}
                        onSettingsChange={(patch) => updateJobSettings(job.id, patch)}
                        similarCount={similarCount(job)}
                        onApplyToSimilar={() => applySettingsToSimilar(job.id)}
                        onMoveUp={index > 0 ? () => moveJob(job.id, -1) : undefined}
                        onMoveDown={index < jobs.length - 1 ? () => moveJob(job.id, 1) : undefined}
                        t={t}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          {/* How it works */}
          {jobs.length === 0 && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 100, damping: 20, delay: 0.3 }}
              className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4"
              aria-label={t('howItWorks.heading')}
            >
              {[1, 2, 3].map((n, i) => (
                <motion.div
                  key={n}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 100, damping: 20, delay: 0.3 + i * 0.1 }}
                  className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-2xl p-6 hover:border-[var(--border-hover)] transition-colors"
                >
                  <div
                    style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.08em' }}
                    className="text-3xl text-[var(--accent)] mb-3"
                  >
                    {String(n).padStart(2, '0')}
                  </div>
                  <div
                    style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.08em' }}
                    className="text-xl text-[var(--text-primary)] mb-2"
                  >
                    {t(`howItWorks.step${n}.title`)}
                  </div>
                  <p className="text-[var(--text-muted)] text-sm leading-relaxed">
                    {t(`howItWorks.step${n}.desc`)}
                  </p>
                </motion.div>
              ))}
            </motion.section>
          )}

          {/* History is always accessible */}
          <HistoryPanel entries={history} onClear={() => setHistory([])} t={t} />
        </div>

        <AnimatePresence>
          {removed.length > 0 && (
            // Centred by the flex wrapper: framer-motion's transform would
            // override a translate-x centring on the toast itself.
            <motion.div
              key="undo"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              className="fixed bottom-4 inset-x-4 z-50 flex justify-center pointer-events-none"
            >
              <div
                role="status"
                className="pointer-events-auto flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-secondary)] shadow-lg text-xs max-w-full"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                <span className="text-[var(--text-secondary)] truncate">
                  {removed.length === 1
                    ? t('toolbar.removedOne').replace('{name}', removed[0].file.name)
                    : t('toolbar.removedMany').replace('{n}', String(removed.length))}
                </span>
                <button
                  onClick={undoRemove}
                  className="font-semibold text-[var(--accent)] hover:underline flex-shrink-0"
                >
                  {t('toolbar.undo')}
                </button>
                <button
                  onClick={dismissUndo}
                  aria-label={t('toolbar.dismiss')}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] flex-shrink-0"
                >
                  ×
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <Footer navLabel={t('footer.images')}>
          <span>{t('footer.images')}</span>
          <span>{t('footer.video')}</span>
          <span>{t('footer.audio')}</span>
          <span>{t('footer.documents')}</span>
          <span>{t('footer.data')}</span>
        </Footer>
      </ErrorBoundary>
    </main>
  );
}
