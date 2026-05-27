'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getFileExtension,
  getTargetFormats,
  FORMATS,
  getFormatInfo,
} from '@/lib/converters';
import { JobCard, type FileJob } from './components/JobCard';
import { HistoryPanel } from './components/HistoryPanel';
import { getHistory, type HistoryEntry } from '@/lib/history';
import { useStats, formatCount } from '@/lib/useStats';
import { useTheme } from './components/ThemeProvider';
import { LanguageSelector } from './components/LanguageSelector';
import { useLocale } from './components/LocaleProvider';
import { useJobManager } from '@/lib/useJobManager';
import ErrorBoundary from './components/ErrorBoundary';

const CATEGORY_COLORS: Record<string, string> = {
  image: '#FF4D00',
  document: '#00C2FF',
  data: '#AAFF44',
  video: '#FF00C8',
  audio: '#00E5A0',
};

const LARGE_FILE_THRESHOLD_MB = 200;
const WARN_FILE_THRESHOLD_MB = 500;

function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(0);
}

const ALL_CATEGORIES = ['image', 'video', 'audio', 'document', 'data'] as const;

export default function HomePage() {
  const {
    jobs,
    addFiles,
    updateJob,
    updateJobSettings,
    convertJob,
    downloadJob,
    downloadAllAsZip,
    applyBatchFormat: applyBatch,
    removeJob,
    convertAll,
    clearAll,
    doneCount,
  } = useJobManager({ onHistoryUpdate: () => setHistory(getHistory()) });
  const [dragging, setDragging] = useState(false);
  const [dragCategory, setDragCategory] = useState<string | null>(null);
  const [batchFormat, setBatchFormat] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>(() => getHistory());
  const inputRef = useRef<HTMLInputElement>(null);
  const stats = useStats();
  const { theme, toggle: toggleTheme } = useTheme();
  const { t } = useLocale();

  const largeFiles = useMemo(() =>
    jobs.filter(j => {
      const cat = getFormatInfo(j.sourceExt)?.category;
      return (cat === 'video' || cat === 'audio') && j.file.size > LARGE_FILE_THRESHOLD_MB * 1024 * 1024;
    }), [jobs]
  );

  const applyBatchFormat = () => {
    if (!batchFormat) return;
    applyBatch(batchFormat);
  };

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

  return (
    <main className="min-h-screen bg-app" style={{ fontFamily: 'var(--font-body)' }} role="main" aria-label="Convert-it file converter">
      {/* Header */}
      <header
        className="border-b border-app px-6 py-4 flex items-center justify-between sticky top-0 z-50 backdrop-blur-sm"
        style={{ backgroundColor: 'var(--header-bg)' }}
        role="banner"
      >
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: 'spring', stiffness: 100, damping: 20 }}
          style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.08em' }}
          className="text-3xl tracking-wide"
        >
          <span className="text-[var(--accent)]">Convert</span>
          <span className="text-[var(--text-primary)]">-it</span>
        </motion.div>

        <div className="flex items-center gap-4">
          {stats && (
            <div className="flex items-center gap-3 text-xs" style={{ fontFamily: 'var(--font-mono)' }} aria-live="polite" aria-label={t('header.online')}>
              <span className="text-[var(--text-secondary)]" title={t('header.totalVisits')}>
                {formatCount(stats.total)} {t('header.totalVisits')}
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" title="Active" />
              <span className="text-[var(--text-secondary)]">{formatCount(stats.active)} {t('header.online')}</span>
            </div>
          )}

          <LanguageSelector />

          <button
            onClick={toggleTheme}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-tertiary)] transition-all"
            aria-label={theme === 'dark' ? t('header.themeLight') : t('header.themeDark')}
            title={theme === 'dark' ? t('header.themeLight') : t('header.themeDark')}
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

          {/* About */}
          <Link
            href="/about"
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {t('header.about')}
          </Link>

          {/* Buy Me a Coffee */}
          <a
            href="https://buymeacoffee.com/acchuang"
            target="_blank"
            rel="noopener noreferrer"
            className="w-9 h-9 flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:text-[#FF813F] hover:bg-[var(--bg-tertiary)] transition-all"
            aria-label={t('header.buyCoffee')}
            title={t('header.buyCoffee')}
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
            className="w-9 h-9 flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-all"
            aria-label={t('header.github')}
            title={t('header.github')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
          </a>
        </div>
      </header>

      <ErrorBoundary>
        <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Drop zone */}
        <AnimatePresence>
          {jobs.length === 0 || dragging ? (
            <motion.section
              key="dropzone"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ type: 'spring', stiffness: 100, damping: 20 }}
              className="mb-10"
              aria-label={t('dropzone.title')}
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
                aria-label={t('dropzone.subtitle')}
                className={`
                  relative border-2 border-dashed rounded-3xl p-12 text-center cursor-pointer
                  transition-all duration-300
                  ${dragging
                    ? 'border-[var(--accent)] bg-[var(--accent)]/5 scale-[1.01]'
                    : 'border-[var(--border-secondary)] hover:border-[var(--border-hover)] bg-[var(--bg-secondary)]'
                  }
                `}
              >
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
                      {t(`dropzone.${dragCategory}`)}
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
                    style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.06em' }}
                    className="text-6xl text-[var(--accent)] mb-4"
                  >
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>
                  <div
                    style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.06em' }}
                    className="text-xl text-[var(--text-primary)] mb-2"
                  >
                    {t('dropzone.title')}
                  </div>
                  <p className="text-[var(--text-muted)] text-sm mb-4" style={{ fontFamily: 'var(--font-mono)' }}>
                    {t('dropzone.subtitle')}
                  </p>

                  <div className="flex flex-wrap justify-center gap-2">
                    {ALL_CATEGORIES.map(cat => (
                      <span
                        key={cat}
                        className="px-3 py-1 text-xs rounded-full border opacity-60"
                        style={{
                          borderColor: CATEGORY_COLORS[cat] + '40',
                          color: CATEGORY_COLORS[cat],
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {t(`dropzone.${cat}`)}
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
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 mt-0.5">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <div>
                    <p className="text-xs font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>
                      {t('warning.largeFile')}
                    </p>
                    <p className="text-xs mt-0.5 opacity-80">
                      {largeFiles.map(j => `${j.file.name} (${formatMB(j.file.size)}MB)`).join(', ')}
                      {' — '}
                      {largeFiles.some(j => j.file.size > WARN_FILE_THRESHOLD_MB * 1024 * 1024)
                        ? t('warning.over500')
                        : t('warning.over200')}
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
                    aria-label={t('toolbar.addFiles')}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    {t('toolbar.addFiles')}
                  </button>

                  <span className="text-xs text-[var(--text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
                    {jobs.length} {t('toolbar.files')}
                    {doneCount > 0 && ` · ${doneCount} ${t('toolbar.done')}`}
                  </span>
                </div>

                <div className="flex items-center gap-2">
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

                  {jobs.some(j => j.status === 'idle' && j.targetExt) && (
                    <button
                      onClick={convertAll}
                      className="px-4 py-2 bg-[var(--accent)] text-[var(--accent-text)] text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity"
                      style={{ fontFamily: 'var(--font-mono)' }}
                      aria-label={t('toolbar.convertAll')}
                    >
                      {t('toolbar.convertAll')}
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

              {/* Batch format selector */}
              {jobs.length > 1 && (
                <div className="flex items-center gap-2 mb-4" style={{ fontFamily: 'var(--font-mono)' }}>
                  <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider">{t('toolbar.setAllTo')}</span>
                  <select
                    value={batchFormat}
                    onChange={e => setBatchFormat(e.target.value)}
                    className="bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] text-[var(--text-primary)] text-xs rounded-lg px-3 py-1.5 appearance-none cursor-pointer hover:border-[var(--border-hover)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                    aria-label={t('toolbar.setAllTo')}
                  >
                    <option value="">{t('toolbar.pickFormat')}</option>
                    {FORMATS.map(f => (
                      <option key={f.ext} value={f.ext}>.{f.ext.toUpperCase()}</option>
                    ))}
                  </select>
                  <button
                    onClick={applyBatchFormat}
                    disabled={!batchFormat}
                    className="px-3 py-1.5 text-xs border border-[var(--border-secondary)] rounded-lg text-[var(--text-muted)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    aria-label={t('toolbar.apply')}
                  >
                    {t('toolbar.apply')}
                  </button>
                </div>
              )}

              {/* Job cards */}
              <div className="space-y-3" role="list" aria-label={t('toolbar.files')}>
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
                      t={t}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* How it works + History */}
        {jobs.length === 0 && (
          <>
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
                  <p className="text-[var(--text-muted)] text-sm leading-relaxed">{t(`howItWorks.step${n}.desc`)}</p>
                </motion.div>
              ))}
            </motion.section>

            <HistoryPanel
              entries={history}
              onClear={() => setHistory([])}
              t={t}
            />
          </>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-[var(--border-primary)] px-6 py-6 mt-16" role="contentinfo">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <span style={{ fontFamily: 'var(--font-mono)' }} className="text-xs text-[var(--text-muted)]">
            {t('footer.copyright')}
          </span>
          <nav className="flex gap-6 text-xs text-[var(--text-muted)]" style={{ fontFamily: 'var(--font-mono)' }} aria-label={t('footer.images')}>
            <span>{t('footer.images')}</span>
            <span>{t('footer.video')}</span>
            <span>{t('footer.audio')}</span>
            <span>{t('footer.documents')}</span>
            <span>{t('footer.data')}</span>
          </nav>
        </div>
      </footer>
      </ErrorBoundary>
    </main>
  );
}
