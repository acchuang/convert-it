import type { Metadata } from 'next';
import { Bebas_Neue, DM_Sans, DM_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from './components/ThemeProvider';
import { LocaleProvider } from './components/LocaleProvider';

const bebasNeue = Bebas_Neue({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

const dmMono = DM_Mono({
  weight: ['400', '500'],
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://convert-it.pages.dev'),
  title: 'Convert-it — Universal File Converter',
  description: 'Convert any file to any format, entirely in your browser. No uploads, no server, no signup.',
  applicationName: 'Convert-it',
  authors: [{ name: 'https://github.com/acchuang' }],
  keywords: ['file converter', 'image converter', 'video converter', 'audio converter', 'document converter', 'online converter', 'browser converter', 'free converter'],
  openGraph: {
    url: 'https://convert-it.pages.dev',
    siteName: 'Convert-it',
    title: 'Convert-it — Universal File Converter',
    description: 'Convert any file to any format, entirely in your browser.',
    type: 'website',
  },
  alternates: {
    canonical: '/',
  },
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.svg',
    apple: '/favicon.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bebasNeue.variable} ${dmSans.variable} ${dmMono.variable}`} suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#0A0A0A" media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content="#FAFAFA" media="(prefers-color-scheme: light)" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Convert-it" />
        <link rel="apple-touch-icon" href="/favicon.svg" />
      </head>
      <body>
        <LocaleProvider>
          <ThemeProvider>
            {children}
          </ThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
