'use client';

// Audio and video: quality presets, animation, trim and cut, size, sound, burnt-in subtitles.

import { getFormatInfo } from '@/lib/converters';
import { TrimScrubber } from '../TrimScrubber';
import { activePreset, LOSSLESS_VIDEO_TARGETS, VIDEO_PRESETS } from '@/lib/presets';
import { CARD, LABEL, choice, TimeField, type GroupProps } from './controls';

const ANIM_FPS = [8, 12, 15, 24];
const ANIM_WIDTHS = [320, 480, 640, 0];
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

export function MediaSettings({
  shown,
  sourceExt,
  targetExt,
  settings,
  onChange,
  t,
  file,
}: GroupProps) {
  const mediaKind = getFormatInfo(sourceExt)?.category === 'video' ? 'video' : 'audio';
  // Where the preset (encoder speed) isn't read (avi/flv), CRF alone decides.
  const videoPreset = activePreset(
    shown.has('videoPreset')
      ? VIDEO_PRESETS
      : VIDEO_PRESETS.map((p) => ({ ...p, patch: { videoQuality: p.patch.videoQuality } })),
    settings,
  );
  return (
    <>
      {shown.has('audioBitrate') && (
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

      {shown.has('videoQuality') && (
        <div className={CARD}>
          <div className="flex items-center justify-between">
            <span className={LABEL}>{t('job.quality')}</span>
            <span className="text-primary text-xs font-semibold">CRF {settings.videoQuality}</span>
          </div>
          <div className="flex gap-1">
            {VIDEO_PRESETS.filter(
              (p) => p.id !== 'lossless' || LOSSLESS_VIDEO_TARGETS.has(targetExt),
            ).map((p) => (
              <button
                key={p.id}
                onClick={() =>
                  onChange(
                    shown.has('videoPreset') ? p.patch : { videoQuality: p.patch.videoQuality },
                  )
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
              {shown.has('videoPreset') && (
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

      {shown.has('animation') && (
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

      {shown.has('burnSubtitles') && (
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

      {shown.has('videoSize') && (
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

      {shown.has('mute') && (
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

      {shown.has('trim') && (
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
    </>
  );
}
