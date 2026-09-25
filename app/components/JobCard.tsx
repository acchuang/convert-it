'use client';

import { useState } from 'react';
import type { ConversionFailure } from '@/lib/errors';
import { motion, AnimatePresence } from 'framer-motion';
import { getTargetFormats, getFormatInfo, formatFileSize, settingsFor } from '@/lib/converters';
import type { ConversionSettings } from '@/lib/types';
import { PreviewPanel } from './PreviewPanel';
import { SettingsPanel } from './SettingsPanel';

export interface FileJob {
  id: string;
  file: File;
  sourceExt: string;
  targetExt: string | null;
  status: 'idle' | 'converting' | 'done' | 'error';
  resultBlob?: Blob;
  error?: ConversionFailure;
  progress: number;
  stage?: string;
  settings: ConversionSettings;
  /** Folder the file came from within a dropped/picked folder ('' or unset: top level). */
  folder?: string;
  /** Pixel size of an image result, for {w}x{h} in the name template. */
  resultWidth?: number;
  resultHeight?: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  image: '#FF4D00',
  document: '#00C2FF',
  data: '#AAFF44',
  video: '#FF00C8',
  audio: '#00E5A0',
};

const TEXT_FORMATS = new Set(['json', 'csv', 'xml', 'yaml', 'tsv', 'md', 'html', 'txt']);

const ERROR_KEYS: Record<ConversionFailure['code'], string> = {
  'too-large': 'tooLarge',
  'out-of-memory': 'outOfMemory',
  'corrupt-input': 'corruptInput',
  unsupported: 'unsupported',
  'engine-load': 'engineLoad',
  'invalid-settings': 'invalidSettings',
  unknown: 'unknown',
};

/** Localized title and hint for a failure, with {placeholders} filled in. */
export function describeError(
  failure: ConversionFailure,
  sourceExt: string,
  t: (key: string) => string,
): { title: string; hint: string } {
  const fill = (text: string) =>
    text.replace(/\{(\w+)\}/g, (whole, name: string) => {
      if (name === 'ext') return sourceExt;
      const value = failure.params?.[name];
      return value === undefined ? whole : String(value);
    });
  const key = `errors.${ERROR_KEYS[failure.code] ?? 'unknown'}`;
  return { title: fill(t(`${key}.title`)), hint: fill(t(`${key}.hint`)) };
}

interface JobCardProps {
  job: FileJob;
  onTargetChange: (ext: string) => void;
  onConvert: () => void;
  onCancel: () => void;
  onDownload: () => void;
  onRemove: () => void;
  onSettingsChange: (patch: Partial<ConversionSettings>) => void;
  /** Reorder within the list (merge order); omitted at either end. */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  t: (key: string) => string;
}

