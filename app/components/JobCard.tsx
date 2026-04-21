'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getTargetFormats, getFormatInfo, formatFileSize } from '@/lib/converters';
import type { ConversionSettings } from '@/lib/types';

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
};

const TEXT_FORMATS = new Set(['json', 'csv', 'xml', 'yaml', 'tsv', 'md', 'html', 'txt']);

function hasSettings(targetExt: string | null): boolean {
  if (!targetExt) return false;
  return ['jpg', 'jpeg', 'webp', 'png', 'csv', 'json', 'xml', 'xlsx'].includes(targetExt);
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
        className="mt-3 pt-3 border-t border-[#1E1E1E] flex flex-wrap gap-x-6 gap-y-3"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {showQuality && (
          <div className="flex items-center gap-3">
            <span className="text-[#555] text-xs uppercase tracking-wider">Quality</span>
            <input
              type="range"
              min={10}
              max={100}
              value={qualityPct}
              onChange={e => onChange({ quality: Number(e.target.value) / 100 })}
              className="w-24 accent-[#C8FF00]"
            />
            <span className="text-[#F5F0E8] text-xs w-8">{qualityPct}%</span>
          </div>
        )}

        {showDelimiter && (
          <div className="flex items-center gap-3">
            <span className="text-[#555] text-xs uppercase tracking-wider">Delimiter</span>
            <div className="flex gap-1">
              {([',', ';', '|', '\t'] as const).map(d => (
                <button
                  key={d}
                  onClick={() => onChange({ csvDelimiter: d })}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    settings.csvDelimiter === d
                      ? 'bg-[#C8FF00] text-[#0A0A0A]'
                      : 'bg-[#1A1A1A] text-[#888] border border-[#2A2A2A] hover:border-[#444]'
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
            <span className="text-[#555] text-xs uppercase tracking-wider">Indent</span>
            <div className="flex gap-1">
              {([2, 4, 0] as const).map(n => (
                <button
                  key={n}
                  onClick={() => onChange({ jsonIndent: n })}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    settings.jsonIndent === n
                      ? 'bg-[#C8FF00] text-[#0A0A0A]'
                      : 'bg-[#1A1A1A] text-[#888] border border-[#2A2A2A] hover:border-[#444]'
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
            <span className="text-[#555] text-xs uppercase tracking-wider">Root</span>
            <input
              type="text"
              value={settings.xmlRootElement}
              onChange={e => onChange({ xmlRootElement: e.target.value || 'root' })}
              className="bg-[#1A1A1A] border border-[#2A2A2A] text-[#F5F0E8] text-xs rounded px-2 py-1 w-24 focus:outline-none focus:border-[#C8FF00] transition-colors"
              placeholder="root"
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function JobCard({
  job,
  onTargetChange,
  onConvert,
  onDownload,
  onRemove,
  onSettingsChange,
}: {
  job: FileJob;
  onTargetChange: (ext: string) => void;
  onConvert: () => void;
  onDownload: () => void;
  onRemove: () => void;
  onSettingsChange: (patch: Partial<ConversionSettings>) => void;
}) {
  const [showSettings, setShowSettings] = useState(false);
  const [copied, setCopied] = useState(false);
  const targets = getTargetFormats(job.sourceExt);
  const sourceInfo = getFormatInfo(job.sourceExt);
  const catColor = sourceInfo ? CATEGORY_COLORS[sourceInfo.category] : '#666';
  const canConfigure = hasSettings(job.targetExt);
  const canCopy = job.status === 'done' && job.targetExt ? TEXT_FORMATS.has(job.targetExt) : false;

  const handleCopy = async () => {
    if (!job.resultBlob) return;
    const text = await job.resultBlob.text();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const statusConfig = {
    idle: { label: 'READY', color: '#666' },
    converting: { label: 'CONVERTING', color: '#C8FF00' },
    done: { label: 'DONE', color: '#22C55E' },
    error: { label: 'ERROR', color: '#EF4444' },
  }[job.status];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="bg-[#111] border border-[#1E1E1E] rounded-xl p-4 hover:border-[#2A2A2A] transition-all"
    >
      <div className="flex items-center gap-3 flex-wrap md:flex-nowrap">
        <div
          className="w-12 h-12 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
          style={{
            background: catColor + '15',
            color: catColor,
            fontFamily: 'var(--font-mono)',
            border: `1px solid ${catColor}30`,
          }}
        >
          .{job.sourceExt.toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[#F5F0E8] text-sm font-medium truncate">{job.file.name}</p>
          <p className="text-[#555] text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
            {formatFileSize(job.file.size)}
            {job.status === 'done' && job.resultBlob && (
              <span className="text-[#444]"> → {formatFileSize(job.resultBlob.size)}</span>
            )}
          </p>
        </div>

        <div className="text-[#333] text-lg hidden md:block">&rarr;</div>

        <select
          value={job.targetExt ?? ''}
          onChange={e => onTargetChange(e.target.value)}
          disabled={job.status === 'converting'}
          className="bg-[#1A1A1A] border border-[#2A2A2A] text-[#F5F0E8] text-xs rounded-lg px-3 py-2 appearance-none cursor-pointer hover:border-[#444] focus:outline-none focus:border-[#C8FF00] transition-colors"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {targets.length === 0 && <option value="">No conversions</option>}
          {targets.map(t => (
            <option key={t} value={t}>
              {t === job.sourceExt ? `.${t.toUpperCase()} (compress)` : `.${t.toUpperCase()}`}
            </option>
          ))}
        </select>

        <span
          className="text-xs px-2 py-1 rounded hidden md:inline-block"
          style={{
            fontFamily: 'var(--font-mono)',
            color: statusConfig.color,
            background: statusConfig.color + '18',
          }}
        >
          {statusConfig.label}
        </span>

        <div className="flex items-center gap-2 ml-auto md:ml-0">
          {job.status === 'idle' && targets.length > 0 && (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={onConvert}
              className="px-4 py-2 bg-[#C8FF00] text-[#0A0A0A] text-xs font-semibold rounded-lg hover:bg-[#D8FF33] transition-colors"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              CONVERT
            </motion.button>
          )}

          {job.status === 'converting' && (
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 border-2 border-[#C8FF00] border-t-transparent rounded-full animate-spin" />
              <span className="text-[#C8FF00] text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
                {job.progress}%
              </span>
            </div>
          )}

          {job.status === 'done' && (
            <div className="flex items-center gap-2">
              {canCopy && (
                <motion.button
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  whileHover={{ scale: 1.03 }}
                  onClick={handleCopy}
                  className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1.5 ${
                    copied
                      ? 'border-[#22C55E]/50 text-[#22C55E] bg-[#22C55E]/10'
                      : 'border-[#2A2A2A] text-[#888] hover:border-[#444] hover:text-[#F5F0E8]'
                  }`}
                  style={{ fontFamily: 'var(--font-mono)' }}
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

              <motion.button
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                whileHover={{ scale: 1.03 }}
                onClick={onDownload}
                className="px-4 py-2 bg-[#22C55E] text-white text-xs font-semibold rounded-lg hover:bg-[#16A34A] transition-colors flex items-center gap-1.5"
                style={{ fontFamily: 'var(--font-mono)' }}
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
              className="px-4 py-2 bg-[#EF4444]/20 text-[#EF4444] text-xs rounded-lg border border-[#EF4444]/30 hover:bg-[#EF4444]/30 transition-colors"
              style={{ fontFamily: 'var(--font-mono)' }}
              title={job.error}
            >
              RETRY
            </button>
          )}

          {canConfigure && job.status !== 'converting' && (
            <button
              onClick={() => setShowSettings(s => !s)}
              title="Conversion settings"
              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${
                showSettings
                  ? 'text-[#C8FF00] bg-[#C8FF00]/10'
                  : 'text-[#444] hover:text-[#888] hover:bg-[#1A1A1A]'
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
            </button>
          )}

          <button
            onClick={onRemove}
            className="w-8 h-8 flex items-center justify-center text-[#444] hover:text-[#EF4444] hover:bg-[#EF4444]/10 rounded-lg transition-all"
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

      {job.status === 'converting' && (
        <div className="mt-3 h-0.5 bg-[#1A1A1A] rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${job.progress}%` }}
            className="h-full bg-[#C8FF00] rounded-full"
          />
        </div>
      )}

      {job.status === 'error' && job.error && (
        <p className="mt-2 text-xs text-[#EF4444]" style={{ fontFamily: 'var(--font-mono)' }}>
          ⚠ {job.error}
        </p>
      )}
    </motion.div>
  );
}
