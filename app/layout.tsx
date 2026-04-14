import type { Metadata } from 'next';
import { Bebas_Neue, DM_Sans, DM_Mono } from 'next/font/google';
import './globals.css';

const bebasNeue = Bebas_Neue({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-display',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-body',
});

const dmMono = DM_Mono({
  weight: ['400', '500'],
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://convert-it.pages.dev'),
  title: 'CONVERT — Universal File Converter',
  description: 'Convert any file to any format, entirely in your browser.',
  openGraph: {
    url: 'https://convert-it.pages.dev',
    siteName: 'CONVERT',
    title: 'CONVERT — Universal File Converter',
    description: 'Convert any file to any format, entirely in your browser.',
    type: 'website',
  },
  alternates: {
    canonical: '/',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bebasNeue.variable} ${dmSans.variable} ${dmMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
