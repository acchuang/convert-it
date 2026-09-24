'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatTimecode } from '@/lib/timecode';

// Picks trim points by playing the file: scrub to a moment, then "set start"
// or "set end". Uses the browser's own player, so a format it can't play
// (AVI, FLV, WMA…) shows nothing and the typed fields remain.

export function TrimScrubber({
  file,
  kind,
  start,
  end,
  onChange,
  t,
}: {
  file: File;
  kind: 'video' | 'audio';
  start: number;
  end: number;
  onChange: (patch: { trimStart?: number; trimEnd?: number }) => void;
  t: (key: string) => string;
}) {
  const media = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  // Same pattern as PreviewPanel: one URL per file, revoked when it changes.
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  const [duration, setDuration] = useState(0);
  const [now, setNow] = useState(0);
  const [playable, setPlayable] = useState(true);

  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  if (!playable) return null;

  const Tag = kind;
  const to = end > start ? end : duration;
  const pct = (s: number) => (duration ? `${Math.min(100, (s / duration) * 100)}%` : '0%');
  const round = (s: number) => Math.round(s * 10) / 10;

  return (
    <div className="flex flex-col gap-2">
      <Tag
        ref={media}
        src={url}
        controls
        preload="metadata"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
        onError={() => setPlayable(false)}
        className={kind === 'video' ? 'w-full max-h-56 rounded-lg bg-black' : 'w-full'}
      />
      {duration > 0 && (
        <>
          <div
            className="relative h-2 rounded-full cursor-pointer"
            style={{ backgroundColor: 'var(--border-secondary)' }}
            onClick={(e) => {
              const box = e.currentTarget.getBoundingClientRect();
              if (media.current)
                media.current.currentTime = ((e.clientX - box.left) / box.width) * duration;
            }}
            role="presentation"
          >
            <div
              className="absolute inset-y-0 rounded-full"
              style={{
                left: pct(start),
                width: `calc(${pct(to)} - ${pct(start)})`,
                backgroundColor: 'var(--accent)',
              }}
              data-testid="trim-selection"
            />
            <div
              className="absolute -inset-y-1 w-0.5"
              style={{ left: pct(now), backgroundColor: 'var(--text-primary)' }}
            />
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => onChange({ trimStart: round(now) })}
              className="flex-1 py-1 text-xs rounded bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-secondary)] hover:border-[var(--border-hover)]"
            >
              {t('job.setStart')} · {formatTimecode(round(now)) || '0:00'}
            </button>
            <button
              type="button"
              onClick={() => onChange({ trimEnd: round(now) })}
              className="flex-1 py-1 text-xs rounded bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-secondary)] hover:border-[var(--border-hover)]"
            >
              {t('job.setEnd')} · {formatTimecode(round(now)) || '0:00'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
