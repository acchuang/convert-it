import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About — Convert-it',
  description: 'About Convert-it — the universal file converter that runs entirely in your browser.',
  openGraph: {
    title: 'About — Convert-it',
    description: 'About Convert-it — the universal file converter that runs entirely in your browser.',
  },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
