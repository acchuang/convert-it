import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { outputFilename, uniqueName, useJobManager } from '@/lib/useJobManager';
import { DEFAULT_SETTINGS } from '@/lib/types';
import type { FileJob } from '@/app/components/JobCard';

vi.mock('@/lib/converters', async () => {
  const actual = await vi.importActual<typeof import('@/lib/converters')>('@/lib/converters');
  return {
    ...actual,
    convertFile: vi.fn(),
  };
});

// jsdom has no Worker, so the pool path is routed back through the mocked
// convertFile: these tests cover the job state machine, not the transport.
vi.mock('@/lib/worker-pool', async () => {
  const actual = await vi.importActual<typeof import('@/lib/worker-pool')>('@/lib/worker-pool');
  return {
    ...actual,
    runInWorker: vi.fn(
      async (
        _id: string,
        file: File,
        targetExt: string,
        settings: ConversionSettings,
        onProgress?: (pct: number) => void,
      ) => {
        const { convertFile } = await import('@/lib/converters');
        return convertFile(file, targetExt, settings, onProgress);
      },
    ),
    cancelInWorker: vi.fn(() => false),
  };
});

import { convertFile } from '@/lib/converters';
import { cancelInWorker, runInWorker, CancelledError } from '@/lib/worker-pool';
import type { ConversionSettings } from '@/lib/types';

const mockConvertFile = vi.mocked(convertFile);
const mockRunInWorker = vi.mocked(runInWorker);
const mockCancelInWorker = vi.mocked(cancelInWorker);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

function makeJob(overrides: Partial<FileJob> = {}): FileJob {
  return {
    id: 'job-1',
    file: new File(['a,b\n1,2'], 'data.csv', { type: 'text/csv' }),
    sourceExt: 'csv',
    targetExt: 'json',
    status: 'idle',
    progress: 0,
    settings: { ...DEFAULT_SETTINGS },
    ...overrides,
  };
}

describe('useJobManager: addFiles', () => {
  it('adds a normal-size file as an idle job with a default target', () => {
    const { result } = renderHook(() => useJobManager());
    const file = new File(['a,b\n1,2'], 'data.csv', { type: 'text/csv' });

    act(() => result.current.addFiles([file]));

    expect(result.current.jobs).toHaveLength(1);
    expect(result.current.jobs[0].status).toBe('idle');
    expect(result.current.jobs[0].sourceExt).toBe('csv');
    expect(result.current.jobs[0].targetExt).not.toBeNull();
  });

  it('marks an oversized file as an error job using FILE_SIZE_LIMITS', () => {
    const { result } = renderHook(() => useJobManager());
    // document limit is 50MB; simulate an oversized txt file without allocating real memory
    const big = new File(['x'], 'huge.txt', { type: 'text/plain' });
    Object.defineProperty(big, 'size', { value: 51 * 1024 * 1024 });

    act(() => result.current.addFiles([big]));

    expect(result.current.jobs).toHaveLength(1);
    expect(result.current.jobs[0].status).toBe('error');
    expect(result.current.jobs[0].error).toMatchObject({
      code: 'too-large',
      params: { size: 51, limit: 50 },
    });
    expect(result.current.jobs[0].targetExt).toBeNull();
  });

  it('appends to existing jobs rather than replacing them', () => {
    const { result } = renderHook(() => useJobManager());
    act(() => result.current.addFiles([new File(['a'], 'a.csv', { type: 'text/csv' })]));
    act(() => result.current.addFiles([new File(['b'], 'b.csv', { type: 'text/csv' })]));
    expect(result.current.jobs).toHaveLength(2);
  });
});

