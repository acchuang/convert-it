'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatFileSize } from '@/lib/converters';
import { timeAgo, clearHistory, type HistoryEntry } from '@/lib/history';

const CATEGORY_COLORS: Record<string, string> = {
  jpg: '#FF4D00', jpeg: '#FF4D00', png: '#FF4D00', webp: '#FF4D00',
  gif: '#FF4D00', bmp: '#FF4D00', ico: '#FF4D00', svg: '#FF4D00',
  mp4: '#FF00C8', webm: '#FF00C8', avi: '#FF00C8', mov: '#FF00C8', mkv: '#FF00C8', flv: '#FF00C8',
  mp3: '#00E5A0', wav: '#00E5A0', aac: '#00E5A0', ogg: '#00E5A0', flac: '#00E5A0', m4a: '#00E5A0',
  txt: '#00C2FF', md: '#00C2FF', html: '#00C2FF', pdf: '#00C2FF',
  csv: '#AAFF44', json: '#AAFF44', xml: '#AAFF44', yaml: '#AAFF44', tsv: '#AAFF44', xlsx: '#AAFF44',
};

function getColor(ext: string) {
  return CATEGORY_COLORS[ext.toLowerCase()] ?? '#666';
}

export function HistoryPanel({
  entries,
  onClear,
  t,
}: {
  entries: HistoryEntry[];
  onClear: () => void;
  t: (key: string) => string;
}) {
  const [open, setOpen] = useState(true);

  if (entries.length === 0) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 100, damping: 20, delay: 0.8 }}
        className="mt-8"
      >
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-2xl p-8 text-center">
          <p className="text-[var(--text-muted)] text-sm" style={{ fontFamily: 'var(--font-mono)' }}>
            {t('history.empty')}
          </p>
        </div>
      </motion.section>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 100, damping: 20 }}
      className="mt-8"
    >
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 group">
          <h2
            style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.08em' }}
            className="text-lg text-primary group-hover:text-[var(--accent)] transition-colors"
          >
            {t('history.heading')}
          </h2>
          <span className="text-[var(--text-muted)] text-xs" style={{ fontFamily: 'var(--font-mono)' }}>{entries.length}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2" className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        <button
          onClick={() => { clearHistory(); onClear(); }}
          className="text-xs text-[var(--text-dim)] hover:text-[var(--error)] transition-colors"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {t('history.clear')}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ type: 'spring', stiffness: 100, damping: 20 }} className="overflow-hidden">
            <div className="space-y-1.5">
              {entries.map(entry => {
                const srcColor = getColor(entry.sourceExt);
                const tgtColor = getColor(entry.targetExt);
                return (
                  <div key={entry.id} className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-4 py-2.5 flex items-center gap-3 hover:border-[var(--border-hover)] transition-colors">
                    <div className="flex items-center gap-1.5 flex-shrink-0" style={{ fontFamily: 'var(--font-mono)' }}>
                      <span className="text-xs" style={{ color: srcColor }}>.{entry.sourceExt.toUpperCase()}</span>
                      <span className="text-[var(--text-muted)] text-xs">→</span>
                      <span className="text-xs" style={{ color: tgtColor }}>.{entry.targetExt.toUpperCase()}</span>
                    </div>
                    <p className="text-[var(--text-secondary)] text-xs truncate flex-1">{entry.filename}</p>
                    <div className="flex items-center gap-3 flex-shrink-0" style={{ fontFamily: 'var(--font-mono)' }}>
                      <span className="text-[var(--text-muted)] text-xs hidden sm:block">
                        {formatFileSize(entry.fileSize)} → {formatFileSize(entry.resultSize)}
                      </span>
                      <span className="text-[var(--text-muted)] text-xs">{timeAgo(entry.convertedAt)}</span>
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
