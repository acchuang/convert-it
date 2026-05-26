import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PreviewPanel } from '@/app/components/PreviewPanel';

const t = (key: string) => key;

describe('PreviewPanel', () => {
  it('renders text preview content', async () => {
    const blob = new Blob(['{"key": "value"}'], { type: 'application/json' });
    render(
      <PreviewPanel blob={blob} targetExt="json" open={true} onClose={vi.fn()} t={t} />
    );
    const pre = await screen.findByText('{"key": "value"}');
    expect(pre).toBeDefined();
  });

  it('shows loading state initially', () => {
    const blob = new Blob(['test content'], { type: 'text/plain' });
    render(
      <PreviewPanel blob={blob} targetExt="txt" open={true} onClose={vi.fn()} t={t} />
    );
    expect(screen.getByText('job.preview')).toBeDefined();
  });

  it('renders image preview for non-text extensions', async () => {
    const blob = new Blob(['data'], { type: 'application/octet-stream' });
    render(
      <PreviewPanel blob={blob} targetExt="bin" open={true} onClose={vi.fn()} t={t} />
    );
    const img = await screen.findByAltText('job.preview');
    expect(img).toBeDefined();
    expect((img as HTMLImageElement).src).toContain('blob:');
  });

  it('renders image preview with blob URL', async () => {
    const blob = new Blob(['fake-image-data'], { type: 'image/png' });
    render(
      <PreviewPanel blob={blob} targetExt="png" open={true} onClose={vi.fn()} t={t} />
    );
    const img = await screen.findByAltText('job.preview');
    expect(img).toBeDefined();
    expect((img as HTMLImageElement).src).toContain('blob:');
  });

  it('does not render when closed', () => {
    const blob = new Blob(['hidden'], { type: 'text/plain' });
    const { container } = render(
      <PreviewPanel blob={blob} targetExt="txt" open={false} onClose={vi.fn()} t={t} />
    );
    expect(container.querySelector('pre')).toBeNull();
  });
});
