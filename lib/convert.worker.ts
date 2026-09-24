import { convertFile } from './converters';
import type { ConversionSettings } from './types';
import { classifyError, toTransferable, type ConversionFailure } from './errors';

export interface ConvertRequest {
  id: string;
  file: File;
  targetExt: string;
  settings: ConversionSettings;
}

export type ConvertResponse =
  | { id: string; type: 'progress'; pct: number }
  | { id: string; type: 'done'; blob: Blob }
  // Classified here, where the real error object (and its class) still exists.
  | { id: string; type: 'error'; failure: ConversionFailure };

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
    post({ id, type: 'error', failure: toTransferable(classifyError(err)) });
  }
};
