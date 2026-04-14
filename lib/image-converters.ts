import { encodeIcoBlob } from 'ico-codec';

const IMAGE_MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  bmp: 'image/bmp',
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = src;
  });
}

async function svgToImage(svgText: string): Promise<HTMLImageElement> {
  const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    return await loadImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function rasterizeImage(
  source: HTMLImageElement,
  targetExt: string,
  width: number,
  height: number
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  if (['jpg', 'jpeg', 'bmp'].includes(targetExt)) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(source, 0, 0, width, height);

  const mimeType = IMAGE_MIME_MAP[targetExt] ?? 'image/png';

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas export failed'));
      },
      mimeType,
      0.92
    );
  });
}

export async function convertImage(file: File, sourceExt: string, targetExt: string): Promise<Blob> {
  const isSvg = sourceExt === 'svg';

  let img: HTMLImageElement;
  if (isSvg) {
    const svgText = await file.text();
    img = await svgToImage(svgText);
  } else {
    const url = URL.createObjectURL(file);
    try {
      img = await loadImage(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  if (targetExt === 'ico') {
    const size = Math.min(img.naturalWidth, 256);
    const pngBlob = await rasterizeImage(img, 'png', img.naturalWidth, img.naturalHeight);
    const pngBuffer = new Uint8Array(await pngBlob.arrayBuffer());
    return encodeIcoBlob([{ size, data: pngBuffer }]);
  }

  return rasterizeImage(img, targetExt, img.naturalWidth, img.naturalHeight);
}