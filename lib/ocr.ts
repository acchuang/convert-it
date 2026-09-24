// OCR with tesseract.js (Apache-2.0) and its wasm core, all self-hosted
// under /ocr: by default tesseract.js fetches its worker, core and language
// data from third-party CDNs, which the CSP blocks and the privacy promise
// rules out. Nothing is fetched until the first OCR job, and each language
// only when it's chosen (0.7–3 MB each). The files stay out of the offline
// pack; the service worker caches them on first use.
//
// tesseract.js runs in its own worker. Started from the conversion worker,
// that is a nested worker, which every current browser supports.

import { ConversionError } from './errors';

export const OCR_BASE = process.env.NEXT_PUBLIC_OCR_BASE ?? '/ocr';

/** Languages shipped under /ocr/lang (tessdata 4.0.0 best_int). */
export const OCR_LANGUAGES = ['eng', 'spa', 'fra', 'deu', 'chi_sim', 'chi_tra', 'jpn', 'kor'];

type TesseractWorker = import('tesseract.js').Worker;

let current: { lang: string; worker: Promise<TesseractWorker> } | null = null;
let onProgress: ((fraction: number) => void) | undefined;

async function workerFor(lang: string): Promise<TesseractWorker> {
  if (!OCR_LANGUAGES.includes(lang)) {
    throw new ConversionError('invalid-settings', `No OCR data for language “${lang}”`);
  }
  if (current?.lang === lang) return current.worker;
  const previous = current;
  const worker = (async () => {
    if (previous) await (await previous.worker.catch(() => null))?.terminate();
    // tesseract.js starts its own worker. Browsers without nested workers
    // (old Safari) have no Worker inside ours; Node (tests) uses worker_threads.
    const node = typeof process !== 'undefined' && !!process.versions?.node;
    if (typeof Worker === 'undefined' && !node) {
      throw new ConversionError('unsupported', 'OCR needs a browser that can start workers here');
    }
    const [{ createWorker, OEM }, { simd }] = await Promise.all([
      import('tesseract.js'),
      import('wasm-feature-detect'),
    ]);
    // The two LSTM cores we ship: SIMD where the browser has it, plain otherwise.
    const core = (await simd()) ? 'tesseract-core-simd-lstm.js' : 'tesseract-core-lstm.js';
    return createWorker(lang, OEM.LSTM_ONLY, {
      // Node (tests) runs tesseract.js's own worker and core; the shipped
      // language data is used either way.
      ...(node ? {} : { workerPath: `${OCR_BASE}/worker.min.js`, corePath: `${OCR_BASE}/${core}` }),
      langPath: `${OCR_BASE}/lang`,
      workerBlobURL: false,
      gzip: true,
      // No IndexedDB copy: the service worker already caches /ocr.
      cacheMethod: 'none',
      logger: (m: { status: string; progress: number }) => {
        if (m.status === 'recognizing text') onProgress?.(m.progress);
      },
    });
  })();
  current = { lang, worker };
  // A failed start isn't kept: the next job tries again.
  worker.catch(() => {
    if (current?.worker === worker) current = null;
  });
  try {
    return await worker;
  } catch (err) {
    if (err instanceof ConversionError) throw err;
    throw new ConversionError(
      'engine-load',
      `The OCR engine didn't load: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// One recognition at a time: tesseract.js queues on a worker anyway, and the
// progress callback belongs to one job.
let queue: Promise<unknown> = Promise.resolve();

/** Text in an image (JPEG, PNG or BMP bytes). */
export function recognize(
  image: Blob,
  lang: string,
  progress?: (fraction: number) => void,
): Promise<string> {
  const run = queue.then(async () => {
    const worker = await workerFor(lang);
    onProgress = progress;
    try {
      // Bytes, not the Blob: tesseract's Node build (tests) reads only buffers,
      // and its browser build takes a Uint8Array as it is.
      const { data } = await worker.recognize(new Uint8Array(await image.arrayBuffer()) as never);
      return data.text;
    } finally {
      onProgress = undefined;
    }
  });
  queue = run.catch(() => {});
  return run;
}

/** Stops the OCR worker (frees its memory); the next job starts a new one. */
export async function terminateOcr(): Promise<void> {
  const previous = current;
  current = null;
  await (await previous?.worker.catch(() => null))?.terminate();
}
