'use client';

import { useEffect, useState } from 'react';
import { formatFileSize } from '@/lib/converters';
import { useLocale } from './LocaleProvider';

interface NetworkLog {
  sent: number;
  received: number;
}

// What the app has actually sent and received over the network in this
// browser, as counted by the service worker (scripts/sw-template.js), which
// every request from the pages and their workers passes through. "Sent" is
// the proof behind "your files never leave your device": it only grows if
// something uploads. Until a worker controls the page there is nothing
// honest to show, so nothing is shown.
export default function NetworkBadge() {
  const { t } = useLocale();
  const [log, setLog] = useState<NetworkLog | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const sw = navigator.serviceWorker;
    let channel: BroadcastChannel | null = null;
    const ask = (worker: ServiceWorker | null) => {
      if (!worker) return;
      const port = new MessageChannel();
      port.port1.onmessage = ({ data }) => setLog(data as NetworkLog);
      worker.postMessage('network-log', [port.port2]);
    };
    ask(sw.controller);
    const onController = () => ask(sw.controller);
    sw.addEventListener('controllerchange', onController);
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel('network-log');
      channel.onmessage = ({ data }) => {
        if (sw.controller) setLog(data as NetworkLog);
      };
    }
    const onLine = () => setOnline(navigator.onLine);
    onLine();
    window.addEventListener('online', onLine);
    window.addEventListener('offline', onLine);
    return () => {
      channel?.close();
      sw.removeEventListener('controllerchange', onController);
      window.removeEventListener('online', onLine);
      window.removeEventListener('offline', onLine);
    };
  }, []);

  if (!log) return null;
  return (
    <span
      className="text-xs text-[var(--text-muted)] inline-flex items-center gap-2"
      style={{ fontFamily: 'var(--font-mono)' }}
      title={t('network.hint')}
      data-testid="network-badge"
    >
      {!online && <span className="text-[var(--accent-ink)]">{t('network.offline')}</span>}
      <span>
        {t('network.sent')}{' '}
        <strong className={log.sent ? 'text-[var(--error)]' : 'text-[var(--success)]'}>
          {formatFileSize(log.sent)}
        </strong>
      </span>
      <span className="hidden sm:inline">
        {t('network.received')} {formatFileSize(log.received)}
      </span>
    </span>
  );
}
