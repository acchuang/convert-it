import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StatsPanel } from '@/app/components/StatsPanel';
import { recordConversion } from '@/lib/stats';

const t = (key: string) => key;
beforeEach(() => localStorage.clear());

describe('StatsPanel', () => {
  it('lists pairs with their most common error, copies the report, resets', async () => {
    recordConversion('png', 'webp', { ok: true, ms: 800 });
    recordConversion('mp4', 'webm', { ok: false, code: 'out-of-memory' });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<StatsPanel t={t} />);
    expect(screen.getByText('png → webp')).toBeTruthy();
    expect(screen.getByText('errors.outOfMemory.title')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'stats.copy' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText.mock.calls[0][0]).toContain('| mp4 → webm | 0 | 1 | out-of-memory |');
    fireEvent.click(screen.getByRole('button', { name: 'stats.reset' }));
    expect(screen.getByText('stats.empty')).toBeTruthy();
  });
});
