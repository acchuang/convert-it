'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  convertFile,
  getFileExtension,
  getTargetFormats,
  FORMATS,
  DEFAULT_SETTINGS,
  getFormatInfo,
} from '@/lib/converters';
import type { ConversionSettings } from '@/lib/types';
import { JobCard, type FileJob } from './components/JobCard';
import { HistoryPanel } from './components/HistoryPanel';
import { getHistory, addHistoryEntry, type HistoryEntry } from '@/lib/history';
import { useStats, formatCount } from '@/lib/useStats';
import { useTheme } from './components/ThemeProvider';
import { LanguageSelector } from './components/LanguageSelector';

const CATEGORY_COLORS: Record<string, string> = {
  image: '#FF4D00',
  document: '#00C2FF',
  data: '#C8FF00',
  video: '#FF00C8',
  audio: '#00FF88',
};

const LARGE_FILE_THRESHOLD_MB = 200;
const WARN_FILE_THRESHOLD_MB = 500;

function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(0);
}

export default function HomePage() {
  const [jobs, setJobs] = useState<FileJob[]>([]);
  const [dragging, setDragging] = useState(false);
  const [dragCategory, setDragCategory] = useState<string | null>(null);
  const [batchFormat, setBatchFormat] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>(() => getHistory());
  const inputRef = useRef<HTMLInputElement>(null);
  const stats = useStats();
  const { theme, toggle: toggleTheme } = useTheme();

  const largeFiles = useMemo(() =>
    jobs.filter(j => {
      const cat = getFormatInfo(j.sourceExt)?.category;
      return (cat === 'video' || cat === 'audio') && j.file.size > LARGE_FILE_THRESHOLD_MB * 1024 * 1024;
    }), [jobs]
  );

  const addFiles = useCallback((files: FileList | File[]) => {
    const newJobs: FileJob[] = Array.from(files).map(file => ({
      id: crypto.randomUUID(),
      file,
      sourceExt: getFileExtension(file.name),
      targetExt: getTargetFormats(getFileExtension(file.name))[0] ?? null,
      status: 'idle',
      progress: 0,
      settings: { ...DEFAULT_SETTINGS },
    }));
    setJobs(prev => [...prev, ...newJobs]);
  }, []);

  const detectDragCategory = useCallback((files: FileList) => {
    if (files.length === 0) return;
    const ext = getFileExtension(files[0].name);
    const info = getFormatInfo(ext);
    setDragCategory(info?.category ?? null);
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
    if (e.dataTransfer.files.length) detectDragCategory(e.dataTransfer.files);
  }, [detectDragCategory]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragging(false);
    setDragCategory(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      setDragCategory(null);
      if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const updateJob = (id: string, patch: Partial<FileJob>) =>
    setJobs(prev => prev.map(j => (j.id === id ? { ...j, ...patch } : j)));

  const updateJobSettings = (id: string, patch: Partial<ConversionSettings>) =>
    setJobs(prev =>
      prev.map(j =>
        j.id === id
          ? { ...j, settings: { ...j.settings, ...patch }, status: 'idle', resultBlob: undefined }
          : j
      )
    );

  const convertJob = async (job: FileJob) => {
    if (!job.targetExt) return;
    updateJob(job.id, { status: 'converting', progress: 10 });
    try {
      await new Promise(r => setTimeout(r, 300));
      updateJob(job.id, { progress: 50 });
      const blob = await convertFile(job.file, job.targetExt, job.settings);
      updateJob(job.id, { status: 'done', resultBlob: blob, progress: 100 });

      addHistoryEntry({
        filename: job.file.name,
        sourceExt: job.sourceExt,
        targetExt: job.targetExt,
        convertedAt: new Date().toISOString(),
        fileSize: job.file.size,
        resultSize: blob.size,
      });
      setHistory(getHistory());
    } catch (err) {
      updateJob(job.id, {
        status: 'error',
        error: err instanceof Error ? err.message : 'Conversion failed',
        progress: 0,
      });
    }
  };

  const downloadJob = (job: FileJob) => {
    if (!job.resultBlob || !job.targetExt) return;
    const url = URL.createObjectURL(job.resultBlob);
    const a = document.createElement('a');
    const base = job.file.name.replace(/\.[^.]+$/, '');
    a.href = url;
    a.download = `${base}.${job.targetExt}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadAllAsZip = async () => {
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
  };

  const applyBatchFormat = () => {
    if (!batchFormat) return;
    setJobs(prev =>
      prev.map(j => {
        if (j.status !== 'idle') return j;
        const targets = getTargetFormats(j.sourceExt);
        if (!targets.includes(batchFormat)) return j;
        return { ...j, targetExt: batchFormat, resultBlob: undefined };
      })
    );
  };

  const removeJob = (id: string) =>
    setJobs(prev => prev.filter(j => j.id !== id));

  const convertAll = () => {
    jobs.filter(j => j.status === 'idle' && j.targetExt).forEach(convertJob);
  };

  const clearAll = () => setJobs([]);

  const doneCount = jobs.filter(j => j.status === 'done').length;

  return (
    <main className="min-h-screen bg-app" style={{ fontFamily: 'var(--font-body)' }} role="main" aria-label="CONVERT file converter">
      {/* Header */}
      <header
        className="border-b border-app px-6 py-4 flex items-center justify-between sticky top-0 z-50 backdrop-blur-sm"
        style={{ backgroundColor: 'var(--header-bg)' }}
        role="banner"
      >
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.08em' }}
          className="text-3xl tracking-wide"
        >
          <span className="text-[var(--accent)]">Convert</span>
          <span className="text-[var(--text-primary)]">-it</span>
        </motion.div>

        <div className="flex items-center gap-4">
          {/* Stats */}
          {stats && (
            <div className="flex items-center gap-3 text-xs" style={{ fontFamily: 'var(--font-mono)' }} aria-live="polite" aria-label="Site statistics">
              <span className="text-[var(--text-dim)]" title="All-time visits">
                {formatCount(stats.total)} total
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" title="Active sessions" />
              <span className="text-[var(--text-dim)]">{formatCount(stats.active)} online</span>
            </div>
          )}

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-[var(--text-dim)] hover:text-[var(--accent)] hover:bg-[var(--bg-tertiary)] transition-all"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
            )}
          </button>

          {/* Language */}
          <LanguageSelector />


          {/* About */}
          <Link
            href="/about"
            className="text-xs text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            ABOUT
          </Link>

          {/* Buy Me a Coffee */}
          <a
            href="https://buymeacoffee.com/acchuang"
            target="_blank"
            rel="noopener noreferrer"
            className="w-9 h-9 flex items-center justify-center rounded-lg text-[var(--text-dim)] hover:text-[#FF813F] hover:bg-[var(--bg-tertiary)] transition-all"
            aria-label="Buy me a coffee"
            title="Buy me a coffee"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 8h-1V6c0-2.21-1.79-4-4-4H4c-2.21 0-4 1.79-4 4v10c0 2.21 1.79 4 4 4h11c2.21 0 4-1.79 4-4v-1h1c1.66 0 3-1.34 3-3v-1c0-1.66-1.34-3-3-3zm-9 10H4V6h7v12zm9-3h-1V9h1c.55 0 1 .45 1 1v1c0 .55-.45 1-1 1z"/>
            </svg>
          </a>

          {/* GitHub link */}
          <a
            href="https://github.com/acchuang/convert-it"
            target="_blank"
            rel="noopener noreferrer"
            className="w-9 h-9 flex items-center justify-center rounded-lg text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-all"
            aria-label="View source on GitHub"
            title="View source on GitHub"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
          </a>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Drop zone */}
        <AnimatePresence>
          {jobs.length === 0 || dragging ? (
            <motion.section
              key="dropzone"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="mb-10"
              aria-label="File upload area"
            >
              <div
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
                role="button"
                tabIndex={0}
                aria-label="Click or drag files here to start converting"
                className={`
                  relative border-2 border-dashed rounded-3xl p-12 text-center cursor-pointer
                  transition-all duration-300
                  ${dragging
                    ? 'border-[var(--accent)] bg-[var(--accent)]/5 scale-[1.01]'
                    : 'border-[var(--border-secondary)] hover:border-[var(--border-hover)] bg-[var(--bg-secondary)]'
                  }
                `}
              >
                {/* Drag visual indicator */}
                {dragging && dragCategory && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  >
                    <div
                      className="text-6xl font-bold"
                      style={{
                        fontFamily: 'var(--font-display)',
                        color: CATEGORY_COLORS[dragCategory] ?? '#C8FF00',
                        letterSpacing: '0.08em',
                      }}
                    >
                      {dragCategory.toUpperCase()}
                    </div>
                  </motion.div>
                )}

                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
                  className="hidden"
                  aria-hidden="true"
                />

                <div className={dragging ? 'opacity-0' : 'opacity-100 transition-opacity duration-200'}>
                  <div
                    style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.12em' }}
                    className="text-6xl text-[var(--accent)] mb-4"
                  >
                    +
                  </div>
                  <div
                    style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.06em' }}
                    className="text-xl text-[var(--text-primary)] mb-2"
                  >
                    DRAG & DROP
                  </div>
                  <p className="text-[var(--text-muted)] text-sm mb-4" style={{ fontFamily: 'var(--font-mono)' }}>
                    or click to browse
                  </p>

                  <div className="flex flex-wrap justify-center gap-2">
                    {(['image', 'video', 'audio', 'document', 'data'] as const).map(cat => (
                      <span
                        key={cat}
                        className="px-3 py-1 text-xs rounded-full border opacity-60"
                        style={{
                          borderColor: CATEGORY_COLORS[cat] + '40',
                          color: CATEGORY_COLORS[cat],
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {cat.toUpperCase()}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </motion.section>
          ) : null}
        </AnimatePresence>

        {/* Active jobs section */}
        <AnimatePresence>
          {jobs.length > 0 && (
            <motion.section
              key="jobs"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              aria-label="Conversion jobs"
            >
              {/* File size warning */}
              {largeFiles.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-4 px-4 py-3 rounded-xl border flex items-start gap-3"
                  style={{
                    backgroundColor: 'var(--error)',
                    background: 'rgba(239, 68, 68, 0.1)',
                    borderColor: 'rgba(239, 68, 68, 0.3)',
                    color: 'var(--error)',
                  }}
                  role="alert"
                  aria-live="assertive"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 mt-0.5">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <div>
                    <p className="text-xs font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>
                      Large file detected
                    </p>
                    <p className="text-xs mt-0.5 opacity-80">
                      {largeFiles.map(j => `${j.file.name} (${formatMB(j.file.size)}MB)`).join(', ')}
                      {largeFiles.some(j => j.file.size > WARN_FILE_THRESHOLD_MB * 1024 * 1024)
                        ? ' — Files over 500MB may fail due to browser memory limits.'
                        : ' — Large files may take longer to process.'}
                    </p>
                  </div>
                </motion.div>
              )}

              {/* Toolbar */}
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { inputRef.current?.click(); }}
                    className="px-4 py-2 border border-[var(--border-secondary)] rounded-lg text-xs text-[var(--text-muted)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] transition-all flex items-center gap-1.5"
                    style={{ fontFamily: 'var(--font-mono)' }}
                    aria-label="Add more files"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    ADD FILES
                  </button>

                  <span className="text-xs text-[var(--text-dim)]" style={{ fontFamily: 'var(--font-mono)' }}>
                    {jobs.length} file{jobs.length !== 1 ? 's' : ''}
                    {doneCount > 0 && ` · ${doneCount} done`}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {doneCount > 0 && (
                    <button
                      onClick={downloadAllAsZip}
                      className="px-4 py-2 border border-[var(--border-secondary)] rounded-lg text-xs text-[var(--text-muted)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] transition-all"
                      style={{ fontFamily: 'var(--font-mono)' }}
                      aria-label="Download all as ZIP"
                    >
                      ↓ ZIP ALL
                    </button>
                  )}

                  {jobs.some(j => j.status === 'idle' && j.targetExt) && (
                    <button
                      onClick={convertAll}
                      className="px-4 py-2 bg-[var(--accent)] text-[#0A0A0A] text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity"
                      style={{ fontFamily: 'var(--font-mono)' }}
                      aria-label="Convert all files"
                    >
                      CONVERT ALL →
                    </button>
                  )}

                  <button
                    onClick={clearAll}
                    className="px-3 py-2 text-xs text-[var(--text-dim)] hover:text-[var(--error)] transition-colors"
                    style={{ fontFamily: 'var(--font-mono)' }}
                    aria-label="Clear all jobs"
                  >
                    CLEAR
                  </button>
                </div>
              </div>

              {/* Batch format selector */}
              {jobs.length > 1 && (
                <div className="flex items-center gap-2 mb-4" style={{ fontFamily: 'var(--font-mono)' }}>
                  <span className="text-xs text-[var(--text-dim)] uppercase tracking-wider">Set all to</span>
                  <select
                    value={batchFormat}
                    onChange={e => setBatchFormat(e.target.value)}
                    className="bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] text-[var(--text-primary)] text-xs rounded-lg px-3 py-1.5 appearance-none cursor-pointer hover:border-[var(--border-hover)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                    aria-label="Batch target format"
                  >
                    <option value="">— pick format —</option>
                    {FORMATS.map(f => (
                      <option key={f.ext} value={f.ext}>.{f.ext.toUpperCase()}</option>
                    ))}
                  </select>
                  <button
                    onClick={applyBatchFormat}
                    disabled={!batchFormat}
                    className="px-3 py-1.5 text-xs border border-[var(--border-secondary)] rounded-lg text-[var(--text-muted)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    aria-label="Apply batch format"
                  >
                    APPLY
                  </button>
                </div>
              )}

              {/* Job cards */}
              <div className="space-y-3" role="list" aria-label="File conversion jobs">
                <AnimatePresence>
                  {jobs.map(job => (
                    <JobCard
                      key={job.id}
                      job={job}
                      onTargetChange={ext => updateJob(job.id, { targetExt: ext, status: 'idle', resultBlob: undefined })}
                      onConvert={() => convertJob(job)}
                      onDownload={() => downloadJob(job)}
                      onRemove={() => removeJob(job.id)}
                      onSettingsChange={patch => updateJobSettings(job.id, patch)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* How it works + History (shown when no active jobs) */}
        {jobs.length === 0 && (
          <>
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4"
              aria-label="How it works"
            >
              {[
                { num: '01', title: 'DROP', desc: 'Drag and drop your files or click to browse from your device.' },
                { num: '02', title: 'SELECT', desc: 'Choose the target format from the available conversions.' },
                { num: '03', title: 'CONVERT', desc: 'Instant conversion in your browser. No uploads, no data leaves your device.' },
              ].map((step, i) => (
                <motion.div
                  key={step.num}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.1 }}
                  className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-2xl p-6 hover:border-[var(--border-hover)] transition-colors"
                >
                  <div
                    style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.08em' }}
                    className="text-5xl text-[var(--accent)] mb-3"
                  >
                    {step.num}
                  </div>
                  <div
                    style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.08em' }}
                    className="text-xl text-[var(--text-primary)] mb-2"
                  >
                    {step.title}
                  </div>
                  <p className="text-[var(--text-muted)] text-sm leading-relaxed">{step.desc}</p>
                </motion.div>
              ))}
            </motion.section>

            <HistoryPanel
              entries={history}
              onClear={() => setHistory([])}
            />
          </>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-[var(--border-primary)] px-6 py-6 mt-16" role="contentinfo">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <span style={{ fontFamily: 'var(--font-mono)' }} className="text-xs text-[var(--text-dim)]">
            © 2025 CONVERT — All conversions happen in your browser
          </span>
          <nav className="flex gap-6 text-xs text-[var(--text-dim)]" style={{ fontFamily: 'var(--font-mono)' }} aria-label="Supported formats">
            <span>Images</span>
            <span>Video</span>
            <span>Audio</span>
            <span>Documents</span>
            <span>Data</span>
          </nav>
        </div>
      </footer>
    </main>
  );
}