describe('useJobManager: convertJob', () => {
  it('transitions idle -> converting -> done and sets resultBlob on success', async () => {
    let resolveConvert!: (blob: Blob) => void;
    mockConvertFile.mockImplementation(
      () =>
        new Promise<Blob>((resolve) => {
          resolveConvert = resolve;
        }),
    );

    const { result } = renderHook(() => useJobManager());
    act(() => result.current.addFiles([new File(['a,b\n1,2'], 'data.csv', { type: 'text/csv' })]));
    const job = result.current.jobs[0];

    let convertPromise!: Promise<void>;
    act(() => {
      convertPromise = result.current.convertJob(job);
    });

    await waitFor(() => {
      expect(result.current.jobs[0].status).toBe('converting');
    });
    expect(result.current.jobs[0].progress).toBe(10);

    const resultBlob = new Blob(['[{"a":1,"b":2}]'], { type: 'application/json' });
    await act(async () => {
      resolveConvert(resultBlob);
      await convertPromise;
    });

    expect(result.current.jobs[0].status).toBe('done');
    expect(result.current.jobs[0].resultBlob).toBe(resultBlob);
    expect(result.current.jobs[0].progress).toBe(100);
  });

  it('sets status to error with a classified failure when convertFile rejects', async () => {
    mockConvertFile.mockRejectedValueOnce(new Error('boom'));

    const { result } = renderHook(() => useJobManager());
    act(() => result.current.addFiles([new File(['a,b\n1,2'], 'data.csv', { type: 'text/csv' })]));
    const job = result.current.jobs[0];

    await act(async () => {
      await result.current.convertJob(job);
    });

    expect(result.current.jobs[0].status).toBe('error');
    expect(result.current.jobs[0].error).toEqual({ code: 'unknown', detail: 'boom' });
  });

  it('does not invoke convertFile twice when convertJob is called concurrently on the same job', async () => {
    let resolveConvert!: (blob: Blob) => void;
    mockConvertFile.mockImplementation(
      () =>
        new Promise<Blob>((resolve) => {
          resolveConvert = resolve;
        }),
    );

    const { result } = renderHook(() => useJobManager());
    act(() => result.current.addFiles([new File(['a,b\n1,2'], 'data.csv', { type: 'text/csv' })]));
    const job = result.current.jobs[0];

    let p1!: Promise<void>;
    let p2!: Promise<void>;
    act(() => {
      p1 = result.current.convertJob(job);
      p2 = result.current.convertJob(job);
    });

    await waitFor(() => {
      expect(result.current.jobs[0].status).toBe('converting');
    });

    expect(mockConvertFile).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveConvert(new Blob(['ok']));
      await Promise.all([p1, p2]);
    });

    expect(mockConvertFile).toHaveBeenCalledTimes(1);
    expect(result.current.jobs[0].status).toBe('done');
  });

  it('does nothing when the job has no targetExt', async () => {
    const { result } = renderHook(() => useJobManager());
    const job = makeJob({ targetExt: null });

    await act(async () => {
      await result.current.convertJob(job);
    });

    expect(mockConvertFile).not.toHaveBeenCalled();
  });
});

describe('useJobManager: worker routing and cancel', () => {
  it('sends a worker-safe conversion to the pool', async () => {
    mockConvertFile.mockResolvedValue(new Blob(['ok']));

    const { result } = renderHook(() => useJobManager());
    act(() => result.current.addFiles([new File(['a,b\n1,2'], 'data.csv', { type: 'text/csv' })]));

    await act(async () => {
      await result.current.convertJob(result.current.jobs[0]);
    });

    expect(mockRunInWorker).toHaveBeenCalledTimes(1);
  });

  it('keeps a DOM-bound conversion on the main thread', async () => {
    mockConvertFile.mockResolvedValue(new Blob(['ok']));

    const { result } = renderHook(() => useJobManager());
    act(() =>
      result.current.addFiles([new File(['<p>x</p>'], 'page.html', { type: 'text/html' })]),
    );

    await act(async () => {
      await result.current.convertJob(result.current.jobs[0]);
    });

    expect(mockRunInWorker).not.toHaveBeenCalled();
    expect(mockConvertFile).toHaveBeenCalledTimes(1);
  });

  it('returns a cancelled worker job to idle instead of error', async () => {
    mockCancelInWorker.mockReturnValueOnce(true);
    mockRunInWorker.mockRejectedValueOnce(new CancelledError());

    const { result } = renderHook(() => useJobManager());
    act(() => result.current.addFiles([new File(['a,b\n1,2'], 'data.csv', { type: 'text/csv' })]));
    const job = result.current.jobs[0];

    let convertPromise!: Promise<void>;
    act(() => {
      convertPromise = result.current.convertJob(job);
    });
    act(() => result.current.cancelJob(job.id));
    await act(async () => {
      await convertPromise;
    });

    expect(mockCancelInWorker).toHaveBeenCalledWith(job.id);
    expect(result.current.jobs[0].status).toBe('idle');
    expect(result.current.jobs[0].error).toBeUndefined();
  });

  it('discards the result of a cancelled main-thread job', async () => {
    let resolveConvert!: (blob: Blob) => void;
    mockConvertFile.mockImplementation(
      () =>
        new Promise<Blob>((resolve) => {
          resolveConvert = resolve;
        }),
    );

    const { result } = renderHook(() => useJobManager());
    act(() =>
      result.current.addFiles([new File(['<p>x</p>'], 'page.html', { type: 'text/html' })]),
    );
    const job = result.current.jobs[0];

    let convertPromise!: Promise<void>;
    act(() => {
      convertPromise = result.current.convertJob(job);
    });
    act(() => result.current.cancelJob(job.id));
    await act(async () => {
      resolveConvert(new Blob(['too late']));
      await convertPromise;
    });

    expect(result.current.jobs[0].status).toBe('idle');
    expect(result.current.jobs[0].resultBlob).toBeUndefined();
  });
});

