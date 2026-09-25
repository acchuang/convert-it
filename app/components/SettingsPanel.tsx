'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { getFormatInfo, settingsFor } from '@/lib/converters';
import { TrimScrubber } from './TrimScrubber';
import { MetadataReport } from './MetadataReport';
import { formatTimecode, parseTimecode } from '@/lib/timecode';
import { isPageRangeSyntax } from '@/lib/pdf-options';
import { activePreset, IMAGE_PRESETS, LOSSLESS_VIDEO_TARGETS, VIDEO_PRESETS } from '@/lib/presets';
import type { ConversionSettings } from '@/lib/types';

// The per-job settings panel. Which groups appear comes from the converter
// registry (settingsFor): each route declares the settings it actually reads,
// so the panel never offers a control the conversion ignores.

const RESIZE_PRESETS = [25, 50, 75, 100];
const CROP_ASPECTS = ['none', '1:1', '4:3', '16:9', '3:2'];
const ANIM_FPS = [8, 12, 15, 24];
const ANIM_WIDTHS = [320, 480, 640, 0];

const CARD =
  'bg-[var(--bg-tertiary)]/60 border border-[var(--border-secondary)] rounded-xl p-3 flex flex-col justify-between gap-2';
const LABEL = 'text-[var(--text-muted)] text-xs uppercase tracking-wider font-semibold';
const choice = (on: boolean) =>
  `flex-1 py-1 text-xs rounded transition-colors ${
    on
      ? 'bg-[var(--accent)] text-[var(--accent-text)] font-semibold'
      : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-secondary)] hover:border-[var(--border-hover)]'
  }`;

/** A time typed as 1:30 or 90, committed on blur or Enter; bad input is flagged, not saved. */
function TimeField({
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
      className={`w-full bg-[var(--bg-secondary)] border text-primary text-xs rounded px-2 py-1 focus:outline-none transition-colors ${
        invalid
          ? 'border-[var(--error)]'
          : 'border-[var(--border-secondary)] focus:border-[var(--accent)]'
      }`}
    />
  );
}

const VIDEO_WIDTHS = [0, 1920, 1280, 854];
const X264_PRESETS = [
  'ultrafast',
  'superfast',
  'veryfast',
  'faster',
  'fast',
  'medium',
  'slow',
  'slower',
  'veryslow',
] as const;
// OCR languages by their own names, so each is findable by its readers.
const OCR_LANGUAGE_NAMES: Record<string, string> = {
  eng: 'English',
  spa: 'Español',
  fra: 'Français',
  deu: 'Deutsch',
  chi_sim: '简体中文',
  chi_tra: '繁體中文',
  jpn: '日本語',
  kor: '한국어',
};

