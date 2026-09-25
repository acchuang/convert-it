'use client';

// CSV, JSON, XML and spreadsheet options.

import { type GroupProps } from './controls';

export function DataSettings({ shown, settings, onChange, t }: GroupProps) {
  return (
    <>
      {shown.has('csvDelimiter') && (
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

      {shown.has('jsonIndent') && (
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

      {shown.has('xmlRoot') && (
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

      {shown.has('xlsxSheets') && (
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
    </>
  );
}