describe('useJobManager: removeJob / clearAll / doneCount', () => {
  it('removeJob removes only the matching job', () => {
    const { result } = renderHook(() => useJobManager());
    act(() => {
      result.current.addFiles([
        new File(['a'], 'a.csv', { type: 'text/csv' }),
        new File(['b'], 'b.csv', { type: 'text/csv' }),
      ]);
    });
    const [first, second] = result.current.jobs;

    act(() => result.current.removeJob(first.id));

    expect(result.current.jobs).toHaveLength(1);
    expect(result.current.jobs[0].id).toBe(second.id);
  });

  it('clearAll empties all jobs', () => {
    const { result } = renderHook(() => useJobManager());
    act(() => result.current.addFiles([new File(['a'], 'a.csv', { type: 'text/csv' })]));
    expect(result.current.jobs).toHaveLength(1);

    act(() => result.current.clearAll());

    expect(result.current.jobs).toHaveLength(0);
  });

  it('doneCount reflects only jobs with status done', async () => {
    mockConvertFile.mockResolvedValue(new Blob(['ok']));

    const { result } = renderHook(() => useJobManager());
    act(() => {
      result.current.addFiles([
        new File(['a'], 'a.csv', { type: 'text/csv' }),
        new File(['b'], 'b.csv', { type: 'text/csv' }),
      ]);
    });

    expect(result.current.doneCount).toBe(0);

    const job = result.current.jobs[0];
    await act(async () => {
      await result.current.convertJob(job);
    });

    expect(result.current.doneCount).toBe(1);
  });
});

describe('outputFilename', () => {
  const file = new File(['x'], 'report.final.pdf');

  it('swaps the extension for the target', () => {
    expect(
      outputFilename({
        file,
        targetExt: 'png',
        resultBlob: new Blob(['x'], { type: 'image/png' }),
      }),
    ).toBe('report.final.png');
  });

  it('names a zip result .zip whatever the target', () => {
    const resultBlob = new Blob(['x'], { type: 'application/zip' });
    expect(outputFilename({ file, targetExt: 'png', resultBlob })).toBe('report.final.zip');
  });
});

describe('uniqueName', () => {
  it('suffixes repeats, case-insensitively, keeping the extension', () => {
    const used = new Set<string>();
    expect(uniqueName('photo.png', used)).toBe('photo.png');
    expect(uniqueName('photo.png', used)).toBe('photo (2).png');
    expect(uniqueName('PHOTO.png', used)).toBe('PHOTO (3).png');
    expect(uniqueName('photo (2).png', used)).toBe('photo (2) (2).png');
    expect(uniqueName('README', used)).toBe('README');
    expect(uniqueName('README', used)).toBe('README (2)');
  });
});

describe('downloadJob', () => {
  it('keeps the object URL alive after the click so the download can finish', async () => {
    vi.useFakeTimers();
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      const { result } = renderHook(() => useJobManager());
      const job = {
        id: '1',
        file: new File(['x'], 'a.txt'),
        sourceExt: 'txt',
        targetExt: 'md',
        status: 'done',
        progress: 100,
        settings: DEFAULT_SETTINGS,
        resultBlob: new Blob(['x']),
      } as FileJob;
      act(() => result.current.downloadJob(job));
      expect(click).toHaveBeenCalled();
      expect(revoke).not.toHaveBeenCalled();
      vi.advanceTimersByTime(60_000);
      expect(revoke).toHaveBeenCalledWith('blob:test');
    } finally {
      revoke.mockRestore();
      create.mockRestore();
      click.mockRestore();
      vi.useRealTimers();
    }
  });
});

