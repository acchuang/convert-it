import Papa from 'papaparse';

// Streaming CSV/TSV for the high-volume paths (CSV/TSV → JSON, CSV ⇄ TSV).
//
// The old converters read the whole file into one string, parsed every row
// into an array of objects, then built one giant output string: several times
// the file's size in memory at once, and no progress until the end. Here the
// File is read in slices (Papa.LocalChunkSize), decoded by a streaming
// TextDecoder, and parsed row by row (Papa step mode). Each row is serialised
// as it arrives into ~1 MB output parts, so peak memory is about the output
// plus one slice, and progress follows the bytes read.

export interface StreamOptions {
  header: boolean;
  delimiter?: string;
  dynamicTyping?: boolean;
  onProgress?: (pct: number) => void;
}

type Listener = (arg?: unknown) => void;

/**
 * The File as a Node-style stream of *decoded* text, which Papa Parse accepts
 * (its ReadableStreamStreamer). Papa's own File streamer decodes each slice
 * separately, so a multi-byte character straddling a slice boundary turned
 * into "��" (reproduced with CJK and emoji at 64 KB slices). A streaming
 * TextDecoder carries partial characters over to the next slice instead.
 */
function decodedTextStream(file: File, onBytes: (read: number) => void) {
  const listeners: Record<string, Listener[]> = { data: [], end: [], error: [] };
  const emit = (event: string, arg?: unknown) => listeners[event].forEach((fn) => fn(arg));
  const decoder = new TextDecoder('utf-8'); // also drops a leading BOM
  let offset = 0;
  let paused = false;
  let running = false;
  let started = false;

  const pump = async () => {
    if (running) return;
    running = true;
    try {
      while (!paused && offset < file.size) {
        const end = Math.min(file.size, offset + Papa.LocalChunkSize);
        const bytes = new Uint8Array(await file.slice(offset, end).arrayBuffer());
        offset = end;
        onBytes(offset);
        const text = decoder.decode(bytes, { stream: offset < file.size });
        if (text) emit('data', text);
      }
      if (!paused && offset >= file.size) {
        const rest = decoder.decode();
        if (rest) emit('data', rest);
        emit('end');
      }
    } catch (err) {
      emit('error', err);
    } finally {
      running = false;
    }
  };

  return {
    readable: true as const,
    read: () => undefined,
    on(event: string, fn: Listener) {
      listeners[event]?.push(fn);
      // Papa subscribes to data, end, then error: start once all three are wired.
      if (event === 'error' && !started) {
        started = true;
        queueMicrotask(pump);
      }
      return this;
    },
    removeListener(event: string, fn: Listener) {
      listeners[event] = (listeners[event] ?? []).filter((l) => l !== fn);
      return this;
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
      void pump();
    },
  };
}

/** Calls `onRow` for every non-empty row, in order; resolves with the header fields. */
export function streamRows<T>(
  file: File,
  options: StreamOptions,
  onRow: (row: T) => void,
): Promise<{ fields: string[] }> {
  return new Promise((resolve, reject) => {
    let fields: string[] = [];
    let lastPct = -1;
    const report = (read: number) => {
      if (!options.onProgress || file.size === 0) return;
      // Capped so the bar never reads 100% before the output exists.
      const pct = Math.min(99, Math.floor((read / file.size) * 100));
      if (pct > lastPct) {
        lastPct = pct;
        options.onProgress(pct);
      }
    };
    const stream = decodedTextStream(file, report);
    Papa.parse<T>(stream as unknown as File, {
      header: options.header,
      delimiter: options.delimiter ?? '',
      dynamicTyping: options.dynamicTyping ?? false,
      skipEmptyLines: true,
      step: (results) => {
        if (results.meta.fields) fields = results.meta.fields;
        onRow(results.data);
      },
      complete: () => resolve({ fields }),
      error: (err) => reject(err instanceof Error ? err : new Error(String(err))),
    });
  });
}

const FLUSH_AT = 1 << 20; // characters per output part

/** Collects output text into ~1 MB Blob parts instead of one huge string. */
export class BlobBuilder {
  private parts: string[] = [];
  private buffer = '';

  append(text: string): void {
    this.buffer += text;
    if (this.buffer.length >= FLUSH_AT) {
      this.parts.push(this.buffer);
      this.buffer = '';
    }
  }

  toBlob(type: string): Blob {
    if (this.buffer) this.parts.push(this.buffer);
    return new Blob(this.parts, { type });
  }
}

/**
 * Writes a JSON array one element at a time, byte-for-byte what
 * `JSON.stringify(array, null, indent)` produces for the same elements.
 */
export class JsonArrayWriter {
  private readonly out = new BlobBuilder();
  private count = 0;
  private readonly pad: string;

  constructor(private readonly indent: number) {
    this.pad = ' '.repeat(indent);
  }

  push(value: unknown): void {
    if (this.indent === 0) {
      this.out.append((this.count ? ',' : '[') + JSON.stringify(value));
    } else {
      const body = JSON.stringify(value, null, this.indent).replace(/\n/g, `\n${this.pad}`);
      this.out.append((this.count ? ',\n' : '[\n') + this.pad + body);
    }
    this.count++;
  }

  toBlob(): Blob {
    if (this.count === 0) this.out.append('[]');
    else this.out.append(this.indent === 0 ? ']' : '\n]');
    return this.out.toBlob('application/json');
  }
}
