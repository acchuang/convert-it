import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { LocaleProvider, useLocale } from '@/app/components/LocaleProvider';

function TestConsumer() {
  const { locale, t, setLocale } = useLocale();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="copy">{t('job.copy')}</span>
      <span data-testid="missing">{t('nonexistent.key')}</span>
      <button onClick={() => setLocale('es')}>switch-to-es</button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('LocaleProvider', () => {
  it('defaults to English and loads translations asynchronously', async () => {
    render(
      <LocaleProvider>
        <TestConsumer />
      </LocaleProvider>
    );

    expect(screen.getByTestId('locale').textContent).toBe('en');

    await waitFor(() => {
      expect(screen.getByTestId('copy').textContent).toBe('COPY');
    });
  });

  it('falls back to returning the raw key when a translation is missing', async () => {
    render(
      <LocaleProvider>
        <TestConsumer />
      </LocaleProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('copy').textContent).toBe('COPY');
    });

    expect(screen.getByTestId('missing').textContent).toBe('nonexistent.key');
  });

  it('setLocale switches locale and loads the new locale file', async () => {
    render(
      <LocaleProvider>
        <TestConsumer />
      </LocaleProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('copy').textContent).toBe('COPY');
    });

    await act(async () => {
      screen.getByText('switch-to-es').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('locale').textContent).toBe('es');
    });

    await waitFor(() => {
      expect(screen.getByTestId('copy').textContent).toBe('COPIAR');
    });
  });

  it('respects a stored locale preference on mount', async () => {
    localStorage.setItem('convert-it-locale', 'es');

    render(
      <LocaleProvider>
        <TestConsumer />
      </LocaleProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('locale').textContent).toBe('es');
    });

    await waitFor(() => {
      expect(screen.getByTestId('copy').textContent).toBe('COPIAR');
    });
  });
});