describe('reorder and merge', () => {
  const files = () => [
    new File(['%PDF-1.4'], 'a.pdf'),
    new File(['x'], 'b.csv'),
    new File(['png'], 'c.png'),
  ];

  it('moveJob swaps neighbours and ignores moves past either end', () => {
    const { result } = renderHook(() => useJobManager());
    act(() => result.current.addFiles(files()));
    const names = () => result.current.jobs.map((j) => j.file.name);
    act(() => result.current.moveJob(result.current.jobs[2].id, -1));
    expect(names()).toEqual(['a.pdf', 'c.png', 'b.csv']);
    act(() => result.current.moveJob(result.current.jobs[0].id, -1));
    act(() => result.current.moveJob(result.current.jobs[2].id, 1));
    expect(names()).toEqual(['a.pdf', 'c.png', 'b.csv']);
  });

  it('counts only PDFs and images as mergeable', () => {
    const { result } = renderHook(() => useJobManager());
    act(() => result.current.addFiles(files()));
    expect(result.current.mergeableCount).toBe(2);
  });

  it('a failed merge is reported, not thrown', async () => {
    const { result } = renderHook(() => useJobManager());
    act(() => result.current.addFiles(files())); // a.pdf is not a real PDF
    await act(() => result.current.mergeToPdf());
    expect(result.current.merge).toMatchObject({
      status: 'error',
      error: { code: 'corrupt-input' },
    });
  });
});

describe('download names and folders', () => {
  it('"download all" applies the template and rebuilds dropped folders', async () => {
    mockConvertFile.mockResolvedValue(new Blob(['{}'], { type: 'application/json' }));
    const blobs: Blob[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
      blobs.push(b as Blob);
      return 'blob:x';
    });
    const { result } = renderHook(() => useJobManager());
    act(() =>
      result.current.addFiles([
        { file: new File(['a,b\n1,2'], 'one.csv'), folder: 'Data/2026' },
        { file: new File(['a,b\n1,2'], 'two.csv'), folder: '' },
      ]),
    );
    act(() => result.current.setNameTemplate('{n}-{name}'));
    for (const job of result.current.jobs) await act(() => result.current.convertJob(job));
    await waitFor(() => expect(result.current.doneCount).toBe(2));
    await act(() => result.current.downloadAllAsZip());
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(await blobs.at(-1)!.arrayBuffer());
    expect(
      Object.keys(zip.files)
        .filter((n) => !n.endsWith('/'))
        .sort(),
    ).toEqual(['2-two.json', 'Data/2026/1-one.json']);
  });
});

describe('apply settings to similar files', () => {
  it('copies what both routes read to jobs with the same target, and resets them', () => {
    const { result } = renderHook(() => useJobManager());
    act(() =>
      result.current.addFiles([
        new File(['p'], 'a.png'),
        new File(['h'], 'b.heic'),
        new File(['v'], 'c.mp4'),
        new File(['x'], 'd.csv'),
      ]),
    );
    const [a, b, c] = result.current.jobs;
    act(() => {
      for (const job of [a, b, c]) result.current.updateJob(job.id, { targetExt: 'webp' });
      result.current.updateJob(c.id, { status: 'done', resultBlob: new Blob(['x']) });
      result.current.updateJobSettings(a.id, { quality: 0.5, imageMaxSide: 1280 });
    });
    act(() => result.current.applySettingsToSimilar(a.id));
    const [, b2, c2, d2] = result.current.jobs;
    expect(b2.settings).toMatchObject({ quality: 0.5, imageMaxSide: 1280 });
    // mp4 → webp is an animation: it reads neither, so it keeps its result.
    expect(c2.settings.quality).toBe(DEFAULT_SETTINGS.quality);
    expect(c2.status).toBe('done');
    expect(d2.settings.quality).toBe(DEFAULT_SETTINGS.quality);
  });
});

describe('files no route reads', () => {
  it('reads a misnamed file as what it is, and explains one it can’t read', async () => {
    const { result } = renderHook(() => useJobManager());
    act(() =>
      result.current.addFiles([
        new File(['%PDF-1.4'], 'scan'),
        new File(['II*\0'], 'photo.tiff'),
        new File(['a,b'], 'ok.csv'),
      ]),
    );
    await waitFor(() => expect(result.current.jobs[1].status).toBe('error'));
    const [scan, tiff, csv] = result.current.jobs;
    await waitFor(() => expect(result.current.jobs[0].sourceExt).toBe('pdf'));
    expect(result.current.jobs[0]).toMatchObject({
      targetExt: expect.any(String),
      identified: { from: '', reason: 'content' },
    });
    expect(result.current.jobs[0].file.name).toBe('scan.pdf');
    expect(scan.id).toBe(result.current.jobs[0].id);
    expect(tiff.error).toMatchObject({
      code: 'unsupported',
      params: { kind: 'image', label: 'TIFF' },
    });
    expect(csv.identified).toBeUndefined();
  });
});
