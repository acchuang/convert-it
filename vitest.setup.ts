import { Image as CanvasImage, createCanvas } from 'canvas';

const blobStore = new Map<string, Blob>();

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

(globalThis as any).Image = class extends CanvasImage {
  set src(value: string) {
    const blob = blobStore.get(value);
    if (!blob) {
      super.src = value;
      return;
    }
    if (blob.size === 0) {
      setTimeout(() => {
        if (this.onerror) this.onerror();
      }, 0);
      return;
    }
    blobToDataUrl(blob).then(dataUrl => {
      super.src = dataUrl;
    });
  }
};

const _createObjectURL = URL.createObjectURL.bind(URL);
URL.createObjectURL = function (blob: Blob) {
  const url = _createObjectURL(blob);
  blobStore.set(url, blob);
  return url;
};

const _revokeObjectURL = URL.revokeObjectURL.bind(URL);
URL.revokeObjectURL = function (url: string) {
  blobStore.delete(url);
  _revokeObjectURL(url);
};

const canvasContextMap = new WeakMap<HTMLCanvasElement, ReturnType<typeof createCanvas>>();

function getCanvasContext(el: HTMLCanvasElement) {
  let c = canvasContextMap.get(el);
  if (!c) {
    c = createCanvas(el.width || 300, el.height || 150);
    canvasContextMap.set(el, c);
  }
  return c;
}

const _origGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (contextType: string, options?: any) {
  if (contextType === '2d') {
    return getCanvasContext(this).getContext('2d') as any;
  }
  return _origGetContext.call(this, contextType, options);
};

const _origToBlob = HTMLCanvasElement.prototype.toBlob;
HTMLCanvasElement.prototype.toBlob = function (
  callback: BlobCallback,
  mimeType?: string,
  quality?: any,
) {
  const c = canvasContextMap.get(this as unknown as HTMLCanvasElement);
  if (!c) return _origToBlob.call(this, callback, mimeType, quality);

  const mime = mimeType || 'image/png';
  let buf: Buffer;
  try {
    buf = c.toBuffer(mime, quality != null ? { quality } : undefined);
  } catch {
    buf = c.toBuffer('image/png');
  }
  callback(new Blob([buf], { type: mime }));
};

const _origToDataURL = HTMLCanvasElement.prototype.toDataURL;
HTMLCanvasElement.prototype.toDataURL = function (mimeType?: string, quality?: any) {
  const c = canvasContextMap.get(this as unknown as HTMLCanvasElement);
  if (!c) return _origToDataURL.call(this, mimeType, quality);

  const mime = mimeType || 'image/png';
  let buf: Buffer;
  try {
    buf = c.toBuffer(mime, quality != null ? { quality } : undefined);
  } catch {
    buf = c.toBuffer('image/png');
  }
  return `data:${mime};base64,${buf.toString('base64')}`;
};
