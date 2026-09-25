import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PreviewPanel } from '@/app/components/PreviewPanel';

const t = (key: string) => key;

describe('PreviewPanel', () => {
  it('renders text preview content', async () => {
    const blob = new Blob(['{"key": "value"}'], { type: 'application/json' });
    render(<PreviewPanel blob={blob} targetExt="json" open={true} onClose={vi.fn()} t={t} />);
    const pre = await screen.findByText('{"key": "value"}');
    expect(pre).toBeDefined();
  });

  it('shows loading state initially', () => {
    const blob = new Blob(['test content'], { type: 'text/plain' });
    render(<PreviewPanel blob={blob} targetExt="txt" open={true} onClose={vi.fn()} t={t} />);
    expect(screen.getByText('job.preview')).toBeDefined();
  });

  it('says so for a format it can’t show', () => {
    const blob = new Blob(['data'], { type: 'application/octet-stream' });
    render(<PreviewPanel blob={blob} targetExt="pdf" open={true} onClose={vi.fn()} t={t} />);
    expect(screen.getByText('job.previewUnavailable')).toBeDefined();
  });

  it('compares before and after for an image the browser can show, with both sizes', () => {
    const source = new File([new Uint8Array(2048)], 'photo.png', { type: 'image/png' });
    const blob = new Blob([new Uint8Array(512)], { type: 'image/webp' });
    render(
      <PreviewPanel
        blob={blob}
        source={source}
        targetExt="webp"
        open={true}
        onClose={vi.fn()}
        t={t}
      />,
    );
    const before = screen.getByAltText('job.before') as HTMLImageElement;
    const after = screen.getByAltText('job.preview') as HTMLImageElement;
    expect(before.src).toContain('blob:');
    expect(after.style.clipPath).toBe('inset(0 0 0 50%)');
    fireEvent.change(screen.getByRole('slider', { name: 'job.compare' }), {
      target: { value: '20' },
    });
    expect(after.style.clipPath).toBe('inset(0 0 0 20%)');
    expect(document.body.textContent).toContain('2.0 KB');
    expect(document.body.textContent).toContain('512 B');
  });

  it('no before side for a source <img> can’t show (HEIC)', () => {
    const source = new File(['x'], 'photo.heic');
    render(
      <PreviewPanel
        blob={new Blob(['y'], { type: 'image/jpeg' })}
        source={source}
        targetExt="jpg"
        open={true}
        onClose={vi.fn()}
        t={t}
      />,
    );
    expect(screen.queryByAltText('job.before')).toBeNull();
    expect(screen.getByAltText('job.preview')).toBeDefined();
  });

  it('plays a video result', () => {
    const { container } = render(
      <PreviewPanel
        blob={new Blob(['v'], { type: 'video/mp4' })}
        targetExt="mp4"
        open={true}
        onClose={vi.fn()}
        t={t}
      />,
    );
    expect(container.querySelector('video[controls]')).not.toBeNull();
  });

  it('renders image preview with blob URL', async () => {
    const blob = new Blob(['fake-image-data'], { type: 'image/png' });
    render(<PreviewPanel blob={blob} targetExt="png" open={true} onClose={vi.fn()} t={t} />);
    const img = await screen.findByAltText('job.preview');
    expect(img).toBeDefined();
    expect((img as HTMLImageElement).src).toContain('blob:');
  });

  it('does not render when closed', () => {
    const blob = new Blob(['hidden'], { type: 'text/plain' });
    const { container } = render(
      <PreviewPanel blob={blob} targetExt="txt" open={false} onClose={vi.fn()} t={t} />,
    );
    expect(container.querySelector('pre')).toBeNull();
  });
});
