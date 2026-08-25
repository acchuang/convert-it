import { convertFile } from './converters';
import type { ConversionSettings } from './types';

export interface ConvertRequest {
  id: string;
  file: File;
  targetExt: string;
  settings: ConversionSettings;
}

export type ConvertResponse =
  | { id: string; type: 'progress'; pct: number }
  | { id: string; type: 'done'; blob: Blob }
  | { id: string; type: 'error'; message: string };

// Typed by hand rather than by adding "webworker" to tsconfig's lib, which
// collides with "dom" on every shared global.
const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<ConvertRequest>) => void) | null;
  postMessage: (message: ConvertResponse) => void;
};

function post(message: ConvertResponse) {
  ctx.postMessage(message);
}

ctx.onmessage = async (event: MessageEvent<ConvertRequest>) => {
  const { id, file, targetExt, settings } = event.data;
  try {
    const blob = await convertFile(file, targetExt, settings, (pct) =>
      post({ id, type: 'progress', pct }),
    );
    post({ id, type: 'done', blob });
  } catch (err) {
    post({ id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
