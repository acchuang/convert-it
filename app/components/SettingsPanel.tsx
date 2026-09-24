'use client';

import { motion } from 'framer-motion';
import { settingsFor } from '@/lib/converters';
import type { ConversionSettings } from '@/lib/types';

// The per-job settings panel. Which groups appear comes from the converter
// registry (settingsFor): each route declares the settings it actually reads,
// so the panel never offers a control the conversion ignores.

const RESIZE_PRESETS = [25, 50, 75, 100];
const CROP_ASPECTS = ['none', '1:1', '4:3', '16:9', '3:2'];

export function SettingsPanel({
  targetExt,
  sourceExt,
  settings,
  onChange,
  t,
}: {
  targetExt: string;
  sourceExt: string;
  settings: ConversionSettings;
  onChange: (patch: Partial<ConversionSettings>) => void;
  t: (key: string) => string;
}) {
  const shown = new Set(settingsFor(sourceExt, targetExt));
  const showQuality = shown.has('quality');
  const showDelimiter = shown.has('csvDelimiter');
  const showIndent = shown.has('jsonIndent');
  const showRootEl = shown.has('xmlRoot');
  const showAudioBitrate = shown.has('audioBitrate');
  const showVideoSettings = shown.has('video');
  const showPdfPages = shown.has('pdfPages');
  const showPdfScale = shown.has('pdfScale');
  const showXlsxSheets = shown.has('xlsxSheets');
  const showImageTools = shown.has('imageTransform');
  const showTargetSize = shown.has('targetSize');

  const qualityPct = Math.round(settings.quality * 100);
  const usingExactSize = settings.imageResizeWidth > 0 || settings.imageResizeHeight > 0;

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
        {showQuality && (
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
              className="w-full accent-[var(--accent)]"
            />
            <div className="flex justify-between text-xs text-[var(--text-muted)]">
              <span>Low (Compact)</span>
              <span>High (Sharp)</span>
            </div>
          </div>
        )}

        {showDelimiter && (
          <div className="bg-[var(--bg-tertiary)]/60 border border-[var(--border-secondary)] rounded-xl p-3 flex flex-col justify-between gap-2">
            <span className="text-[var(--text-muted)] text-xs uppercase tracking-wider font-semibold">
              {t('job.delimiter')}
            </span>
            <div className="flex gap-1">
              {([',', ';', '|', '\t'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => onChange({ csvDelimiter: d })}
                  className={`flex-1 py-1 text-xs rounded transition-colors ${
                    settings.csvDelimiter === d
                      ? 'bg-[var(--accent)] text-[var(--accent-text)] font-semibold'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-secondary)] hover:border-[var(--border-hover)]'
                  }`}
                >
                  {d === '\t'
                    ? t('job.tab')
                    : d === ','
                      ? t('job.comma')
                      : d === ';'
                        ? t('job.semi')
                        : t('job.pipe')}
                </button>
              ))}
            </div>
          </div>
        )}

        {showIndent && (
          <div className="bg-[var(--bg-tertiary)]/60 border border-[var(--border-secondary)] rounded-xl p-3 flex flex-col justify-between gap-2">
            <span className="text-[var(--text-muted)] text-xs uppercase tracking-wider font-semibold">
              {t('job.indent')}
            </span>
            <div className="flex gap-1">
              {([2, 4, 0] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => onChange({ jsonIndent: n })}
                  className={`flex-1 py-1 text-xs rounded transition-colors ${
                    settings.jsonIndent === n
                      ? 'bg-[var(--accent)] text-[var(--accent-text)] font-semibold'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-secondary)] hover:border-[var(--border-hover)]'
                  }`}
                >
                  {n === 0 ? t('job.min') : `${n}${t('job.sp2').slice(1)}`}
                </button>
              ))}
            </div>
          </div>
        )}

        {showRootEl && (
          <div className="bg-[var(--bg-tertiary)]/60 border border-[var(--border-secondary)] rounded-xl p-3 flex flex-col justify-between gap-2">
            <span className="text-[var(--text-muted)] text-xs uppercase tracking-wider font-semibold">
              {t('job.root')}
            </span>
            <input
              type="text"
              value={settings.xmlRootElement}
              onChange={(e) => onChange({ xmlRootElement: e.target.value || 'root' })}
              className="bg-[var(--bg-secondary)] border border-[var(--border-secondary)] text-primary text-xs rounded px-2.5 py-1.5 w-full focus:outline-none focus:border-[var(--accent)] transition-colors"
              placeholder="root"
            />
          </div>
        )}

        {showAudioBitrate && (
          <div className="bg-[var(--bg-tertiary)]/60 border border-[var(--border-secondary)] rounded-xl p-3 flex flex-col justify-between gap-2">
            <span className="text-[var(--text-muted)] text-xs uppercase tracking-wider font-semibold">
              {t('job.bitrate')}
            </span>
            <div className="flex gap-1">
              {([64, 128, 192, 256, 320] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => onChange({ audioBitrate: n })}
                  className={`flex-1 py-1 text-xs rounded transition-colors ${
                    settings.audioBitrate === n
                      ? 'bg-[var(--accent)] text-[var(--accent-text)] font-semibold'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-secondary)] hover:border-[var(--border-hover)]'
                  }`}
                >
                  {n}k
                </button>
              ))}
            </div>
          </div>
        )}

        {showXlsxSheets && (
          <div className="bg-[var(--bg-tertiary)]/60 border border-[var(--border-secondary)] rounded-xl p-3 flex flex-col justify-between gap-2">
            <span className="text-[var(--text-muted)] text-xs uppercase tracking-wider font-semibold">
              {t('job.xlsxSheets')}
            </span>
            <div className="flex gap-1">
              {([false, true] as const).map((all) => (
                <button
                  key={String(all)}
                  onClick={() => onChange({ xlsxAllSheets: all })}
                  aria-pressed={settings.xlsxAllSheets === all}
                  className={`flex-1 py-1 text-xs rounded transition-colors ${
                    settings.xlsxAllSheets === all
                      ? 'bg-[var(--accent)] text-[var(--accent-text)] font-semibold'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-secondary)] hover:border-[var(--border-hover)]'
                  }`}
                >
                  {all ? t('job.xlsxAllSheets') : t('job.xlsxFirstSheet')}
                </button>
              ))}
            </div>
          </div>
        )}

        {showPdfPages && (
          <div className="bg-[var(--bg-tertiary)]/60 border border-[var(--border-secondary)] rounded-xl p-3 flex flex-col justify-between gap-2">
            <span className="text-[var(--text-muted)] text-xs uppercase tracking-wider font-semibold">
              {t('job.pdfPages')}
            </span>
            <div className="flex gap-1">
              {([false, true] as const).map((all) => (
                <button
                  key={String(all)}
                  onClick={() => onChange({ pdfAllPages: all })}
                  className={`flex-1 py-1 text-xs rounded transition-colors ${
                    settings.pdfAllPages === all
                      ? 'bg-[var(--accent)] text-[var(--accent-text)] font-semibold'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-secondary)] hover:border-[var(--border-hover)]'
                  }`}
                >
                  {all ? t('job.pdfAllPages') : t('job.pdfFirstPage')}
                </button>
              ))}
            </div>
          </div>
        )}

        {showPdfScale && (
          <div className="bg-[var(--bg-tertiary)]/60 border border-[var(--border-secondary)] rounded-xl p-3 flex flex-col justify-between gap-2">
            <span className="text-[var(--text-muted)] text-xs uppercase tracking-wider font-semibold">
              {t('job.pdfScale')}
            </span>
            <div className="flex gap-1">
              {([1, 2, 3] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => onChange({ pdfScale: n })}
                  className={`flex-1 py-1 text-xs rounded transition-colors ${
                    settings.pdfScale === n
                      ? 'bg-[var(--accent)] text-[var(--accent-text)] font-semibold'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-secondary)] hover:border-[var(--border-hover)]'
                  }`}
                >
                  {n}x
                </button>
              ))}
            </div>
          </div>
        )}

        {showVideoSettings && (
          <>
            <div className="bg-[var(--bg-tertiary)]/60 border border-[var(--border-secondary)] rounded-xl p-3 flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-muted)] text-xs uppercase tracking-wider font-semibold">
                  {t('job.quality')}
                </span>
                <span className="text-primary text-xs font-semibold">
                  CRF {settings.videoQuality} ·{' '}
                  {settings.videoQuality <= 20
                    ? 'High'
                    : settings.videoQuality <= 28
                      ? 'Balanced'
                      : 'Compact'}
                </span>
              </div>
              <input
                type="range"
                min={18}
                max={51}
                value={settings.videoQuality}
                onChange={(e) => onChange({ videoQuality: Number(e.target.value) })}
                className="w-full"
                style={{ accentColor: 'var(--video-color)' }}
              />
              <span className="text-xs text-[var(--text-muted)]">
                Lower CRF = higher quality & larger file
              </span>
            </div>

            <div className="bg-[var(--bg-tertiary)]/60 border border-[var(--border-secondary)] rounded-xl p-3 flex flex-col justify-between gap-2">
              <span className="text-[var(--text-muted)] text-xs uppercase tracking-wider font-semibold">
                {t('job.preset')}
              </span>
              <div className="relative inline-flex items-center">
                <select
                  value={settings.videoPreset}
                  onChange={(e) => onChange({ videoPreset: e.target.value })}
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border-secondary)] text-primary text-xs rounded-lg pl-2.5 pr-7 py-1.5 appearance-none cursor-pointer hover:border-[var(--border-hover)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                >
                  {(
                    [
                      'ultrafast',
                      'superfast',
                      'veryfast',
                      'faster',
                      'fast',
                      'medium',
                      'slow',
                      'slower',
                      'veryslow',
                    ] as const
                  ).map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <svg
                  className="absolute right-2 pointer-events-none text-[var(--text-muted)]"
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  aria-hidden="true"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
            </div>
          </>
        )}

        {showImageTools && (
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

            {showTargetSize && (
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
      </div>
    </motion.div>
  );
}
