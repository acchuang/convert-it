'use client';

import { motion } from 'framer-motion';
import { getTargetFormats, getFormatInfo, formatFileSize } from '@/lib/converters';

export interface FileJob {
  id: string;
  file: File;
  sourceExt: string;
  targetExt: string | null;
  status: 'idle' | 'converting' | 'done' | 'error';
  resultBlob?: Blob;
  error?: string;
  progress: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  image: '#FF4D00',
  document: '#00C2FF',
  data: '#C8FF00',
};

export function JobCard({
  job,
  onTargetChange,
  onConvert,
  onDownload,
  onRemove,
}: {
  job: FileJob;
  onTargetChange: (ext: string) => void;
  onConvert: () => void;
  onDownload: () => void;
  onRemove: () => void;
}) {
  const targets = getTargetFormats(job.sourceExt);
  const sourceInfo = getFormatInfo(job.sourceExt);
  const catColor = sourceInfo ? CATEGORY_COLORS[sourceInfo.category] : '#666';

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
              .{t.toUpperCase()}
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