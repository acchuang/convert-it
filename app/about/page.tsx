import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About — CONVERT',
  description: 'About CONVERT — the universal file converter that runs entirely in your browser.',
  openGraph: {
    title: 'About — CONVERT',
    description: 'About CONVERT — the universal file converter that runs entirely in your browser.',
  },
};

const formats = [
  { cat: 'Images', color: '#FF4D00', exts: 'JPG, PNG, WebP, GIF, BMP, ICO, SVG' },
  { cat: 'Video', color: '#FF00C8', exts: 'MP4, WebM, AVI, MOV, MKV, FLV, M4V, 3GP' },
  { cat: 'Audio', color: '#00FF88', exts: 'MP3, WAV, AAC, OGG, FLAC, M4A, WMA, OPUS' },
  { cat: 'Documents', color: '#00C2FF', exts: 'TXT, Markdown, HTML, PDF' },
  { cat: 'Data', color: '#C8FF00', exts: 'CSV, JSON, XML, YAML, TSV, Excel' },
];

export default function AboutPage() {
  return (
    <main
      className="min-h-screen bg-app"
      style={{ fontFamily: 'var(--font-body)' }}
      role="main"
      aria-label="About CONVERT"
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
            <span className="text-[var(--accent)]">CON</span>
            <span className="text-[var(--text-primary)]">VERT</span>
          </Link>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-xs text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            ← HOME
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
            ABOUT
          </div>
          <p className="text-lg text-[var(--text-secondary)] leading-relaxed mb-6">
            <strong className="text-[var(--text-primary)]">CONVERT</strong> is a free, open-source
            universal file converter that runs entirely in your browser. No uploads, no servers,
            no signups — your files never leave your device.
          </p>
          <p className="text-[var(--text-muted)] leading-relaxed">
            Built for developers, designers, and anyone who needs quick, private file conversions
            without the hassle of sketchy online tools or bloated desktop software.
          </p>
        </section>

        {/* How it works */}
        <section className="mb-20">
          <h2
            style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.06em' }}
            className="text-2xl text-[var(--text-primary)] mb-8"
          >
            HOW IT WORKS
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { step: '01', title: 'Drag & Drop', desc: 'Drop your files or click to browse. CONVERT auto-detects the format and suggests available conversions.' },
              { step: '02', title: 'Customize', desc: 'Tweak quality, delimiter, bitrate, or preset settings per file before converting.' },
              { step: '03', title: 'Download', desc: 'Get your converted file instantly. Download individually or zip all results at once.' },
            ].map(s => (
              <div
                key={s.step}
                className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-2xl p-6"
              >
                <div
                  style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.08em' }}
                  className="text-4xl text-[var(--accent)] mb-3"
                >
                  {s.step}
                </div>
                <div
                  style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.06em' }}
                  className="text-lg text-[var(--text-primary)] mb-2"
                >
                  {s.title}
                </div>
                <p className="text-sm text-[var(--text-muted)] leading-relaxed">{s.desc}</p>
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
            SUPPORTED FORMATS
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {formats.map(f => (
              <div
                key={f.cat}
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
                    {f.cat}
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
            PRIVACY
          </h2>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-2xl p-6">
            <p className="text-[var(--text-secondary)] leading-relaxed mb-4">
              <strong className="text-[var(--text-primary)]">Your files never leave your browser.</strong> All
              conversion happens locally using WebAssembly and the Canvas API. We don't upload, store,
              or have any access to your data.
            </p>
            <p className="text-sm text-[var(--text-muted)] leading-relaxed">
              The only data we collect is anonymous, aggregated usage stats (total visits and active
              sessions) via Cloudflare KV — no personal information, no tracking, no cookies beyond
              your theme preference.
            </p>
          </div>
        </section>

        {/* Open source */}
        <section className="mb-20">
          <h2
            style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.06em' }}
            className="text-2xl text-[var(--text-primary)] mb-6"
          >
            OPEN SOURCE
          </h2>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-2xl p-6">
            <p className="text-[var(--text-secondary)] leading-relaxed mb-4">
              CONVERT is MIT-licensed and open source. The full codebase is available on GitHub.
              Contributions, bug reports, and feature requests are welcome.
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
                GITHUB
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
                SUPPORT
              </a>
            </div>
          </div>
        </section>

        {/* Tech stack */}
        <section>
          <h2
            style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.06em' }}
            className="text-2xl text-[var(--text-primary)] mb-6"
          >
            TECH STACK
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Framework', val: 'Next.js 15' },
              { label: 'Language', val: 'TypeScript' },
              { label: 'CSS', val: 'Tailwind CSS' },
              { label: 'Motion', val: 'Framer Motion' },
              { label: 'Video/Audio', val: 'FFmpeg WASM' },
              { label: 'Images', val: 'Canvas API' },
              { label: 'Spreadsheets', val: 'SheetJS' },
              { label: 'Hosting', val: 'Cloudflare Pages' },
            ].map(t => (
              <div
                key={t.label}
                className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-4 text-center"
              >
                <div
                  className="text-xs text-[var(--text-dim)] mb-1 uppercase tracking-wider"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {t.label}
                </div>
                <div
                  className="text-sm text-[var(--text-primary)] font-semibold"
                >
                  {t.val}
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
            © 2025 CONVERT — All conversions happen in your browser
          </span>
          <nav className="flex gap-6 text-xs text-[var(--text-dim)]" style={{ fontFamily: 'var(--font-mono)' }} aria-label="Navigation">
            <Link href="/" className="hover:text-[var(--text-primary)] transition-colors">HOME</Link>
            <a href="https://github.com/acchuang/convert-it" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--text-primary)] transition-colors">GITHUB</a>
          </nav>
        </div>
      </footer>
    </main>
  );
}
