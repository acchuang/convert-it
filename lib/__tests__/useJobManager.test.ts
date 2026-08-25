import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useJobManager } from '@/lib/useJobManager';
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
    runInWorker: vi.fn(async (
      _id: string,
      file: File,
      targetExt: string,
      settings: ConversionSettings,
      onProgress?: (pct: number) => void,
    ) => {
      const { convertFile } = await import('@/lib/converters');
      return convertFile(file, targetExt, settings, onProgress);
    }),
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
    expect(result.current.jobs[0].error).toMatch(/too large/i);
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
      () => new Promise<Blob>(resolve => { resolveConvert = resolve; })
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

  it('sets status to error with a message when convertFile rejects', async () => {
    mockConvertFile.mockRejectedValueOnce(new Error('boom'));

    const { result } = renderHook(() => useJobManager());
    act(() => result.current.addFiles([new File(['a,b\n1,2'], 'data.csv', { type: 'text/csv' })]));
    const job = result.current.jobs[0];

    await act(async () => {
      await result.current.convertJob(job);
    });

    expect(result.current.jobs[0].status).toBe('error');
    expect(result.current.jobs[0].error).toBe('boom');
  });

  it('does not invoke convertFile twice when convertJob is called concurrently on the same job', async () => {
    let resolveConvert!: (blob: Blob) => void;
    mockConvertFile.mockImplementation(
      () => new Promise<Blob>(resolve => { resolveConvert = resolve; })
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
    act(() => result.current.addFiles([new File(['<p>x</p>'], 'page.html', { type: 'text/html' })]));

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
      () => new Promise<Blob>(resolve => { resolveConvert = resolve; })
    );

    const { result } = renderHook(() => useJobManager());
    act(() => result.current.addFiles([new File(['<p>x</p>'], 'page.html', { type: 'text/html' })]));
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
