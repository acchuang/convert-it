'use client';

import type { DragEvent } from 'react';
import { motion } from 'framer-motion';
import { useLocale } from './LocaleProvider';

export const CATEGORY_COLORS: Record<string, string> = {
  image: '#FF4D00',
  document: '#00C2FF',
  data: '#AAFF44',
  video: '#FF00C8',
  audio: '#00E5A0',
};

const ALL_CATEGORIES = ['image', 'video', 'audio', 'document', 'data'] as const;

/** Full-viewport overlay shown whenever files are dragged over the window. */
export function DragOverlay({ dragCategory }: { dragCategory: string | null }) {
  const { t } = useLocale();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 bg-[var(--bg-primary)]/85 backdrop-blur-md flex flex-col items-center justify-center p-6 border-4 border-dashed border-[var(--accent)] pointer-events-none"
    >
      <div
        className="text-6xl sm:text-7xl font-bold mb-4"
        style={{
          fontFamily: 'var(--font-display)',
          color: dragCategory
            ? (CATEGORY_COLORS[dragCategory] ?? 'var(--accent)')
            : 'var(--accent)',
          letterSpacing: '0.08em',
        }}
      >
        {dragCategory ? t(`dropzone.${dragCategory}`) : 'DROP FILES ANYWHERE'}
      </div>
      <p className="text-sm text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-mono)' }}>
        {t('dropzone.subtitle')} · Processed 100% locally on your device
      </p>
    </motion.div>
  );
}

interface DropZoneProps {
  dragging: boolean;
  dragCategory: string | null;
  onDragEnter: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
  /** Opens the file picker. The <input> lives in ConverterApp, not here: this
   *  component unmounts once files are queued, and "Add files" still needs it. */
  onBrowse: () => void;
  onBrowseFolder: () => void;
}

export function DropZone({
  dragging,
  dragCategory,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  onBrowse,
  onBrowseFolder,
}: DropZoneProps) {
  const { t } = useLocale();
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ type: 'spring', stiffness: 100, damping: 20 }}
      className="mb-10"
      aria-label={t('dropzone.title')}
    >
      <div
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={onBrowse}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onBrowse();
        }}
        role="button"
        tabIndex={0}
        aria-label={t('dropzone.subtitle')}
        className={`
                  relative border-2 border-dashed rounded-3xl p-12 text-center cursor-pointer
                  transition-all duration-300
                  ${
                    dragging
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
        <div className={dragging ? 'opacity-0' : 'opacity-100 transition-opacity duration-200'}>
          <div
            style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.06em' }}
            className="text-6xl text-[var(--accent)] mb-4"
          >
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mx-auto"
            >
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
          <p
            className="text-[var(--text-muted)] text-sm mb-4"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {t('dropzone.subtitle')}
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation(); // not the file picker the zone itself opens
              onBrowseFolder();
            }}
            onKeyDown={(e) => e.stopPropagation()}
            className="text-xs underline text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-4"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {t('dropzone.folder')}
          </button>
          <p
            className="text-xs text-[var(--text-muted)] -mt-2 mb-4"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {t('dropzone.paste')}
          </p>

          <div className="flex flex-wrap justify-center gap-2">
            {ALL_CATEGORIES.map((cat) => (
              <span
                key={cat}
                className="px-3 py-1 text-xs rounded-full border opacity-75 font-medium"
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
  );
}
