'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getTargetFormats, getFormatInfo, formatFileSize } from '@/lib/converters';
import type { ConversionSettings } from '@/lib/types';
import { PreviewPanel } from './PreviewPanel';

export interface FileJob {
  id: string;
  file: File;
  sourceExt: string;
  targetExt: string | null;
  status: 'idle' | 'converting' | 'done' | 'error';
  resultBlob?: Blob;
  error?: string;
  progress: number;
  settings: ConversionSettings;
}

const CATEGORY_COLORS: Record<string, string> = {
  image: '#FF4D00',
  document: '#00C2FF',
  data: '#AAFF44',
  video: '#FF00C8',
  audio: '#00E5A0',
};

const TEXT_FORMATS = new Set(['json', 'csv', 'xml', 'yaml', 'tsv', 'md', 'html', 'txt']);

const IMAGE_QUALITY_FORMATS = ['jpg', 'jpeg', 'webp', 'png'];
const CSV_DELIMITER_FORMATS = ['csv', 'xlsx'];
const JSON_INDENT_FORMATS = ['json', 'xlsx'];
const AUDIO_BITRATE_FORMATS = ['mp3', 'wav', 'aac', 'ogg', 'flac', 'm4a'];
const VIDEO_SETTINGS_FORMATS = ['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv'];

const CONFIGURABLE_FORMATS = new Set([
  ...IMAGE_QUALITY_FORMATS,
  ...CSV_DELIMITER_FORMATS,
  ...JSON_INDENT_FORMATS,
  'xml',
  ...AUDIO_BITRATE_FORMATS,
  ...VIDEO_SETTINGS_FORMATS,
]);

function hasSettings(targetExt: string | null): boolean {
  return !!targetExt && CONFIGURABLE_FORMATS.has(targetExt);
}

