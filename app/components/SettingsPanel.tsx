'use client';

import { type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { settingsFor } from '@/lib/converters';
import type { ConversionSettings } from '@/lib/types';
import { DataSettings } from './settings/data';
import { DocumentSettings } from './settings/document';
import { ImageSettings } from './settings/image';
import { MediaSettings } from './settings/media';

// The per-job settings panel. Which groups appear comes from the converter
// registry (settingsFor): each route declares the settings it actually reads,
// so the panel never offers a control the conversion ignores. The controls
// live in one file per category under ./settings/; a route only ever uses
// one category's groups (plus the image toolbox for PDF → image).

export function SettingsPanel({
  targetExt,
  sourceExt,
  settings,
  onChange,
  t,
  file,
  footer,
}: {
  targetExt: string;
  sourceExt: string;
  /** The source, for the trim scrubber's preview. */
  file?: File;
  settings: ConversionSettings;
  onChange: (patch: Partial<ConversionSettings>) => void;
  t: (key: string) => string;
  /** Under the controls: the job card's "apply to similar files". */
  footer?: ReactNode;
}) {
  const shown = new Set(settingsFor(sourceExt, targetExt));
  const group = { shown, sourceExt, targetExt, settings, onChange, t, file };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ type: 'spring', stiffness: 100, damping: 20 }}
      className="overflow-hidden"
    >
      <div
        className="mt-4 pt-3 border-t border-[var(--border-primary)] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        <DataSettings {...group} />
        <MediaSettings {...group} />
        <DocumentSettings {...group} />
        <ImageSettings {...group} />
      </div>
      {footer}
    </motion.div>
  );
}
