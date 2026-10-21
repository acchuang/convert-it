'use client';

// CSV, JSON, XML and spreadsheet options.

import { type GroupProps } from './controls';

export function DataSettings({ shown, settings, onChange, t }: GroupProps) {
  return (
    <>
      {shown.has('csvDelimiter') && (
        <div className="bg-(--bg-tertiary)/60 border border-(--border-secondary) rounded-xl p-3 flex flex-col justify-between gap-2">
          <span className="text-(--text-muted) text-xs uppercase tracking-wider font-semibold">
            {t('job.delimiter')}
          </span>
          <div className="flex gap-1">
            {([',', ';', '|', '\t'] as const).map((d) => (
              <button
                key={d}
                onClick={() => onChange({ csvDelimiter: d })}
                className={`flex-1 py-1 text-xs rounded-sm transition-colors ${
                  settings.csvDelimiter === d
                    ? 'bg-(--accent) text-(--accent-text) font-semibold'
                    : 'bg-(--bg-secondary) text-(--text-secondary) border border-(--border-secondary) hover:border-(--border-hover)'
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
        <div className="bg-(--bg-tertiary)/60 border border-(--border-secondary) rounded-xl p-3 flex flex-col justify-between gap-2">
          <span className="text-(--text-muted) text-xs uppercase tracking-wider font-semibold">
            {t('job.indent')}
          </span>
          <div className="flex gap-1">
            {([2, 4, 0] as const).map((n) => (
              <button
                key={n}
                onClick={() => onChange({ jsonIndent: n })}
                className={`flex-1 py-1 text-xs rounded-sm transition-colors ${
                  settings.jsonIndent === n
                    ? 'bg-(--accent) text-(--accent-text) font-semibold'
                    : 'bg-(--bg-secondary) text-(--text-secondary) border border-(--border-secondary) hover:border-(--border-hover)'
                }`}
              >
                {n === 0 ? t('job.min') : `${n}${t('job.sp2').slice(1)}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {shown.has('xmlRoot') && (
        <div className="bg-(--bg-tertiary)/60 border border-(--border-secondary) rounded-xl p-3 flex flex-col justify-between gap-2">
          <span className="text-(--text-muted) text-xs uppercase tracking-wider font-semibold">
            {t('job.root')}
          </span>
          <input
            type="text"
            value={settings.xmlRootElement}
            onChange={(e) => onChange({ xmlRootElement: e.target.value || 'root' })}
            className="bg-(--bg-secondary) border border-(--border-secondary) text-primary text-xs rounded-sm px-2.5 py-1.5 w-full focus:outline-hidden focus:border-(--accent) transition-colors"
            placeholder="root"
          />
        </div>
      )}

      {shown.has('xlsxSheets') && (
        <div className="bg-(--bg-tertiary)/60 border border-(--border-secondary) rounded-xl p-3 flex flex-col justify-between gap-2">
          <span className="text-(--text-muted) text-xs uppercase tracking-wider font-semibold">
            {t('job.xlsxSheets')}
          </span>
          <div className="flex gap-1">
            {([false, true] as const).map((all) => (
              <button
                key={String(all)}
                onClick={() => onChange({ xlsxAllSheets: all })}
                aria-pressed={settings.xlsxAllSheets === all}
                className={`flex-1 py-1 text-xs rounded-sm transition-colors ${
                  settings.xlsxAllSheets === all
                    ? 'bg-(--accent) text-(--accent-text) font-semibold'
                    : 'bg-(--bg-secondary) text-(--text-secondary) border border-(--border-secondary) hover:border-(--border-hover)'
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
