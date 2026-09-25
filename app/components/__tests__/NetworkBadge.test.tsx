import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import NetworkBadge from '@/app/components/NetworkBadge';
import { LocaleProvider } from '@/app/components/LocaleProvider';

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

function withWorker(log: { sent: number; received: number } | null) {
  const worker = {
    postMessage: (_msg: string, [port]: MessagePort[]) => log && port.postMessage(log),
  };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      controller: log ? worker : null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });
}

const renderBadge = () =>
  render(
    <LocaleProvider>
      <NetworkBadge />
    </LocaleProvider>,
  );

describe('NetworkBadge', () => {
  it('shows what the service worker counted', async () => {
    withWorker({ sent: 0, received: 3 * 1024 * 1024 });
    renderBadge();
    const badge = await screen.findByTestId('network-badge');
    expect(badge).toHaveTextContent('Sent 0 B');
    expect(badge).toHaveTextContent('received 3.0 MB');
  });

  it('shows nothing while no worker controls the page', async () => {
    withWorker(null);
    renderBadge();
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(screen.queryByTestId('network-badge')).toBeNull();
  });
});