export function JobCard({
  job,
  onTargetChange,
  onConvert,
  onCancel,
  onDownload,
  onRemove,
  onSettingsChange,
  onMoveUp,
  onMoveDown,
  t,
}: JobCardProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const info = getFormatInfo(job.sourceExt);
  const category = info?.category ?? 'document';
  const categoryColor = CATEGORY_COLORS[category] ?? '#666';
  const targets = getTargetFormats(job.sourceExt);
  const canConfigure = settingsFor(job.sourceExt, job.targetExt).length > 0;
  const canPreview =
    job.status === 'done' &&
    !!job.resultBlob &&
    !!job.targetExt &&
    job.resultBlob.type !== 'application/zip';
  const isTextResult = job.targetExt ? TEXT_FORMATS.has(job.targetExt) : false;

  // A converter that silently doubles a file is a bug the user can only see if
  // we show the delta, so this renders for growth as well as shrinkage.
  const sizeDelta =
    job.status === 'done' && job.resultBlob && job.file.size > 0
      ? {
          resultSize: job.resultBlob.size,
          pct: Math.round((job.resultBlob.size / job.file.size - 1) * 100),
        }
      : null;

  const copyResult = async () => {
    if (!job.resultBlob) return;
    try {
      const text = await job.resultBlob.text();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyFailed(true);
      setTimeout(() => setCopyFailed(false), 2000);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ type: 'spring', stiffness: 100, damping: 20 }}
      className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-2xl p-4 hover:border-[var(--border-hover)] transition-colors shadow-sm"
      role="listitem"
      aria-label={`${job.file.name}`}
    >
      {/* Tier 1: File Identity, Formats & Settings/Remove */}
      <div className="flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
        <div className="flex items-center gap-2.5 min-w-0 flex-1 flex-wrap sm:flex-nowrap">
          <div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: categoryColor }}
            aria-hidden="true"
          />

          <div className="min-w-0 flex-shrink truncate">
            <p className="text-sm font-medium text-primary truncate" title={job.file.name}>
              {job.file.name}
            </p>
            <p
              className="text-xs text-[var(--text-muted)] truncate"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {formatFileSize(job.file.size)}
            </p>
          </div>

          <div
            className="flex items-center gap-1.5 flex-shrink-0"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            <span
              className="px-2 py-0.5 text-xs rounded-md border flex-shrink-0 font-medium"
              style={{
                borderColor: categoryColor + '40',
                color: categoryColor,
              }}
            >
              .{job.sourceExt.toUpperCase()}
            </span>

            <span className="text-[var(--text-muted)] text-xs flex-shrink-0" aria-hidden="true">
              →
            </span>

            {targets.length > 0 ? (
              <div className="relative inline-flex items-center flex-shrink-0">
                <select
                  value={job.targetExt ?? ''}
                  onChange={(e) => onTargetChange(e.target.value)}
                  className="bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] text-primary text-xs rounded-lg pl-2.5 pr-7 py-1.5 appearance-none cursor-pointer hover:border-[var(--border-hover)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                  disabled={job.status === 'converting'}
                  aria-label={t('job.targetFormat')}
                >
                  {targets.map((ext) => (
                    <option key={ext} value={ext}>
                      .{ext.toUpperCase()}
                    </option>
                  ))}
                </select>
                <svg
                  className="absolute right-2 pointer-events-none text-[var(--text-muted)]"
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
            ) : (
              <span className="text-xs text-[var(--text-muted)] flex-shrink-0">—</span>
            )}
          </div>

          {sizeDelta && (
            <div
              className="text-xs px-2.5 py-1 rounded-md bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] flex items-center gap-1.5 flex-shrink-0"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              <span className="text-primary font-medium">
                {formatFileSize(sizeDelta.resultSize)}
              </span>
              <span
                style={{ color: sizeDelta.pct < 0 ? 'var(--success)' : 'var(--text-secondary)' }}
                className="font-bold"
              >
                {sizeDelta.pct > 0 ? '+' : ''}
                {sizeDelta.pct}%
              </span>
            </div>
          )}
        </div>

        {/* Top-right actions: Settings & Remove */}
        <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
          {canConfigure && job.status !== 'converting' && (
            <button
              onClick={() => setShowSettings((s) => !s)}
              title={t('job.settings')}
              aria-label={t('job.settings')}
              className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all hover:bg-[var(--bg-tertiary)] ${
                showSettings
                  ? 'text-[var(--accent)] bg-[var(--accent)]/10'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
            </button>
          )}

          {(onMoveUp || onMoveDown) && (
            <div className="flex flex-col">
              {(
                [
                  [onMoveUp, 'toolbar.moveUp', 'M18 15l-6-6-6 6'],
                  [onMoveDown, 'toolbar.moveDown', 'M6 9l6 6 6-6'],
                ] as const
              ).map(([move, label, path]) => (
                <button
                  key={label}
                  onClick={move}
                  disabled={!move}
                  aria-label={t(label)}
                  title={t(label)}
                  className="w-7 h-[18px] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-25 disabled:pointer-events-none"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d={path} />
                  </svg>
                </button>
              ))}
            </div>
          )}

          <button
            onClick={onRemove}
            className="w-9 h-9 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--error)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-all"
            aria-label={t('job.remove')}
            title={t('job.remove')}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tier 2: Status & Primary Action Toolbar */}
      <div className="mt-3 pt-2.5 border-t border-[var(--border-primary)] flex items-center justify-between flex-wrap gap-2">
        {/* Status / Stage readout */}
        <div className="flex items-center gap-2 text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
          {job.status === 'idle' && (
            <span className="text-[var(--text-muted)] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)]" />
              Ready
            </span>
          )}
          {job.status === 'converting' && (
            <div className="flex items-center gap-2 text-[var(--accent)]" aria-live="polite">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-3.5 h-3.5 border-2 rounded-full border-[var(--accent)] border-t-transparent flex-shrink-0"
              />
              <span className="font-semibold">{job.progress}%</span>
              <span className="text-[var(--text-muted)] text-[10px]">·</span>
              <span className="text-[var(--text-muted)] truncate max-w-[180px] sm:max-w-xs">
                {job.stage || 'Processing locally...'}
              </span>
            </div>
          )}
          {job.status === 'done' && (
            <span className="text-[var(--success)] flex items-center gap-1.5 font-medium">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Ready to download
            </span>
          )}
          {job.status === 'error' && (
            <span
              className="text-[var(--error)] flex items-center gap-1.5"
              title={job.error?.detail}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span className="truncate max-w-xs">
                {job.error
                  ? describeError(job.error, job.sourceExt, t).title
                  : t('errors.unknown.title')}
              </span>
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {job.status === 'idle' && job.targetExt && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onConvert}
              className="px-4 py-1.5 bg-[var(--accent)] text-[var(--accent-text)] text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity shadow-sm"
              style={{ fontFamily: 'var(--font-mono)' }}
              aria-label={`${t('job.convert')} ${job.file.name}`}
            >
              {t('job.convert')}
            </motion.button>
          )}

          {job.status === 'converting' && (
            <button
              onClick={onCancel}
              className="px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--error)] border border-[var(--border-secondary)] rounded-lg transition-colors"
              style={{ fontFamily: 'var(--font-mono)' }}
              aria-label={`${t('job.cancel')} ${job.file.name}`}
            >
              {t('job.cancel')}
            </button>
          )}

          {job.status === 'done' && (
            <div className="flex items-center gap-1.5">
              {isTextResult && (
                <motion.button
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  whileHover={{ scale: 1.05 }}
                  onClick={copyResult}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1.5 ${
                    copied
                      ? 'border-[var(--accent)]/50 text-[var(--accent)]'
                      : copyFailed
                        ? 'border-[var(--error)]/50 text-[var(--error)]'
                        : 'border-[var(--border-secondary)] text-[var(--text-secondary)] hover:border-[var(--border-hover)] hover:text-primary'
                  }`}
                  style={{ fontFamily: 'var(--font-mono)' }}
                  aria-label={
                    copied ? t('job.copied') : copyFailed ? t('job.copyFailed') : t('job.copy')
                  }
                >
                  {copied ? (
                    <>
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                      {t('job.copied')}
                    </>
                  ) : copyFailed ? (
                    <>
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                      {t('job.copyFailed')}
                    </>
                  ) : (
                    <>
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                      </svg>
                      {t('job.copy')}
                    </>
                  )}
                </motion.button>
              )}

              {canPreview && (
                <motion.button
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  whileHover={{ scale: 1.05 }}
                  onClick={() => setShowPreview((s) => !s)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1.5 ${
                    showPreview
                      ? 'border-[var(--accent)]/50 text-[var(--accent)] bg-[var(--accent)]/5'
                      : 'border-[var(--border-secondary)] text-[var(--text-secondary)] hover:border-[var(--border-hover)] hover:text-primary'
                  }`}
                  style={{ fontFamily: 'var(--font-mono)' }}
                  aria-label={showPreview ? t('job.hide') : t('job.view')}
                  aria-expanded={showPreview}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  {showPreview ? t('job.hide') : t('job.view')}
                </motion.button>
              )}

              <motion.button
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                whileHover={{ scale: 1.05 }}
                onClick={onDownload}
                className="px-4 py-1.5 bg-[var(--success)] text-[var(--success-text)] text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity flex items-center gap-1.5 shadow-sm"
                style={{ fontFamily: 'var(--font-mono)' }}
                aria-label={t('job.download')}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
                {t('job.download')}
              </motion.button>
            </div>
          )}

          {job.status === 'error' && (
            <button
              onClick={onConvert}
              className="px-4 py-1.5 text-[var(--error)] text-xs rounded-lg border border-[var(--error)]/30 bg-[var(--error)]/10 hover:bg-[var(--error)]/20 transition-colors font-medium flex items-center gap-1"
              style={{ fontFamily: 'var(--font-mono)' }}
              title={job.error?.detail}
              aria-label={t('job.retry')}
            >
              {t('job.retry')}
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {job.status === 'converting' && (
        <div className="mt-3 h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden border border-[var(--border-primary)]">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${job.progress}%` }}
            transition={{ ease: 'easeOut', duration: 0.2 }}
            className="h-full bg-[var(--accent)] rounded-full shadow-[0_0_8px_rgba(200,255,0,0.4)]"
          />
        </div>
      )}

      <AnimatePresence>
        {showSettings && job.targetExt && canConfigure && (
          <SettingsPanel
            targetExt={job.targetExt}
            sourceExt={job.sourceExt}
            settings={job.settings}
            file={job.file}
            onChange={onSettingsChange}
            t={t}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPreview && canPreview && (
          <PreviewPanel
            blob={job.resultBlob}
            targetExt={job.targetExt}
            open={showPreview}
            onClose={() => setShowPreview(false)}
            t={t}
          />
        )}
      </AnimatePresence>

      {job.status === 'error' && job.error && (
        <div role="alert" className="mt-2 text-xs">
          <p className="text-[var(--error)] font-semibold">
            {describeError(job.error, job.sourceExt, t).title}
          </p>
          <p className="mt-0.5 text-[var(--text-secondary)]">
            {describeError(job.error, job.sourceExt, t).hint}
          </p>
          <details className="mt-1 text-[var(--text-muted)]">
            <summary className="cursor-pointer select-none">{t('errors.details')}</summary>
            <code
              className="block mt-1 break-all whitespace-pre-wrap"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {job.error.detail}
            </code>
          </details>
        </div>
      )}
    </motion.div>
  );
}
