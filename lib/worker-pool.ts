import type { ConvertRequest, ConvertResponse } from './convert.worker';
import type { ConversionSettings } from './types';
import { ConversionError } from './errors';
import { findRoute } from './converters';

export class CancelledError extends Error {
  constructor() {
    super('Conversion cancelled');
    this.name = 'CancelledError';
  }
}

/**
 * Converters that still have to run on the UI thread.
 *
 * HTML input (DOMParser, and turndown for html → md) and Markdown → EPUB
 * (sanitised and serialised as XHTML through the DOM) need a DOM, which a
 * worker lacks. XML parses with fast-xml-parser, and every other → PDF path
 * typesets from text or marked's token tree, so those run in the pool. Audio
 * and video stay here on purpose: ffmpeg.wasm already runs in its own worker,
 * so moving it would nest workers and re-download the 31 MB core per pool slot
 * for no gain.
 *
 * The DOM-bound pair could move with a DOM shim in the worker (linkedom is
 * ~200 KB), but HTML and Markdown inputs are small documents that convert in
 * milliseconds; the shim would cost more load time than it saves.
 */
export function runsOnMainThread(
  sourceExt: string,
  targetExt: string,
  _category?: string,
): boolean {
  return findRoute(sourceExt, targetExt)?.thread === 'main';
}

// No transfer lists: the File going in and the Blob coming back are both
// passed by reference under structured clone (no bytes are copied), and the
// ImageData copies all happen inside the worker.
interface Task extends ConvertRequest {
  onProgress?: (pct: number) => void;
  resolve: (blob: Blob) => void;
  reject: (err: Error) => void;
}

// One spare core for the UI. Capped at 4: each worker holds its own copy of
// whichever wasm codec it touched, and memory runs out well before cores do.
const MAX_WORKERS = Math.min(4, Math.max(1, (globalThis.navigator?.hardwareConcurrency ?? 4) - 1));

const idle: Worker[] = [];
const busy = new Map<Worker, Task>();
const queue: Task[] = [];
let spawned = 0;

// An idle worker still holds the heap of every wasm codec it touched (pdfium
// alone is ~4 MB, plus whatever image it last decoded), so idle workers are
// terminated after a minute. The pool respawns on demand; a respawn costs a
// codec re-initialisation, which is cheap next to a conversion.
export const IDLE_TIMEOUT_MS = 60_000;
const idleTimers = new Map<Worker, ReturnType<typeof setTimeout>>();

function retire(worker: Worker) {
  idleTimers.delete(worker);
  const at = idle.indexOf(worker);
  if (at === -1) return; // picked up for another task meanwhile
  idle.splice(at, 1);
  worker.terminate();
  spawned--;
}

function release(worker: Worker) {
  busy.delete(worker);
  idle.push(worker);
  idleTimers.set(
    worker,
    setTimeout(() => retire(worker), IDLE_TIMEOUT_MS),
  );
  pump();
}

/** Workers currently alive (busy or idle); for tests and diagnostics. */
export function poolSize(): number {
  return spawned;
}

function spawn(): Worker {
  const worker = new Worker(new URL('./convert.worker.ts', import.meta.url));
  spawned++;

  worker.onmessage = ({ data }: MessageEvent<ConvertResponse>) => {
    const task = busy.get(worker);
    if (!task || task.id !== data.id) return;

    if (data.type === 'progress') {
      task.onProgress?.(data.pct);
      return;
    }
    if (data.type === 'done') task.resolve(data.blob);
    else
      task.reject(new ConversionError(data.failure.code, data.failure.detail, data.failure.params));
    release(worker);
  };

  // A worker that dies mid-job (OOM on a large file, usually) fires onerror and
  // never replies, so fail its task rather than leaving the card spinning.
  worker.onerror = () => {
    const task = busy.get(worker);
    task?.reject(
      new ConversionError('out-of-memory', 'Conversion worker crashed — the file may be too large'),
    );
    worker.terminate();
    busy.delete(worker);
    spawned--;
    pump();
  };

  return worker;
}

function pump() {
  while (queue.length > 0 && (idle.length > 0 || spawned < MAX_WORKERS)) {
    const worker = idle.pop() ?? spawn();
    clearTimeout(idleTimers.get(worker));
    idleTimers.delete(worker);
    const task = queue.shift()!;
    busy.set(worker, task);
    const { id, file, targetExt, settings } = task;
    worker.postMessage({ id, file, targetExt, settings } satisfies ConvertRequest);
  }
}

export function runInWorker(
  id: string,
  file: File,
  targetExt: string,
  settings: ConversionSettings,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    queue.push({ id, file, targetExt, settings, onProgress, resolve, reject });
    pump();
  });
}

/**
 * Drops a queued task, or kills the worker running it — wasm has no interrupt,
 * so terminating the whole worker is the only way to stop work in flight. The
 * pool refills lazily on the next task.
 */
export function cancelInWorker(id: string): boolean {
  const queued = queue.findIndex((task) => task.id === id);
  if (queued !== -1) {
    const [task] = queue.splice(queued, 1);
    task.reject(new CancelledError());
    return true;
  }

  for (const [worker, task] of busy) {
    if (task.id !== id) continue;
    worker.terminate();
    busy.delete(worker);
    spawned--;
    task.reject(new CancelledError());
    pump();
    return true;
  }
  return false;
}
