'use client';

// PDF pages and tools, OCR, subtitle timing.

import { isPageRangeSyntax } from '@/lib/pdf-options';
import { CARD, LABEL, choice, type GroupProps } from './controls';

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

export function DocumentSettings({ shown, settings, onChange, t }: GroupProps) {
  return (
    <>
      {shown.has('pdfPages') && (
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

      {shown.has('pdfScale') && (
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

      {shown.has('subtitleOffset') && (
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

      {shown.has('ocr') && (
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

      {shown.has('pdfEdit') && (
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

      {shown.has('pdfCompress') && (
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

      {shown.has('pdfPageSize') && (
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
    </>
  );
}
