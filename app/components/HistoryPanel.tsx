'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatFileSize } from '@/lib/converters';
import { timeAgo, clearHistory, type HistoryEntry } from '@/lib/history';

const CATEGORY_COLORS: Record<string, string> = {
  jpg: '#FF4D00', jpeg: '#FF4D00', png: '#FF4D00', webp: '#FF4D00',
  gif: '#FF4D00', bmp: '#FF4D00', ico: '#FF4D00', svg: '#FF4D00',
  txt: '#00C2FF', md: '#00C2FF', html: '#00C2FF',
  csv: '#C8FF00', json: '#C8FF00', xml: '#C8FF00', yaml: '#C8FF00', tsv: '#C8FF00',
};

function getColor(ext: string) {
  return CATEGORY_COLORS[ext.toLowerCase()] ?? '#666';
}

export function HistoryPanel({
  entries,
  onClear,
}: {
  entries: HistoryEntry[];
  onClear: () => void;
}) {
  const [open, setOpen] = useState(true);

  if (entries.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
      className="mt-8"
    >
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 group"
        >
          <h2
            style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.08em' }}
            className="text-lg text-[#F5F0E8] group-hover:text-[#C8FF00] transition-colors"
          >
            RECENT
          </h2>
          <span className="text-[#444] text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
            {entries.length}
          </span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#444"
            strokeWidth="2"
            className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        <button
          onClick={() => { clearHistory(); onClear(); }}
          className="text-xs text-[#444] hover:text-[#EF4444] transition-colors"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          CLEAR
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-1.5">
              {entries.map(entry => {
                const srcColor = getColor(entry.sourceExt);
                const tgtColor = getColor(entry.targetExt);
                return (
                  <div
                    key={entry.id}
                    className="bg-[#111] border border-[#1A1A1A] rounded-lg px-4 py-2.5 flex items-center gap-3 hover:border-[#2A2A2A] transition-colors"
                  >
                    <div className="flex items-center gap-1.5 flex-shrink-0" style={{ fontFamily: 'var(--font-mono)' }}>
                      <span className="text-xs" style={{ color: srcColor }}>.{entry.sourceExt.toUpperCase()}</span>
                      <span className="text-[#333] text-xs">→</span>
                      <span className="text-xs" style={{ color: tgtColor }}>.{entry.targetExt.toUpperCase()}</span>
                    </div>

                    <p className="text-[#888] text-xs truncate flex-1">{entry.filename}</p>

                    <div className="flex items-center gap-3 flex-shrink-0" style={{ fontFamily: 'var(--font-mono)' }}>
                      <span className="text-[#555] text-xs hidden sm:block">
                        {formatFileSize(entry.fileSize)} → {formatFileSize(entry.resultSize)}
                      </span>
                      <span className="text-[#444] text-xs">{timeAgo(entry.convertedAt)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
