'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatFileSize, getFormatInfo } from '@/lib/converters';

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'html', 'csv', 'json', 'xml', 'yaml', 'tsv']);
// Sources an <img> shows in every current browser (HEIC, JPEG XL, PDF… don't
// get a "before" side). A result that fails to load says so instead.
const IMG_SOURCES = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'ico', 'svg', 'avif']);

function isTextPreview(ext: string): boolean {
  return TEXT_EXTENSIONS.has(ext.toLowerCase());
}

type Kind = 'text' | 'image' | 'video' | 'audio' | null;

function previewKind(ext: string): Kind {
  if (isTextPreview(ext)) return 'text';
  const category = getFormatInfo(ext)?.category;
  return category === 'image' || category === 'video' || category === 'audio' ? category : null;
}

/** An object URL for a blob while it's shown, revoked after. */
function useObjectUrl(blob: Blob | undefined | null): string | null {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);
  return url;
}

function Caption({
  label,
  bytes,
  size,
  align = 'left',
}: {
  label: string;
  bytes: number;
  size?: [number, number];
  align?: 'left' | 'right';
}) {
  return (
    <span className={`text-xs text-[var(--text-muted)] ${align === 'right' ? 'text-right' : ''}`}>
      <span className="text-[var(--text-secondary)] font-semibold">{label}</span> ·{' '}
      {formatFileSize(bytes)}
      {size && ` · ${size[0]}×${size[1]}`}
    </span>
  );
}

/**
 * Before on the left, after on the right, split where the slider (or a drag
 * across the picture) says. Both are fitted into the same box, so a crop or
 * resize shows as what it is.
 */
function Compare({ before, after, t }: { before: File; after: Blob; t: (key: string) => string }) {
  const beforeUrl = useObjectUrl(before);
  const afterUrl = useObjectUrl(after);
  const [split, setSplit] = useState(50);
  const [sizes, setSizes] = useState<{ before?: [number, number]; after?: [number, number] }>({});
  const [broken, setBroken] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const measure = (side: 'before' | 'after') => (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
    if (w && h) setSizes((s) => ({ ...s, [side]: [w, h] }));
  };
  const drag = (e: React.PointerEvent) => {
    if (e.type === 'pointermove' && !e.buttons) return;
    const rect = box.current?.getBoundingClientRect();
    if (!rect?.width) return;
    setSplit(Math.round(Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100))));
  };

  if (broken || !beforeUrl || !afterUrl) {
    return <ImageOnly blob={after} t={t} />;
  }
  return (
    <div className="flex flex-col gap-2">
      <div
        ref={box}
        className="relative h-64 bg-[var(--bg-primary)] rounded-lg overflow-hidden cursor-ew-resize select-none touch-none"
        style={{ border: '1px solid var(--border-primary)' }}
        onPointerDown={drag}
        onPointerMove={drag}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={beforeUrl}
          alt={t('job.before')}
          onLoad={measure('before')}
          onError={() => setBroken(true)}
          draggable={false}
          className="absolute inset-0 w-full h-full object-contain"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={afterUrl}
          alt={t('job.preview')}
          onLoad={measure('after')}
          onError={() => setBroken(true)}
          draggable={false}
          className="absolute inset-0 w-full h-full object-contain"
          style={{ clipPath: `inset(0 0 0 ${split}%)` }}
        />
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-[var(--accent)] pointer-events-none"
          style={{ left: `calc(${split}% - 1px)` }}
          aria-hidden="true"
        />
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={split}
        onChange={(e) => setSplit(Number(e.target.value))}
        aria-label={t('job.compare')}
        className="w-full accent-[var(--accent)]"
      />
      <div className="flex justify-between gap-2" style={{ fontFamily: 'var(--font-mono)' }}>
        <Caption label={t('job.before')} bytes={before.size} size={sizes.before} />
        <Caption label={t('job.after')} bytes={after.size} size={sizes.after} align="right" />
      </div>
    </div>
  );
}

