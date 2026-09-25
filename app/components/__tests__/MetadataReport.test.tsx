import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createCanvas } from 'canvas';
import { MetadataReport } from '@/app/components/MetadataReport';
import { buildExif, insertExif } from '@/lib/image-metadata';

const t = (key: string) => key;

function geotagged(): File {
  const canvas = createCanvas(8, 8);
  canvas.getContext('2d').fillRect(0, 0, 8, 8);
  const tiff = buildExif(
    { make: 'Apple', model: 'iPhone 15', gps: { latitude: 48.8584, longitude: 2.2945 }, iso: 64 },
    { keepGps: true },
  );
  const bytes = insertExif(new Uint8Array(canvas.toBuffer('image/jpeg')), 'jpg', tiff);
  return new File([bytes as Uint8Array<ArrayBuffer>], 'IMG.jpg', { type: 'image/jpeg' });
}

describe('MetadataReport', () => {
  it('lists what the photo carries, struck through when it will be removed', async () => {
    render(<MetadataReport file={geotagged()} mode="strip" t={t} />);
    const location = await screen.findByText('48.8584, 2.2945');
    expect(location.className).toContain('line-through');
    expect(screen.getByText('Apple iPhone 15').className).toContain('line-through');
    expect(screen.getByText('ISO 64')).toBeTruthy();
    expect(screen.getByText('job.metaWillStrip')).toBeTruthy();
  });

  it('"keep, no location" strikes only the location', async () => {
    render(<MetadataReport file={geotagged()} mode="keep-no-gps" t={t} />);
    expect((await screen.findByText('48.8584, 2.2945')).className).toContain('line-through');
    expect(screen.getByText('Apple iPhone 15').className).not.toContain('line-through');
  });

  it('says so when there is nothing', async () => {
    const canvas = createCanvas(8, 8);
    const plain = new File([canvas.toBuffer('image/jpeg')], 'plain.jpg');
    render(<MetadataReport file={plain} mode="strip" t={t} />);
    expect(await screen.findByText('job.metaNone')).toBeTruthy();
  });
});
