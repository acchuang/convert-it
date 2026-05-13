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
  data: '#C8FF00',
  video: '#FF00C8',
  audio: '#00FF88',
};

const TEXT_FORMATS = new Set(['json', 'csv', 'xml', 'yaml', 'tsv', 'md', 'html', 'txt']);

function hasSettings(targetExt: string | null): boolean {
  if (!targetExt) return false;
  return ['jpg', 'jpeg', 'webp', 'png', 'csv', 'json', 'xml', 'xlsx', 'mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'mp3', 'wav', 'aac', 'ogg', 'flac', 'm4a'].includes(targetExt);
}

function SettingsPanel({
  targetExt,
  settings,
  onChange,
}: {
  targetExt: string;
  settings: ConversionSettings;
  onChange: (patch: Partial<ConversionSettings>) => void;
}) {
  const showQuality = ['jpg', 'jpeg', 'webp', 'png'].includes(targetExt);
  const showDelimiter = ['csv', 'xlsx'].includes(targetExt);
  const showIndent = ['json', 'xlsx'].includes(targetExt);
  const showRootEl = targetExt === 'xml';
  const showAudioBitrate = ['mp3', 'wav', 'aac', 'ogg', 'flac', 'm4a'].includes(targetExt);
  const showVideoSettings = ['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv'].includes(targetExt);

  const qualityPct = Math.round(settings.quality * 100);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
    >
      <div
        className="mt-3 pt-3 border-t flex flex-wrap gap-x-6 gap-y-3"
        style={{ borderColor: 'var(--border-primary)', fontFamily: 'var(--font-mono)' }}
      >
        {showQuality && (
          <div className="flex items-center gap-3">
            <span className="text-[var(--text-muted)] text-xs uppercase tracking-wider">Quality</span>
            <input
              type="range"
              min={10}
              max={100}
              value={qualityPct}
              onChange={e => onChange({ quality: Number(e.target.value) / 100 })}
              className="w-24 accent-[var(--accent)]"
            />
            <span className="text-primary text-xs w-8">{qualityPct}%</span>
          </div>
        )}

        {showDelimiter && (
          <div className="flex items-center gap-3">
            <span className="text-[var(--text-muted)] text-xs uppercase tracking-wider">Delimiter</span>
            <div className="flex gap-1">
              {([',', ';', '|', '\t'] as const).map(d => (
                <button
                  key={d}
                  onClick={() => onChange({ csvDelimiter: d })}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    settings.csvDelimiter === d
                      ? 'bg-[var(--accent)] text-[#0A0A0A]'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-secondary)] hover:border-[var(--border-hover)]'
                  }`}
                >
                  {d === '\t' ? 'TAB' : d === ',' ? 'COMMA' : d === ';' ? 'SEMI' : 'PIPE'}
                </button>
              ))}
            </div>
          </div>
        )}

        {showIndent && (
          <div className="flex items-center gap-3">
            <span className="text-[var(--text-muted)] text-xs uppercase tracking-wider">Indent</span>
            <div className="flex gap-1">
              {([2, 4, 0] as const).map(n => (
                <button
                  key={n}
                  onClick={() => onChange({ jsonIndent: n })}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    settings.jsonIndent === n
                      ? 'bg-[var(--accent)] text-[#0A0A0A]'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-secondary)] hover:border-[var(--border-hover)]'
                  }`}
                >
                  {n === 0 ? 'MIN' : `${n}SP`}
                </button>
              ))}
            </div>
          </div>
        )}

        {showRootEl && (
          <div className="flex items-center gap-3">
            <span className="text-[var(--text-muted)] text-xs uppercase tracking-wider">Root</span>
            <input
              type="text"
              value={settings.xmlRootElement}
              onChange={e => onChange({ xmlRootElement: e.target.value || 'root' })}
              className="bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] text-primary text-xs rounded px-2 py-1 w-24 focus:outline-none focus:border-[var(--accent)] transition-colors"
              placeholder="root"
            />
          </div>
        )}

        {showAudioBitrate && (
          <div className="flex items-center gap-3">
            <span className="text-[var(--text-muted)] text-xs uppercase tracking-wider">Bitrate</span>
            <div className="flex gap-1">
              {([64, 128, 192, 256, 320] as const).map(n => (
                <button
                  key={n}
                  onClick={() => onChange({ audioBitrate: n })}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    settings.audioBitrate === n
                      ? 'bg-[var(--accent)] text-[#0A0A0A]'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-secondary)] hover:border-[var(--border-hover)]'
                  }`}
                >
                  {n}k
                </button>
              ))}
            </div>
          </div>
        )}

        {showVideoSettings && (
          <>
            <div className="flex items-center gap-3">
              <span className="text-[var(--text-muted)] text-xs uppercase tracking-wider">Quality</span>
              <input
                type="range"
                min={18}
                max={51}
                value={settings.videoQuality}
                onChange={e => onChange({ videoQuality: Number(e.target.value) })}
                className="w-24"
                style={{ accentColor: 'var(--video-color)' }}
              />
              <span className="text-primary text-xs w-8">CRF {settings.videoQuality}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[var(--text-muted)] text-xs uppercase tracking-wider">Preset</span>
              <select
                value={settings.videoPreset}
                onChange={e => onChange({ videoPreset: e.target.value })}
                className="bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] text-primary text-xs rounded px-2 py-1 appearance-none cursor-pointer hover:border-[var(--border-hover)] focus:outline-none transition-colors"
                style={{ borderColor: 'var(--border-secondary)' }}
              >
                {(['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow'] as const).map(p => (
                  <option key={p} value={p}>{p}</option>
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
}

export function JobCard({ job, onTargetChange, onConvert, onDownload, onRemove, onSettingsChange }: JobCardProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [copied, setCopied] = useState(false);

  const info = getFormatInfo(job.sourceExt);
  const category = info?.category ?? 'document';
  const categoryColor = CATEGORY_COLORS[category] ?? '#666';
  const targets = getTargetFormats(job.sourceExt);
  const canConfigure = job.targetExt ? hasSettings(job.targetExt) : false;
  const canPreview = job.status === 'done' && !!job.resultBlob && !!job.targetExt;
  const isTextResult = job.targetExt ? TEXT_FORMATS.has(job.targetExt) : false;

  const copyResult = async () => {
    if (!job.resultBlob) return;
    try {
      const text = await job.resultBlob.text();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback silently
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
      className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-2xl p-4 hover:border-[var(--border-hover)] transition-colors"
      role="listitem"
      aria-label={`${job.file.name} — ${job.status}`}
    >
      <div className="flex items-center gap-3">
        {/* Category dot */}
        <div
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: categoryColor }}
          aria-hidden="true"
        />

        {/* Filename */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-primary truncate">{job.file.name}</p>
          <p className="text-xs text-[var(--text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
            {formatFileSize(job.file.size)}
          </p>
        </div>

        {/* Source ext badge */}
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

        {/* Arrow */}
        <span className="text-[var(--text-dim)] flex-shrink-0" aria-hidden="true">→</span>

        {/* Target select */}
        {targets.length > 0 ? (
          <select
            value={job.targetExt ?? ''}
            onChange={e => onTargetChange(e.target.value)}
            className="bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] text-primary text-xs rounded-lg px-3 py-1.5 appearance-none cursor-pointer hover:border-[var(--border-hover)] focus:outline-none focus:border-[var(--accent)] transition-colors flex-shrink-0"
            style={{ fontFamily: 'var(--font-mono)' }}
            disabled={job.status === 'converting'}
            aria-label="Target format"
          >
            {targets.map(ext => (
              <option key={ext} value={ext}>.{ext.toUpperCase()}</option>
            ))}
          </select>
        ) : (
          <span className="text-xs text-[var(--text-muted)] flex-shrink-0" style={{ fontFamily: 'var(--font-mono)' }}>
            —
          </span>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {job.status === 'idle' && job.targetExt && (
            <motion.button
              whileHover={{ scale: 1.03 }}
              onClick={onConvert}
              className="px-4 py-2 bg-[var(--accent)] text-[#0A0A0A] text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity"
              style={{ fontFamily: 'var(--font-mono)' }}
              aria-label={`Convert ${job.file.name} to ${job.targetExt}`}
            >
              CONVERT →
            </motion.button>
          )}

          {job.status === 'converting' && (
            <div className="flex items-center gap-2 px-3 py-2" aria-live="polite" aria-label={`Converting ${job.file.name}, ${job.progress} percent`}>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-4 h-4 border-2 border-t-[var(--accent)] rounded-full"
                style={{ borderColor: 'var(--accent)', borderTopColor: 'var(--accent)', opacity: 0.3 }}
              />
              <span className="text-xs text-[var(--accent)]" style={{ fontFamily: 'var(--font-mono)' }}>
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
                  whileHover={{ scale: 1.03 }}
                  onClick={copyResult}
                  className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1.5 ${
                    copied
                      ? 'border-[var(--success)]/50 text-[var(--success)]'
                      : 'border-[var(--border-secondary)] text-[var(--text-secondary)] hover:border-[var(--border-hover)] hover:text-primary'
                  }`}
                  style={{ fontFamily: 'var(--font-mono)', backgroundColor: copied ? 'color-mix(in srgb, var(--success) 10%, transparent)' : undefined }}
                  aria-label={copied ? 'Copied to clipboard' : 'Copy result to clipboard'}
                >
                  {copied ? (
                    <>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                      COPIED
                    </>
                  ) : (
                    <>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                      </svg>
                      COPY
                    </>
                  )}
                </motion.button>
              )}

              {canPreview && (
                <motion.button
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  whileHover={{ scale: 1.03 }}
                  onClick={() => setShowPreview(s => !s)}
                  className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1.5 ${
                    showPreview
                      ? 'border-[var(--accent)]/50 text-[var(--accent)]'
                      : 'border-[var(--border-secondary)] text-[var(--text-secondary)] hover:border-[var(--border-hover)] hover:text-primary'
                  }`}
                  style={{ fontFamily: 'var(--font-mono)', backgroundColor: showPreview ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : undefined }}
                  aria-label={showPreview ? 'Hide preview' : 'Show preview'}
                  aria-expanded={showPreview}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  {showPreview ? 'HIDE' : 'VIEW'}
                </motion.button>
              )}

              <motion.button
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                whileHover={{ scale: 1.03 }}
                onClick={onDownload}
                className="px-4 py-2 bg-[var(--success)] text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity flex items-center gap-1.5"
                style={{ fontFamily: 'var(--font-mono)' }}
                aria-label={`Download ${job.file.name} as ${job.targetExt}`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
                DOWNLOAD
              </motion.button>
            </div>
          )}

          {job.status === 'error' && (
            <button
              onClick={onConvert}
              className="px-4 py-2 text-[var(--error)] text-xs rounded-lg border transition-colors hover:opacity-80 flex items-center gap-1"
              style={{ fontFamily: 'var(--font-mono)', borderColor: 'color-mix(in srgb, var(--error) 30%, transparent)', backgroundColor: 'color-mix(in srgb, var(--error) 10%, transparent)' }}
              title={job.error}
              aria-label={`Retry conversion of ${job.file.name}`}
            >
              RETRY
            </button>
          )}

          {canConfigure && job.status !== 'converting' && (
            <button
              onClick={() => setShowSettings(s => !s)}
              title="Conversion settings"
              aria-label="Conversion settings"
              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${
                showSettings
                  ? 'text-[var(--accent)]'
                  : 'text-[var(--text-dim)] hover:text-[var(--text-secondary)]'
              }`}
              style={{ backgroundColor: showSettings ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : undefined }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
            </button>
          )}

          <button
            onClick={onRemove}
            className="w-8 h-8 flex items-center justify-center text-[var(--text-dim)] hover:text-[var(--error)] rounded-lg transition-all"
            aria-label={`Remove ${job.file.name}`}
            style={{ backgroundColor: 'transparent' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showSettings && job.targetExt && canConfigure && (
          <SettingsPanel
            targetExt={job.targetExt}
            settings={job.settings}
            onChange={onSettingsChange}
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
          ⚠ {job.error}
        </p>
      )}
    </motion.div>
  );
}