function SettingsPanel({
  targetExt,
  sourceExt,
  settings,
  onChange,
  t,
}: {
  targetExt: string;
  sourceExt: string;
  settings: ConversionSettings;
  onChange: (patch: Partial<ConversionSettings>) => void;
  t: (key: string) => string;
}) {
  const showQuality = IMAGE_QUALITY_FORMATS.includes(targetExt);
  const showDelimiter = CSV_DELIMITER_FORMATS.includes(targetExt);
  const showIndent = JSON_INDENT_FORMATS.includes(targetExt);
  const showRootEl = targetExt === 'xml';
  const showAudioBitrate = AUDIO_BITRATE_FORMATS.includes(targetExt);
  const showVideoSettings = VIDEO_SETTINGS_FORMATS.includes(targetExt);
  const showPdfImage = sourceExt === 'pdf' && IMAGE_QUALITY_FORMATS.includes(targetExt);

  const qualityPct = Math.round(settings.quality * 100);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ type: 'spring', stiffness: 100, damping: 20 }}
      className="overflow-hidden"
    >
      <div
        className="mt-4 pt-4 flex flex-wrap gap-x-6 gap-y-3"
        style={{ borderColor: 'var(--border-primary)', fontFamily: 'var(--font-mono)' }}
      >
        {showQuality && (
          <div className="flex items-center gap-3">
            <span className="text-[var(--text-muted)] text-xs uppercase tracking-wider">
              {t('job.quality')}
            </span>
            <input
              type="range"
              min={10}
              max={100}
              value={qualityPct}
              onChange={(e) => onChange({ quality: Number(e.target.value) / 100 })}
              className="w-24 accent-[var(--accent)]"
            />
            <span className="text-primary text-xs w-8">{qualityPct}%</span>
          </div>
        )}

        {showDelimiter && (
          <div className="flex items-center gap-3">
            <span className="text-[var(--text-muted)] text-xs uppercase tracking-wider">
              {t('job.delimiter')}
            </span>
            <div className="flex gap-1">
              {([',', ';', '|', '\t'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => onChange({ csvDelimiter: d })}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    settings.csvDelimiter === d
                      ? 'bg-[var(--accent)] text-[var(--accent-text)]'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-secondary)] hover:border-[var(--border-hover)]'
                  }`}
                >
                  {d === '\t'
                    ? t('job.tab')
                    : d === ','
                      ? t('job.comma')
                      : d === ';'
                        ? t('job.semi')
                        : t('job.pipe')}
                </button>
              ))}
            </div>
          </div>
        )}

        {showIndent && (
          <div className="flex items-center gap-3">
            <span className="text-[var(--text-muted)] text-xs uppercase tracking-wider">
              {t('job.indent')}
            </span>
            <div className="flex gap-1">
              {([2, 4, 0] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => onChange({ jsonIndent: n })}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    settings.jsonIndent === n
                      ? 'bg-[var(--accent)] text-[var(--accent-text)]'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-secondary)] hover:border-[var(--border-hover)]'
                  }`}
                >
                  {n === 0 ? t('job.min') : `${n}${t('job.sp2').slice(1)}`}
                </button>
              ))}
            </div>
          </div>
        )}

        {showRootEl && (
          <div className="flex items-center gap-3">
            <span className="text-[var(--text-muted)] text-xs uppercase tracking-wider">
              {t('job.root')}
            </span>
            <input
              type="text"
              value={settings.xmlRootElement}
              onChange={(e) => onChange({ xmlRootElement: e.target.value || 'root' })}
              className="bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] text-primary text-xs rounded px-2 py-1 w-24 focus:outline-none focus:border-[var(--accent)] transition-colors"
              placeholder="root"
            />
          </div>
        )}

        {showAudioBitrate && (
          <div className="flex items-center gap-3">
            <span className="text-[var(--text-muted)] text-xs uppercase tracking-wider">
              {t('job.bitrate')}
            </span>
            <div className="flex gap-1">
              {([64, 128, 192, 256, 320] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => onChange({ audioBitrate: n })}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    settings.audioBitrate === n
                      ? 'bg-[var(--accent)] text-[var(--accent-text)]'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-secondary)] hover:border-[var(--border-hover)]'
                  }`}
                >
                  {n}k
                </button>
              ))}
            </div>
          </div>
        )}

        {showPdfImage && (
          <div className="flex items-center gap-3">
            <span className="text-[var(--text-muted)] text-xs uppercase tracking-wider">
              {t('job.pdfPages')}
            </span>
            <div className="flex gap-1">
              {([false, true] as const).map((all) => (
                <button
                  key={String(all)}
                  onClick={() => onChange({ pdfAllPages: all })}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    settings.pdfAllPages === all
                      ? 'bg-[var(--accent)] text-[var(--accent-text)]'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-secondary)] hover:border-[var(--border-hover)]'
                  }`}
                >
                  {all ? t('job.pdfAllPages') : t('job.pdfFirstPage')}
                </button>
              ))}
            </div>
          </div>
        )}

        {showPdfImage && (
          <div className="flex items-center gap-3">
            <span className="text-[var(--text-muted)] text-xs uppercase tracking-wider">
              {t('job.pdfScale')}
            </span>
            <div className="flex gap-1">
              {([1, 2, 3] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => onChange({ pdfScale: n })}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    settings.pdfScale === n
                      ? 'bg-[var(--accent)] text-[var(--accent-text)]'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-secondary)] hover:border-[var(--border-hover)]'
                  }`}
                >
                  {n}x
                </button>
              ))}
            </div>
          </div>
        )}

        {showVideoSettings && (
          <>
            <div className="flex items-center gap-3">
              <span className="text-[var(--text-muted)] text-xs uppercase tracking-wider">
                {t('job.quality')}
              </span>
              <input
                type="range"
                min={18}
                max={51}
                value={settings.videoQuality}
                onChange={(e) => onChange({ videoQuality: Number(e.target.value) })}
                className="w-24"
                style={{ accentColor: 'var(--video-color)' }}
              />
              <span className="text-primary text-xs w-8">CRF {settings.videoQuality}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[var(--text-muted)] text-xs uppercase tracking-wider">
                {t('job.preset')}
              </span>
              <select
                value={settings.videoPreset}
                onChange={(e) => onChange({ videoPreset: e.target.value })}
                className="bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] text-primary text-xs rounded px-2 py-1 appearance-none cursor-pointer hover:border-[var(--border-hover)] focus:outline-none transition-colors"
              >
                {(
                  [
                    'ultrafast',
                    'superfast',
                    'veryfast',
                    'faster',
                    'fast',
                    'medium',
                    'slow',
                    'slower',
                    'veryslow',
                  ] as const
                ).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

interface JobCardProps {
  job: FileJob;
  onTargetChange: (ext: string) => void;
  onConvert: () => void;
  onDownload: () => void;
  onRemove: () => void;
  onSettingsChange: (patch: Partial<ConversionSettings>) => void;
  t: (key: string) => string;
}

export function JobCard({
  job,
  onTargetChange,
  onConvert,
  onDownload,
  onRemove,
  onSettingsChange,
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
  const canConfigure = job.targetExt ? hasSettings(job.targetExt) : false;
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
      className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-2xl p-4 hover:border-[var(--border-hover)] transition-colors"
      role="listitem"
      aria-label={`${job.file.name}`}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: categoryColor }}
          aria-hidden="true"
        />

        <div className="flex-1 min-w-0">
          <p className="text-sm text-primary truncate">{job.file.name}</p>
          <p
            className="text-xs text-[var(--text-muted)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {formatFileSize(job.file.size)}
            {sizeDelta && (
              <>
                {' → '}
                <span className="text-primary">{formatFileSize(sizeDelta.resultSize)}</span>
                {' · '}
                <span style={{ color: sizeDelta.pct < 0 ? 'var(--success)' : undefined }}>
                  {sizeDelta.pct > 0 ? '+' : ''}
                  {sizeDelta.pct}%
                </span>
              </>
            )}
          </p>
        </div>

        <span
          className="px-2 py-0.5 text-xs rounded-md border flex-shrink-0"
          style={{
            borderColor: categoryColor + '30',
            color: categoryColor,
            fontFamily: 'var(--font-mono)',
          }}
        >
          .{job.sourceExt.toUpperCase()}
        </span>

        <span className="text-[var(--text-muted)] flex-shrink-0" aria-hidden="true">
          →
        </span>

        {targets.length > 0 ? (
          <select
            value={job.targetExt ?? ''}
            onChange={(e) => onTargetChange(e.target.value)}
            className="bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] text-primary text-xs rounded-lg px-3 py-1.5 appearance-none cursor-pointer hover:border-[var(--border-hover)] focus:outline-none focus:border-[var(--accent)] transition-colors flex-shrink-0"
            style={{ fontFamily: 'var(--font-mono)' }}
            disabled={job.status === 'converting'}
            aria-label={t('job.targetFormat')}
          >
            {targets.map((ext) => (
              <option key={ext} value={ext}>
                .{ext.toUpperCase()}
              </option>
            ))}
          </select>
        ) : (
          <span
            className="text-xs text-[var(--text-muted)] flex-shrink-0"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            —
          </span>
        )}

        <div className="flex items-center gap-1.5 flex-shrink-0 ml-1 pl-3 border-l border-[var(--border-secondary)]">
          {job.status === 'idle' && job.targetExt && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              onClick={onConvert}
              className="px-4 py-2 bg-[var(--accent)] text-[var(--accent-text)] text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity"
              style={{ fontFamily: 'var(--font-mono)' }}
              aria-label={`${t('job.convert')} ${job.file.name}`}
            >
              {t('job.convert')}
            </motion.button>
          )}

          {job.status === 'converting' && (
            <div
              className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-tertiary)] rounded-lg"
              aria-live="polite"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-3.5 h-3.5 border-2 rounded-full"
                style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
              />
              <span
                className="text-xs text-[var(--accent)]"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {job.progress}%
              </span>
            </div>
          )}

          {job.status === 'done' && (
            <div className="flex items-center gap-1.5">
              {isTextResult && (
                <motion.button
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  whileHover={{ scale: 1.05 }}
                  onClick={copyResult}
                  className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1.5 ${
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
                  className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1.5 ${
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
                className="px-4 py-2 bg-[var(--success)] text-[var(--success-text)] text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity flex items-center gap-1.5"
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
              className="px-4 py-2 text-[var(--error)] text-xs rounded-lg border transition-colors hover:opacity-80 flex items-center gap-1"
              style={{
                fontFamily: 'var(--font-mono)',
                borderColor: 'color-mix(in srgb, var(--error) 30%, transparent)',
                backgroundColor: 'color-mix(in srgb, var(--error) 10%, transparent)',
              }}
              title={job.error}
              aria-label={t('job.retry')}
            >
              {t('job.retry')}
            </button>
          )}

          {canConfigure && job.status !== 'converting' && (
            <button
              onClick={() => setShowSettings((s) => !s)}
              title={t('job.settings')}
              aria-label={t('job.settings')}
              className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all hover:bg-[var(--bg-tertiary)] ${
                showSettings
                  ? 'text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              style={{
                backgroundColor: showSettings
                  ? 'color-mix(in srgb, var(--accent) 10%, transparent)'
                  : undefined,
              }}
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

          <button
            onClick={onRemove}
            className="w-9 h-9 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--error)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-all"
            aria-label={t('job.remove')}
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

      <AnimatePresence>
        {showSettings && job.targetExt && canConfigure && (
          <SettingsPanel
            targetExt={job.targetExt}
            sourceExt={job.sourceExt}
            settings={job.settings}
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

      {job.status === 'converting' && (
        <div className="mt-3 h-0.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${job.progress}%` }}
            className="h-full bg-[var(--accent)] rounded-full"
          />
        </div>
      )}

      {job.status === 'error' && job.error && (
        <p className="mt-2 text-xs text-[var(--error)]" style={{ fontFamily: 'var(--font-mono)' }}>
          {job.error}
        </p>
      )}
    </motion.div>
  );
}