function ImageOnly({ blob, t }: { blob: Blob; t: (key: string) => string }) {
  const url = useObjectUrl(blob);
  const [size, setSize] = useState<[number, number]>();
  const [broken, setBroken] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div
        className="bg-[var(--bg-primary)] rounded-lg p-2 flex items-center justify-center max-h-80 overflow-hidden"
        style={{ border: '1px solid var(--border-primary)' }}
      >
        {broken || !url ? (
          <p
            className="text-xs text-[var(--text-muted)] py-4"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {t('job.previewUnavailable')}
          </p>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={t('job.preview')}
            onLoad={(e) => setSize([e.currentTarget.naturalWidth, e.currentTarget.naturalHeight])}
            onError={() => setBroken(true)}
            className="max-w-full max-h-64 object-contain rounded"
          />
        )}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)' }}>
        <Caption label={t('job.after')} bytes={blob.size} size={size} />
      </div>
    </div>
  );
}

function Player({
  blob,
  kind,
  t,
}: {
  blob: Blob;
  kind: 'video' | 'audio';
  t: (key: string) => string;
}) {
  const url = useObjectUrl(blob);
  const [broken, setBroken] = useState(false);
  if (broken || !url) {
    return (
      <p
        className="text-xs text-[var(--text-muted)] py-4 text-center"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {t('job.previewUnavailable')}
      </p>
    );
  }
  return kind === 'video' ? (
    <video
      src={url}
      controls
      onError={() => setBroken(true)}
      aria-label={t('job.preview')}
      className="w-full max-h-72 rounded-lg bg-black"
    />
  ) : (
    <audio
      src={url}
      controls
      onError={() => setBroken(true)}
      aria-label={t('job.preview')}
      className="w-full"
    />
  );
}

export function PreviewPanel({
  blob,
  source,
  targetExt,
  open,
  onClose,
  t,
}: {
  blob: Blob | undefined;
  /** The file converted, for the before/after comparison. */
  source?: File;
  targetExt: string | null;
  open: boolean;
  onClose: () => void;
  t: (key: string) => string;
}) {
  const kind = open && blob && targetExt ? previewKind(targetExt) : null;
  const showText = kind === 'text';
  const canCompare =
    kind === 'image' && !!source && IMG_SOURCES.has(source.name.split('.').pop()!.toLowerCase());

  // Tagged with its source blob so a new result never shows the previous file's text.
  // text === null after settling means the read failed.
  const [loaded, setLoaded] = useState<{ src: Blob; text: string | null } | null>(null);
  const settled = loaded !== null && loaded.src === blob;
  const textContent = loaded && loaded.src === blob ? loaded.text : null;
  const loading = showText && !settled;

  useEffect(() => {
    if (!showText || !blob) return;
    let cancelled = false;

    blob
      .text()
      .then((text) => {
        if (!cancelled) setLoaded({ src: blob, text });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ src: blob, text: null });
      });

    return () => {
      cancelled = true;
    };
  }, [showText, blob]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ type: 'spring', stiffness: 100, damping: 20 }}
          className="overflow-hidden"
        >
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border-primary)' }}>
            <div className="flex items-center justify-between mb-2">
              <span
                className="text-xs text-[var(--text-muted)] uppercase tracking-wider"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {t('job.preview')}
              </span>
              <button
                onClick={onClose}
                className="text-[var(--text-dim)] hover:text-[var(--error)] transition-colors"
                aria-label={t('job.closePreview')}
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

            {loading && (
              <div className="flex items-center justify-center py-8">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-5 h-5 border-2 rounded-full"
                  style={{ borderColor: 'var(--accent)', opacity: 0.3 }}
                />
              </div>
            )}

            {textContent !== null && (
              <div
                className="bg-[var(--bg-primary)] rounded-lg p-3 max-h-80 overflow-auto"
                style={{ border: '1px solid var(--border-primary)' }}
              >
                <pre
                  className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap break-all"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {textContent.slice(0, 50000)}
                  {textContent.length > 50000 && `\n\n${t('job.truncated')}`}
                </pre>
              </div>
            )}

            {kind === 'image' &&
              blob &&
              (canCompare ? (
                <Compare before={source!} after={blob} t={t} />
              ) : (
                <ImageOnly blob={blob} t={t} />
              ))}

            {(kind === 'video' || kind === 'audio') && blob && (
              <Player blob={blob} kind={kind} t={t} />
            )}

            {(!kind || (showText && settled && textContent === null)) && (
              <p
                className="text-xs text-[var(--text-muted)] py-4 text-center"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {t('job.previewUnavailable')}
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
