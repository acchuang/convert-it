'use client';

import { useEffect, useState } from 'react';
import type { PhotoMetadata } from '@/lib/image-metadata';

// What a photo carries, so "remove" and "keep" are informed choices: the
// place it was taken is the one people most often don't know is in there.

type State = { status: 'reading' } | { status: 'done'; meta: PhotoMetadata | null };

function exposure(m: PhotoMetadata): string | undefined {
  const parts = [
    m.fNumber && `f/${+m.fNumber.toFixed(1)}`,
    m.exposureTime &&
      (m.exposureTime < 1 ? `1/${Math.round(1 / m.exposureTime)} s` : `${m.exposureTime} s`),
    m.iso && `ISO ${m.iso}`,
    m.focalLength && `${+m.focalLength.toFixed(1)} mm`,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : undefined;
}

export function MetadataReport({
  file,
  mode,
  t,
}: {
  file: File;
  mode: string;
  t: (key: string) => string;
}) {
  const [state, setState] = useState<State>({ status: 'reading' });

  useEffect(() => {
    let live = true;
    import('@/lib/image-metadata')
      .then(({ readMetadata }) => readMetadata(file))
      .then(
        (meta) => live && setState({ status: 'done', meta }),
        () => live && setState({ status: 'done', meta: null }),
      );
    return () => {
      live = false;
    };
  }, [file]);

  if (state.status === 'reading') return null;
  const { meta } = state;
  if (!meta) return <p className="text-xs text-[var(--text-muted)]">{t('job.metaNone')}</p>;

  const rows: [string, string | undefined, boolean?][] = [
    [
      t('job.metaLocation'),
      meta.gps && `${meta.gps.latitude.toFixed(4)}, ${meta.gps.longitude.toFixed(4)}`,
      true,
    ],
    [t('job.metaCamera'), [meta.make, meta.model].filter(Boolean).join(' ') || undefined],
    [t('job.metaLens'), meta.lens],
    [t('job.metaTaken'), meta.taken?.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')],
    [t('job.metaExposure'), exposure(meta)],
    [t('job.metaSoftware'), meta.software],
    [t('job.metaAuthor'), [meta.artist, meta.copyright].filter(Boolean).join(' · ') || undefined],
  ];
  const removed = (isLocation?: boolean) =>
    mode === 'strip' || (mode === 'keep-no-gps' && isLocation);

  return (
    <div className="flex flex-col gap-1" data-testid="metadata-report">
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
        {rows
          .filter(([, value]) => value)
          .map(([label, value, isLocation]) => (
            <div key={label} className="contents">
              <dt className="text-[var(--text-muted)]">{label}</dt>
              <dd
                className={
                  removed(isLocation)
                    ? 'line-through text-[var(--text-muted)] break-words'
                    : 'text-primary break-words'
                }
              >
                {value}
              </dd>
            </div>
          ))}
      </dl>
      <p className="text-xs text-[var(--text-muted)]">
        {mode === 'keep'
          ? t('job.metaWillKeep')
          : mode === 'keep-no-gps'
            ? t('job.metaWillKeepNoGps')
            : t('job.metaWillStrip')}
      </p>
    </div>
  );
}
