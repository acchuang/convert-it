import type { ConvertRequest, ConvertResponse } from './convert.worker';
import type { ConversionSettings } from './types';

export class CancelledError extends Error {
  constructor() {
    super('Conversion cancelled');
    this.name = 'CancelledError';
  }
}

/**
 * Converters that still have to run on the UI thread.
 *
 * ponytail: xml and html parsing go through DOMParser, PDF output strips tags
 * with a detached element, and none of those exist in a worker. Audio and video
 * stay here on purpose — ffmpeg.wasm already runs in its own worker, so moving
 * it would nest workers and re-download the 31 MB core per pool slot for no
 * gain. Move the DOM-bound three off by swapping DOMParser for fast-xml-parser
 * (already a dependency) and a plain tag-strip.
 */
export function runsOnMainThread(sourceExt: string, targetExt: string, category?: string): boolean {
  if (category === 'video' || category === 'audio') return true;
  return sourceExt === 'xml' || sourceExt === 'html' || targetExt === 'pdf';
}

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

function release(worker: Worker) {
  busy.delete(worker);
  idle.push(worker);
  pump();
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
    else task.reject(new Error(data.message));
    release(worker);
  };

  // A worker that dies mid-job (OOM on a large file, usually) fires onerror and
  // never replies, so fail its task rather than leaving the card spinning.
  worker.onerror = () => {
    const task = busy.get(worker);
    task?.reject(new Error('Conversion worker crashed — the file may be too large'));
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
