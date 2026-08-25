import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ConverterApp from '@/app/components/ConverterApp';
import { getTargetFormats, getFormatInfo } from '@/lib/converters';
import { allPairs, pairCopy, parsePair } from '@/lib/pairs';
import { SITE_URL } from '@/lib/site';

export const dynamicParams = false;

export function generateStaticParams() {
  return allPairs().map(({ slug }) => ({ pair: slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ pair: string }>;
}): Promise<Metadata> {
  const { pair: slug } = await params;
  const pair = parsePair(slug);
  if (!pair) return {};
  const copy = pairCopy(pair);

  return {
    title: copy.title,
    description: copy.description,
    alternates: { canonical: `/convert/${slug}` },
    openGraph: {
      url: `${SITE_URL}/convert/${slug}`,
      title: copy.title,
      description: copy.description,
      type: 'website',
    },
    twitter: { card: 'summary_large_image', title: copy.title, description: copy.description },
  };
}

export default async function PairPage({ params }: { params: Promise<{ pair: string }> }) {
  const { pair: slug } = await params;
  const pair = parsePair(slug);
  if (!pair) notFound();
  const copy = pairCopy(pair);

  // Sibling pairs keep every landing page one hop from the rest of the set, so
  // a crawler that finds one finds all of them without relying on the sitemap.
  const siblings = getTargetFormats(pair.from)
    .filter((to) => to !== pair.to && to !== pair.from && getFormatInfo(to))
    .slice(0, 8);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        name: `${copy.fromLabel} to ${copy.toLabel} Converter`,
        url: `${SITE_URL}/convert/${slug}`,
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Any',
        browserRequirements: 'Requires JavaScript',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        description: copy.description,
      },
      {
        '@type': 'FAQPage',
        mainEntity: copy.faq.map(({ q, a }) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      },
    ],
  };

  const intro = (
    <section className="mb-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <h1
        className="text-5xl text-[var(--text-primary)] mb-3"
        style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.06em' }}
      >
        {copy.heading}
      </h1>

      <p className="text-[var(--text-secondary)] text-sm max-w-2xl leading-relaxed">
        {copy.description}
      </p>

      <p
        className="mt-3 text-xs text-[var(--text-muted)]"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        Encoded with {copy.engine}.
      </p>

      {siblings.length > 0 && (
        <nav className="mt-5 flex flex-wrap gap-2" aria-label="Related conversions">
          {siblings.map((to) => (
            <Link
              key={to}
              href={`/convert/${pair.from}-to-${to}`}
              className="px-3 py-1 text-xs rounded-full border border-[var(--border-secondary)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {pair.from.toUpperCase()} → {to.toUpperCase()}
            </Link>
          ))}
        </nav>
      )}
    </section>
  );

  return (
    <>
      <ConverterApp preferredTarget={pair.to} intro={intro} />

      <section className="max-w-5xl mx-auto px-4 pb-16">
        <h2
          className="text-2xl text-[var(--text-primary)] mb-4"
          style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.06em' }}
        >
          Questions
        </h2>
        <dl className="space-y-4">
          {copy.faq.map(({ q, a }) => (
            <div key={q}>
              <dt className="text-sm text-[var(--text-primary)] mb-1">{q}</dt>
              <dd className="text-sm text-[var(--text-secondary)] leading-relaxed">{a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
