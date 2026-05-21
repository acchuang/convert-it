'use client';

import Link from 'next/link';
import { useLocale } from '../components/LocaleProvider';
import { LanguageSelector } from '../components/LanguageSelector';
import { useTheme } from '../components/ThemeProvider';

const CATEGORY_COLORS: Record<string, string> = {
  image: '#FF4D00',
  document: '#00C2FF',
  data: '#C8FF00',
  video: '#FF00C8',
  audio: '#00FF88',
};

const formats = [
  { catKey: 'image', color: '#FF4D00', exts: 'JPG, PNG, WebP, GIF, BMP, ICO, SVG' },
  { catKey: 'video', color: '#FF00C8', exts: 'MP4, WebM, AVI, MOV, MKV, FLV, M4V, 3GP' },
  { catKey: 'audio', color: '#00FF88', exts: 'MP3, WAV, AAC, OGG, FLAC, M4A, WMA, OPUS' },
  { catKey: 'document', color: '#00C2FF', exts: 'TXT, Markdown, HTML, PDF' },
  { catKey: 'data', color: '#C8FF00', exts: 'CSV, JSON, XML, YAML, TSV, Excel' },
];

const techStack = [
  { labelKey: 'about.techFramework', val: 'Next.js 15' },
  { labelKey: 'about.techLanguage', val: 'TypeScript' },
  { labelKey: 'about.techCSS', val: 'Tailwind CSS' },
  { labelKey: 'about.techMotion', val: 'Framer Motion' },
  { labelKey: 'about.techVideo', val: 'FFmpeg WASM' },
  { labelKey: 'about.techImages', val: 'Canvas API' },
  { labelKey: 'about.techSheets', val: 'SheetJS' },
  { labelKey: 'about.techHosting', val: 'Cloudflare Pages' },
];

