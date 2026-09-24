'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale } from './LocaleProvider';

type PackState =
  | { kind: 'unavailable' }
  | { kind: 'idle'; mb: number }
  | { kind: 'saving'; pct: number }
  | { kind: 'saved' }
  | { kind: 'failed'; mb: number };

// Registers the service worker (production builds only: `next dev` serves
// unhashed, ever-changing chunks that must not be cached) and offers the
// offline pack: every app asset, so conversions never tried before also work
// without a connection.
export default function OfflineSupport() {
  const { t } = useLocale();
  const [state, setState] = useState<PackState>({ kind: 'unavailable' });

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    let cancelled = false;
    (async () => {
      try {
        await navigator.serviceWorker.register('/sw.js');
        const ready = await navigator.serviceWorker.ready;
        const manifest = await fetch('/offline-pack.json').then((r) => r.json());
        const status = await ask<{ total: number; left: number }>(
          ready.active,
          'offline-pack-status',
        );
        if (cancelled) return;
        const mb = Math.max(1, Math.round(manifest.bytes / 1048576));
        setState(status.left === 0 ? { kind: 'saved' } : { kind: 'idle', mb });
      } catch {
        // No service worker (private mode, blocked storage): nothing to offer.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async () => {
    const mb = state.kind === 'idle' || state.kind === 'failed' ? state.mb : 0;
    const worker = (await navigator.serviceWorker.ready).active;
    if (!worker) return;
    setState({ kind: 'saving', pct: 0 });
    const channel = new MessageChannel();
    channel.port1.onmessage = ({ data }) => {
      if (data.error) setState({ kind: 'failed', mb });
      else if (data.complete) setState({ kind: 'saved' });
      else setState({ kind: 'saving', pct: Math.floor((data.done / data.total) * 100) });
    };
    worker.postMessage('offline-pack', [channel.port2]);
  }, [state]);

  if (state.kind === 'unavailable') return null;
  const className =
    'text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors';
  if (state.kind === 'saved') {
    return (
      <span className="text-xs text-[var(--text-muted)]" role="status">
        ✓ {t('offline.saved')}
      </span>
    );
  }
  if (state.kind === 'saving') {
    return (
      <span className="text-xs text-[var(--text-muted)]" role="status" aria-live="polite">
        {t('offline.saving').replace('{pct}', String(state.pct))}
      </span>
    );
  }
  return (
    <button type="button" onClick={save} className={className}>
      {state.kind === 'failed'
        ? t('offline.failed')
        : t('offline.save').replace('{size}', String(state.mb))}
    </button>
  );
}

function ask<T>(worker: ServiceWorker | null, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!worker) return reject(new Error('no active service worker'));
    const channel = new MessageChannel();
    channel.port1.onmessage = ({ data }) => resolve(data as T);
    worker.postMessage(message, [channel.port2]);
  });
}
