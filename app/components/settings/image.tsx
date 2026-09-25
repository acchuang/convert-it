'use client';

// Image quality and presets, HEIC images, metadata, resize, crop, size budget.

import { MetadataReport } from '../MetadataReport';
import { activePreset, IMAGE_PRESETS } from '@/lib/presets';
import { CARD, LABEL, choice, type GroupProps } from './controls';

const RESIZE_PRESETS = [25, 50, 75, 100];
const CROP_ASPECTS = ['none', '1:1', '4:3', '16:9', '3:2'];

export function ImageSettings({ shown, settings, onChange, t, file }: GroupProps) {
  const qualityPct = Math.round(settings.quality * 100);
  const usingExactSize = settings.imageResizeWidth > 0 || settings.imageResizeHeight > 0;
  const imagePreset = activePreset(IMAGE_PRESETS, settings);
  return (
    <>
      {shown.has('quality') && (
        <div className="bg-[var(--bg-tertiary)]/60 border border-[var(--border-secondary)] rounded-xl p-3 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-muted)] text-xs uppercase tracking-wider font-semibold">
              {t('job.quality')}
            </span>
            <span className="text-primary text-xs font-semibold">{qualityPct}%</span>
          </div>
          <input
            type="range"
            min={10}
            max={100}
            value={qualityPct}
            onChange={(e) => onChange({ quality: Number(e.target.value) / 100 })}
            aria-label={t('job.quality')}
            className="w-full accent-[var(--accent)]"
          />
          <div className="flex justify-between text-xs text-[var(--text-muted)]">
            <span>{t('job.qualityLow')}</span>
            <span>{t('job.qualityHigh')}</span>
          </div>
          {shown.has('imageTransform') && (
            <div className="flex gap-1">
              {IMAGE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onChange(p.patch)}
                  aria-pressed={imagePreset === p.id}
                  title={
                    p.patch.imageMaxSide
                      ? t('job.maxSideNote').replace('{n}', String(p.patch.imageMaxSide))
                      : undefined
                  }
                  className={choice(imagePreset === p.id)}
                >
                  {t(`job.preset${p.id[0].toUpperCase()}${p.id.slice(1)}`)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {shown.has('heicImages') && (
        <div className={CARD}>
          <span className={LABEL}>{t('job.heicImages')}</span>
          <div className="flex gap-1">
            {([false, true] as const).map((all) => (
              <button
                key={String(all)}
                onClick={() => onChange({ heicAllImages: all })}
                className={choice(settings.heicAllImages === all)}
              >
                {all ? t('job.heicAll') : t('job.heicPrimary')}
              </button>
            ))}
          </div>
          <span className="text-xs text-[var(--text-muted)]">{t('job.heicHint')}</span>
        </div>
      )}

      {shown.has('metadata') && (
        <div className={CARD}>
          <span className={LABEL}>{t('job.metadata')}</span>
          <div className="flex gap-1">
            {(['strip', 'keep-no-gps', 'keep'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => onChange({ metadata: mode })}
                aria-pressed={settings.metadata === mode}
                className={choice(settings.metadata === mode)}
              >
                {mode === 'strip'
                  ? t('job.metaStrip')
                  : mode === 'keep'
                    ? t('job.metaKeep')
                    : t('job.metaKeepNoGps')}
              </button>
            ))}
          </div>
          {file && <MetadataReport file={file} mode={settings.metadata} t={t} />}
        </div>
      )}

      {shown.has('imageTransform') && (
        <>
          <div className="bg-[var(--bg-tertiary)]/60 border border-[var(--border-secondary)] rounded-xl p-3 flex flex-col justify-between gap-2">
            <span className="text-[var(--text-muted)] text-xs uppercase tracking-wider font-semibold">
              {t('job.resize')}
            </span>
            <div className="flex gap-1">
              {RESIZE_PRESETS.map((n) => (
                <button
                  key={n}
                  onClick={() =>
                    onChange({ imageResizePercent: n, imageResizeWidth: 0, imageResizeHeight: 0 })
                  }
                  className={`flex-1 py-1 text-xs rounded transition-colors ${
                    !usingExactSize && settings.imageResizePercent === n
                      ? 'bg-[var(--accent)] text-[var(--accent-text)] font-semibold'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-secondary)] hover:border-[var(--border-hover)]'
                  }`}
                >
                  {n}%
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <input
                type="number"
                min={0}
                value={settings.imageResizeWidth || ''}
                onChange={(e) =>
                  onChange({ imageResizeWidth: Math.max(0, Number(e.target.value)) })
                }
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border-secondary)] text-primary text-xs rounded px-2 py-1 focus:outline-none focus:border-[var(--accent)] transition-colors"
                placeholder={t('job.width')}
                aria-label={t('job.width')}
              />
              <span className="text-[var(--text-muted)] text-xs">×</span>
              <input
                type="number"
                min={0}
                value={settings.imageResizeHeight || ''}
                onChange={(e) =>
                  onChange({ imageResizeHeight: Math.max(0, Number(e.target.value)) })
                }
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border-secondary)] text-primary text-xs rounded px-2 py-1 focus:outline-none focus:border-[var(--accent)] transition-colors"
                placeholder={t('job.height')}
                aria-label={t('job.height')}
              />
            </div>
            {settings.imageMaxSide > 0 && (
              <span className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                {t('job.maxSideNote').replace('{n}', String(settings.imageMaxSide))}
                <button
                  onClick={() => onChange({ imageMaxSide: 0 })}
                  className="underline hover:text-[var(--text-secondary)]"
                >
                  {t('job.maxSideClear')}
                </button>
              </span>
            )}
          </div>

          <div className="bg-[var(--bg-tertiary)]/60 border border-[var(--border-secondary)] rounded-xl p-3 flex flex-col justify-between gap-2">
            <span className="text-[var(--text-muted)] text-xs uppercase tracking-wider font-semibold">
              {t('job.crop')}
            </span>
            <div className="flex gap-1">
              {CROP_ASPECTS.map((aspect) => (
                <button
                  key={aspect}
                  onClick={() => onChange({ imageCropAspect: aspect })}
                  className={`flex-1 py-1 text-xs rounded transition-colors ${
                    settings.imageCropAspect === aspect
                      ? 'bg-[var(--accent)] text-[var(--accent-text)] font-semibold'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-secondary)] hover:border-[var(--border-hover)]'
                  }`}
                >
                  {aspect === 'none' ? t('job.cropOff') : aspect}
                </button>
              ))}
            </div>
          </div>

          {shown.has('targetSize') && (
            <div className="bg-[var(--bg-tertiary)]/60 border border-[var(--border-secondary)] rounded-xl p-3 flex flex-col justify-between gap-2">
              <span className="text-[var(--text-muted)] text-xs uppercase tracking-wider font-semibold">
                {t('job.maxSize')}
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={settings.imageTargetSizeKb || ''}
                  onChange={(e) =>
                    onChange({ imageTargetSizeKb: Math.max(0, Number(e.target.value)) })
                  }
                  className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-secondary)] text-primary text-xs rounded px-2.5 py-1.5 focus:outline-none focus:border-[var(--accent)] transition-colors"
                  placeholder={t('job.maxSizeOff')}
                  aria-label={t('job.maxSize')}
                />
                <span className="text-[var(--text-muted)] text-xs">KB</span>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