export default function AboutPage() {
  const { t, locale } = useLocale();
  const { theme, toggle: toggleTheme } = useTheme();

  return (
    <main
      className="min-h-screen bg-app"
      style={{ fontFamily: 'var(--font-body)' }}
      role="main"
      aria-label={`${t('about.heading')} Convert-it`}
    >
      {/* Header */}
      <header
        className="border-b border-app px-6 py-4 flex items-center justify-between sticky top-0 z-50 backdrop-blur-sm"
        style={{ backgroundColor: 'var(--header-bg)' }}
        role="banner"
      >
        <div
          style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.08em' }}
          className="text-3xl tracking-wide"
        >
          <Link href="/" className="hover:opacity-80 transition-opacity">
            <span className="text-[var(--accent)]">Convert</span>
            <span className="text-[var(--text-primary)]">-it</span>
          </Link>
        </div>

        <div className="flex items-center gap-4">
          <LanguageSelector />

          <button
            onClick={toggleTheme}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-[var(--text-dim)] hover:text-[var(--accent)] hover:bg-[var(--bg-tertiary)] transition-all"
            aria-label={theme === 'dark' ? t('header.themeLight') : t('header.themeDark')}
          >
            {theme === 'dark' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
            )}
          </button>

          <Link
            href="/"
            className="text-xs text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {t('header.home')}
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-16">
        {/* Hero */}
        <section className="mb-20">
          <div
            style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.08em' }}
            className="text-6xl text-[var(--accent)] mb-6"
          >
            {t('about.heading')}
          </div>
          <p className="text-lg text-[var(--text-secondary)] leading-relaxed mb-6">
            <strong className="text-[var(--text-primary)]">Convert-it</strong>{' '}
            {t('about.intro')}
          </p>
          <p className="text-[var(--text-muted)] leading-relaxed">
            {t('about.intro2')}
          </p>
        </section>

        {/* How it works */}
        <section className="mb-20">
          <h2
            style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.06em' }}
            className="text-2xl text-[var(--text-primary)] mb-8"
          >
            {t('about.howHeading')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map(n => (
              <div
                key={n}
                className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-2xl p-6"
              >
                <div
                  style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.08em' }}
                  className="text-4xl text-[var(--accent)] mb-3"
                >
                  0{n}
                </div>
                <div
                  style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.06em' }}
                  className="text-lg text-[var(--text-primary)] mb-2"
                >
                  {t(`about.step${n}.title`)}
                </div>
                <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                  {t(`about.step${n}.desc`)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Supported formats */}
        <section className="mb-20">
          <h2
            style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.06em' }}
            className="text-2xl text-[var(--text-primary)] mb-8"
          >
            {t('about.formatsHeading')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {formats.map(f => (
              <div
                key={f.catKey}
                className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-5 flex items-start gap-4"
              >
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0 mt-1"
                  style={{ backgroundColor: f.color }}
                />
                <div>
                  <div
                    style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.06em' }}
                    className="text-lg text-[var(--text-primary)] mb-1"
                  >
                    {t(`dropzone.${f.catKey}`)}
                  </div>
                  <p
                    className="text-xs text-[var(--text-muted)] leading-relaxed"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {f.exts}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Privacy */}
        <section className="mb-20">
          <h2
            style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.06em' }}
            className="text-2xl text-[var(--text-primary)] mb-6"
          >
            {t('about.privacyHeading')}
          </h2>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-2xl p-6">
            <p className="text-[var(--text-secondary)] leading-relaxed mb-4">
              <strong className="text-[var(--text-primary)]">{t('about.privacy1')}</strong>
            </p>
            <p className="text-sm text-[var(--text-muted)] leading-relaxed">
              The only data we collect is anonymous, aggregated usage stats (total visits and active sessions) via Cloudflare KV — no personal information, no tracking, no cookies beyond your theme and language preferences. File size limits (100MB–2GB depending on category) prevent browser memory exhaustion.
            </p>
          </div>
        </section>

        {/* Open source */}
        <section className="mb-20">
          <h2
            style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.06em' }}
            className="text-2xl text-[var(--text-primary)] mb-6"
          >
            {t('about.ossHeading')}
          </h2>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-2xl p-6">
            <p className="text-[var(--text-secondary)] leading-relaxed mb-4">
              {t('about.oss1')}
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href="https://github.com/acchuang/convert-it"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 border border-[var(--border-secondary)] rounded-lg text-xs text-[var(--text-muted)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] transition-all"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                {t('about.ossGithub')}
              </a>
              <a
                href="https://buymeacoffee.com/acchuang"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 border border-[var(--border-secondary)] rounded-lg text-xs text-[var(--text-muted)] hover:border-[#FF813F] hover:text-[#FF813F] transition-all"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 8h-1V6c0-2.21-1.79-4-4-4H4c-2.21 0-4 1.79-4 4v10c0 2.21 1.79 4 4 4h11c2.21 0 4-1.79 4-4v-1h1c1.66 0 3-1.34 3-3v-1c0-1.66-1.34-3-3-3zm-9 10H4V6h7v12zm9-3h-1V9h1c.55 0 1 .45 1 1v1c0 .55-.45 1-1 1z"/>
                </svg>
                {t('about.ossSupport')}
              </a>
            </div>
          </div>
        </section>

        {/* Recent improvements */}
        <section className="mb-20">
          <h2
            style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.06em' }}
            className="text-2xl text-[var(--text-primary)] mb-6"
          >
            RECENT IMPROVEMENTS
          </h2>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-2xl p-6 space-y-3">
            {[
              'Real-time FFmpeg progress tracking for video/audio conversions',
              'File size limits with early rejection (100MB images, 2GB video, 500MB audio)',
              'FFmpeg WASM error handling with graceful failure recovery',
              'Auto-generated conversion map — no manual sync between registry and UI',
              'Zero type assertions — full TypeScript strict mode compliance',
              'Extracted job management into reusable useJobManager hook',
              'i18n support with 5 languages and dynamic locale loading',
              'Dark/light theme toggle with system preference detection',
              'Preview panel with copy-to-clipboard for text results',
              'Conversion history persisted in localStorage',
              'PWA support with manifest and app icons',
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] flex-shrink-0 mt-2" />
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{item}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Tech stack */}
        <section>
          <h2
            style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.06em' }}
            className="text-2xl text-[var(--text-primary)] mb-6"
          >
            {t('about.techHeading')}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {techStack.map(tech => (
              <div
                key={tech.labelKey}
                className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-4 text-center"
              >
                <div
                  className="text-xs text-[var(--text-dim)] mb-1 uppercase tracking-wider"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {t(tech.labelKey)}
                </div>
                <div className="text-sm text-[var(--text-primary)] font-semibold">
                  {tech.val}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="border-t border-[var(--border-primary)] px-6 py-6 mt-16" role="contentinfo">
        <div className="max-w-3xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <span style={{ fontFamily: 'var(--font-mono)' }} className="text-xs text-[var(--text-dim)]">
            {t('footer.copyright')}
          </span>
          <nav className="flex gap-6 text-xs text-[var(--text-dim)]" style={{ fontFamily: 'var(--font-mono)' }} aria-label="Navigation">
            <Link href="/" className="hover:text-[var(--text-primary)] transition-colors">{t('header.home').replace('← ', '')}</Link>
            <a href="https://github.com/acchuang/convert-it" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--text-primary)] transition-colors">{t('footer.github')}</a>
          </nav>
        </div>
      </footer>
    </main>
  );
}
