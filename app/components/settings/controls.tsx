'use client';

// Controls and styles shared by the settings groups.

import { useState } from 'react';
import { formatTimecode, parseTimecode } from '@/lib/timecode';
import type { SettingKey } from '@/lib/converters';
import type { ConversionSettings } from '@/lib/types';

/** What every settings group gets from the panel. */
export interface GroupProps {
  /** The groups this route reads (settingsFor). */
  shown: ReadonlySet<SettingKey>;
  sourceExt: string;
  targetExt: string;
  settings: ConversionSettings;
  onChange: (patch: Partial<ConversionSettings>) => void;
  t: (key: string) => string;
  /** The source, for the trim scrubber and the metadata report. */
  file?: File;
}

export const CARD =
  'bg-(--bg-tertiary)/60 border border-(--border-secondary) rounded-xl p-3 flex flex-col justify-between gap-2';
export const LABEL = 'text-(--text-muted) text-xs uppercase tracking-wider font-semibold';
export const choice = (on: boolean) =>
  `flex-1 py-1 text-xs rounded-sm transition-colors ${
    on
      ? 'bg-(--accent) text-(--accent-text) font-semibold'
      : 'bg-(--bg-secondary) text-(--text-secondary) border border-(--border-secondary) hover:border-(--border-hover)'
  }`;

/** A time typed as 1:30 or 90, committed on blur or Enter; bad input is flagged, not saved. */
export function TimeField({
  seconds,
  onCommit,
  label,
  placeholder,
}: {
  seconds: number;
  onCommit: (seconds: number) => void;
  label: string;
  placeholder: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? formatTimecode(seconds);
  const invalid = draft !== null && parseTimecode(draft) === null;
  const commit = () => {
    if (draft === null) return;
    const parsed = parseTimecode(draft);
    if (parsed !== null) {
      onCommit(parsed);
      setDraft(null);
    }
  };
  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
      aria-label={label}
      aria-invalid={invalid}
      placeholder={placeholder}
      className={`w-full bg-(--bg-secondary) border text-primary text-xs rounded-sm px-2 py-1 focus:outline-hidden transition-colors ${
        invalid ? 'border-(--error)' : 'border-(--border-secondary) focus:border-(--accent)'
      }`}
    />
  );
}
