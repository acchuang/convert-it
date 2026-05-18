import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About — Convert-it',
  description: 'About Convert-it — the universal file converter that runs entirely in your browser. No uploads, no server, no signup. Convert images, videos, audio, documents, and data files for free.',
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: 'About — Convert-it',
    description: 'About Convert-it — the universal file converter that runs entirely in your browser. No uploads, no server, no signup.',
    type: 'website',
    images: [
      {
        url: '/og-image.svg',
        width: 1200,
        height: 630,
        alt: 'About Convert-it — Universal File Converter',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'About — Convert-it',
    description: 'About Convert-it — the universal file converter that runs entirely in your browser.',
    images: ['/og-image.svg'],
  },
  alternates: {
    canonical: '/about',
  },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
