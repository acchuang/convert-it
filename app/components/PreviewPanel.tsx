'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'html', 'csv', 'json', 'xml', 'yaml', 'tsv',
]);

function isTextPreview(ext: string): boolean {
  return TEXT_EXTENSIONS.has(ext.toLowerCase());
}

export function PreviewPanel({
  blob,
  targetExt,
  open,
  onClose,
}: {
  blob: Blob | undefined;
  targetExt: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !blob || !targetExt) return;

    setLoading(true);
    setTextContent(null);
    setImageUrl(null);

    if (isTextPreview(targetExt)) {
      blob.text().then(t => {
        setTextContent(t);
        setLoading(false);
      }).catch(() => setLoading(false));
    } else {
      const url = URL.createObjectURL(blob);
      setImageUrl(url);
      setLoading(false);
      return () => URL.revokeObjectURL(url);
    }
  }, [open, blob, targetExt]);

  // Cleanup image URL on unmount
  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.25 }}
          className="overflow-hidden"
        >
          <div
            className="mt-3 pt-3"
            style={{ borderTop: '1px solid var(--border-primary)' }}
          >
            <div className="flex items-center justify-between mb-2">
              <span
                className="text-xs text-[var(--text-muted)] uppercase tracking-wider"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                Preview
              </span>
              <button
                onClick={onClose}
                className="text-[var(--text-dim)] hover:text-[var(--error)] transition-colors"
                aria-label="Close preview"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {loading && (
              <div className="flex items-center justify-center py-8" aria-label="Loading preview">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-5 h-5 border-2 rounded-full"
                  style={{ borderColor: 'var(--accent)', borderTopColor: 'var(--accent)', opacity: 0.3 }}
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
                  {textContent.length > 50000 && '\n\n... (truncated)'}
                </pre>
              </div>
            )}

            {imageUrl && (
              <div
                className="bg-[var(--bg-primary)] rounded-lg p-2 flex items-center justify-center max-h-80 overflow-hidden"
                style={{ border: '1px solid var(--border-primary)' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt="Preview of converted image"
                  className="max-w-full max-h-64 object-contain rounded"
                />
              </div>
            )}

            {!loading && !textContent && !imageUrl && (
              <p className="text-xs text-[var(--text-muted)] py-4 text-center" style={{ fontFamily: 'var(--font-mono)' }}>
                Preview not available for this format
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