export function SettingsPanel({
  targetExt,
  sourceExt,
  settings,
  onChange,
  t,
  file,
}: {
  targetExt: string;
  sourceExt: string;
  /** The source, for the trim scrubber's preview. */
  file?: File;
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
  const showVideoQuality = shown.has('videoQuality');
  const showVideoPreset = shown.has('videoPreset');
  const showAnimation = shown.has('animation');
  const showTrim = shown.has('trim');
  const showVideoSize = shown.has('videoSize');
  const showMute = shown.has('mute');
  const mediaKind = getFormatInfo(sourceExt)?.category === 'video' ? 'video' : 'audio';
  const showMetadata = shown.has('metadata');
  const showOcr = shown.has('ocr');
  const showSubtitleOffset = shown.has('subtitleOffset');
  const showBurn = shown.has('burnSubtitles');
  const showPdfEdit = shown.has('pdfEdit');
  const showPdfCompress = shown.has('pdfCompress');
  const showPdfPageSize = shown.has('pdfPageSize');
  const showPdfPages = shown.has('pdfPages');
  const showPdfScale = shown.has('pdfScale');
  const showXlsxSheets = shown.has('xlsxSheets');
  const showImageTools = shown.has('imageTransform');
  const showTargetSize = shown.has('targetSize');

  const qualityPct = Math.round(settings.quality * 100);
  const usingExactSize = settings.imageResizeWidth > 0 || settings.imageResizeHeight > 0;
  // Where the preset (encoder speed) isn't read (avi/flv), CRF alone decides.
  const videoPreset = activePreset(
    showVideoPreset
      ? VIDEO_PRESETS
      : VIDEO_PRESETS.map((p) => ({ ...p, patch: { videoQuality: p.patch.videoQuality } })),
    settings,
  );
  const imagePreset = activePreset(IMAGE_PRESETS, settings);

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
            {showImageTools && (
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

        {showVideoQuality && (
          <div className={CARD}>
            <div className="flex items-center justify-between">
              <span className={LABEL}>{t('job.quality')}</span>
              <span className="text-primary text-xs font-semibold">
                CRF {settings.videoQuality}
              </span>
            </div>
            <div className="flex gap-1">
              {VIDEO_PRESETS.filter(
                (p) => p.id !== 'lossless' || LOSSLESS_VIDEO_TARGETS.has(targetExt),
              ).map((p) => (
                <button
                  key={p.id}
                  onClick={() =>
                    onChange(showVideoPreset ? p.patch : { videoQuality: p.patch.videoQuality })
                  }
                  aria-pressed={videoPreset === p.id}
                  className={choice(videoPreset === p.id)}
                >
                  {t(`job.preset${p.id[0].toUpperCase()}${p.id.slice(1)}`)}
                </button>
              ))}
            </div>
            {videoPreset === 'lossless' && (
              <span className="text-xs text-[var(--text-muted)]">{t('job.losslessHint')}</span>
            )}
            <details className="text-xs">
              <summary className="cursor-pointer text-[var(--text-muted)]">
                {t('job.advanced')}
              </summary>
              <div className="mt-2 flex flex-col gap-2">
                <input
                  type="range"
                  min={0}
                  max={51}
                  value={settings.videoQuality}
                  onChange={(e) => onChange({ videoQuality: Number(e.target.value) })}
                  aria-label="CRF"
                  className="w-full"
                  style={{ accentColor: 'var(--video-color)' }}
                />
                <span className="text-xs text-[var(--text-muted)]">{t('job.crfHint')}</span>
                {showVideoPreset && (
                  <label className="flex flex-col gap-1">
                    <span className={LABEL}>{t('job.preset')}</span>
                    <span className="relative inline-flex items-center">
                      <select
                        value={settings.videoPreset}
                        onChange={(e) => onChange({ videoPreset: e.target.value })}
                        className="w-full bg-[var(--bg-secondary)] border border-[var(--border-secondary)] text-primary text-xs rounded-lg pl-2.5 pr-7 py-1.5 appearance-none cursor-pointer hover:border-[var(--border-hover)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                      >
                        {X264_PRESETS.map((p) => (
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
                    </span>
                  </label>
                )}
              </div>
            </details>
          </div>
        )}

        {showAnimation && (
          <>
            <div className={CARD}>
              <span className={LABEL}>{t('job.fps')}</span>
              <div className="flex gap-1">
                {ANIM_FPS.map((n) => (
                  <button
                    key={n}
                    onClick={() => onChange({ animFps: n })}
                    aria-pressed={settings.animFps === n}
                    className={choice(settings.animFps === n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className={CARD}>
              <span className={LABEL}>{t('job.animWidth')}</span>
              <div className="flex gap-1">
                {ANIM_WIDTHS.map((n) => (
                  <button
                    key={n}
                    onClick={() => onChange({ animWidth: n })}
                    aria-pressed={settings.animWidth === n}
                    className={choice(settings.animWidth === n)}
                  >
                    {n ? n : t('job.original')}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {showBurn && (
          <div className={CARD}>
            <span className={LABEL}>{t('job.burnSubtitles')}</span>
            {settings.subtitleFile ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="flex-1 truncate text-primary">{settings.subtitleFile.name}</span>
                <button
                  type="button"
                  onClick={() => onChange({ subtitleFile: null })}
                  className="px-2 py-1 rounded border border-[var(--border-secondary)] text-[var(--text-secondary)] hover:border-[var(--border-hover)]"
                >
                  {t('job.burnRemove')}
                </button>
              </div>
            ) : (
              <label className="cursor-pointer text-center py-1 text-xs rounded bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-dashed border-[var(--border-secondary)] hover:border-[var(--border-hover)]">
                {t('job.burnChoose')}
                <input
                  type="file"
                  accept=".srt,.vtt"
                  className="sr-only"
                  aria-label={t('job.burnSubtitles')}
                  onChange={(e) => {
                    const picked = e.target.files?.[0];
                    if (picked) onChange({ subtitleFile: picked });
                    e.target.value = '';
                  }}
                />
              </label>
            )}
            <span className="text-xs text-[var(--text-muted)]">{t('job.burnHint')}</span>
          </div>
        )}

        {showSubtitleOffset && (
          <div className={CARD}>
            <span className={LABEL}>{t('job.subtitleOffset')}</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step={0.1}
                value={settings.subtitleOffset || ''}
                onChange={(e) => onChange({ subtitleOffset: Number(e.target.value) || 0 })}
                placeholder="0"
                aria-label={t('job.subtitleOffset')}
                className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-secondary)] text-primary text-xs rounded px-2.5 py-1.5 focus:outline-none focus:border-[var(--accent)]"
              />
              <span className="text-[var(--text-muted)] text-xs">s</span>
            </div>
            <span className="text-xs text-[var(--text-muted)]">{t('job.subtitleOffsetHint')}</span>
          </div>
        )}

        {showOcr && (
          <div className={CARD}>
            <span className={LABEL}>{t('job.ocrLanguage')}</span>
            <select
              value={settings.ocrLanguage}
              onChange={(e) => onChange({ ocrLanguage: e.target.value })}
              aria-label={t('job.ocrLanguage')}
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-secondary)] text-primary text-xs rounded-lg px-2.5 py-1.5 cursor-pointer focus:outline-none focus:border-[var(--accent)]"
            >
              {Object.entries(OCR_LANGUAGE_NAMES).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
            <span className="text-xs text-[var(--text-muted)]">{t('job.ocrHint')}</span>
          </div>
        )}

        {showMetadata && (
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

        {showPdfEdit && (
          <>
            <div className={CARD}>
              <span className={LABEL}>{t('job.pdfPages2')}</span>
              <input
                type="text"
                value={settings.pdfPageRange}
                onChange={(e) => onChange({ pdfPageRange: e.target.value })}
                aria-label={t('job.pdfPages2')}
                aria-invalid={!isPageRangeSyntax(settings.pdfPageRange)}
                placeholder="1-3, 5, 8-"
                className={`w-full bg-[var(--bg-secondary)] border text-primary text-xs rounded px-2 py-1 focus:outline-none transition-colors ${
                  isPageRangeSyntax(settings.pdfPageRange)
                    ? 'border-[var(--border-secondary)] focus:border-[var(--accent)]'
                    : 'border-[var(--error)]'
                }`}
              />
              <span className="text-xs text-[var(--text-muted)]">{t('job.pdfPagesHint')}</span>
            </div>
            <div className={CARD}>
              <span className={LABEL}>{t('job.pdfRotate')}</span>
              <div className="flex gap-1">
                {([0, 90, 180, 270] as const).map((n) => (
                  <button
                    key={n}
                    onClick={() => onChange({ pdfRotate: n })}
                    aria-pressed={settings.pdfRotate === n}
                    className={choice(settings.pdfRotate === n)}
                  >
                    {n}°
                  </button>
                ))}
              </div>
              <span className={LABEL}>{t('job.pdfSplitLabel')}</span>
              <div className="flex gap-1">
                {([false, true] as const).map((split) => (
                  <button
                    key={String(split)}
                    onClick={() => onChange({ pdfSplit: split })}
                    aria-pressed={settings.pdfSplit === split}
                    className={choice(settings.pdfSplit === split)}
                  >
                    {split ? t('job.pdfPerPage') : t('job.pdfOneFile')}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {showPdfCompress && (
          <div className={CARD}>
            <span className={LABEL}>{t('job.pdfCompress')}</span>
            <div className="flex gap-1">
              {(['off', 'medium', 'strong'] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => onChange({ pdfCompress: level })}
                  aria-pressed={settings.pdfCompress === level}
                  className={choice(settings.pdfCompress === level)}
                >
                  {t(`job.pdfCompress${level[0].toUpperCase()}${level.slice(1)}`)}
                </button>
              ))}
            </div>
            <span className="text-xs text-[var(--text-muted)]">{t('job.pdfCompressHint')}</span>
          </div>
        )}

        {showPdfPageSize && (
          <div className={CARD}>
            <span className={LABEL}>{t('job.pdfPageSize')}</span>
            <div className="flex gap-1">
              {(['a4', 'letter', 'fit'] as const).map((size) => (
                <button
                  key={size}
                  onClick={() => onChange({ pdfPageSize: size })}
                  aria-pressed={settings.pdfPageSize === size}
                  className={choice(settings.pdfPageSize === size)}
                >
                  {size === 'fit' ? t('job.pdfPageFit') : size === 'a4' ? 'A4' : 'Letter'}
                </button>
              ))}
            </div>
          </div>
        )}

        {showVideoSize && (
          <div className={CARD}>
            <span className={LABEL}>{t('job.videoSize')}</span>
            <div className="flex gap-1">
              {VIDEO_WIDTHS.map((w) => (
                <button
                  key={w}
                  onClick={() => onChange({ videoMaxWidth: w })}
                  aria-pressed={settings.videoMaxWidth === w}
                  className={choice(settings.videoMaxWidth === w)}
                >
                  {w === 0 ? t('job.original') : `${Math.round((w * 9) / 16)}p`}
                </button>
              ))}
            </div>
          </div>
        )}

        {showMute && (
          <div className={CARD}>
            <span className={LABEL}>{t('job.audioTrack')}</span>
            <div className="flex gap-1">
              {([false, true] as const).map((mute) => (
                <button
                  key={String(mute)}
                  onClick={() => onChange({ mute })}
                  aria-pressed={settings.mute === mute}
                  className={choice(settings.mute === mute)}
                >
                  {mute ? t('job.muteAudio') : t('job.keepAudio')}
                </button>
              ))}
            </div>
          </div>
        )}

        {showTrim && (
          <div className={`${CARD} ${file ? 'sm:col-span-2 lg:col-span-3' : ''}`}>
            <span className={LABEL}>{t('job.trim')}</span>
            <div className="flex items-center gap-1.5">
              <TimeField
                seconds={settings.trimStart}
                onCommit={(trimStart) => onChange({ trimStart })}
                label={t('job.trimStart')}
                placeholder={t('job.trimStart')}
              />
              <span className="text-[var(--text-muted)] text-xs">→</span>
              <TimeField
                seconds={settings.trimEnd}
                onCommit={(trimEnd) => onChange({ trimEnd })}
                label={t('job.trimEnd')}
                placeholder={t('job.trimEnd')}
              />
            </div>
            <span className="text-xs text-[var(--text-muted)]">{t('job.trimHint')}</span>
            <span className={LABEL}>{t('job.cutOut')}</span>
            <div className="flex items-center gap-1.5">
              <TimeField
                seconds={settings.cutStart}
                onCommit={(cutStart) => onChange({ cutStart })}
                label={t('job.cutFrom')}
                placeholder={t('job.cutFrom')}
              />
              <span className="text-[var(--text-muted)] text-xs">→</span>
              <TimeField
                seconds={settings.cutEnd}
                onCommit={(cutEnd) => onChange({ cutEnd })}
                label={t('job.cutTo')}
                placeholder={t('job.cutTo')}
              />
            </div>
            <span className="text-xs text-[var(--text-muted)]">{t('job.cutHint')}</span>
            {file && (
              <TrimScrubber
                file={file}
                kind={mediaKind}
                start={settings.trimStart}
                end={settings.trimEnd}
                cutStart={settings.cutStart}
                cutEnd={settings.cutEnd}
                onChange={onChange}
                t={t}
              />
            )}
          </div>
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
