import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// A stand-in Worker: answers every request with "done" on the next tick and
// records terminations.
class FakeWorker {
  static live = 0;
  terminated = false;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    FakeWorker.live++;
  }
  postMessage(msg: { id: string }) {
    setTimeout(
      () =>
        this.onmessage?.({
          data: { id: msg.id, type: 'done', blob: new Blob(['ok']) },
        } as MessageEvent),
      0,
    );
  }
  terminate() {
    if (!this.terminated) FakeWorker.live--;
    this.terminated = true;
  }
}

describe('worker pool reaping', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    FakeWorker.live = 0;
    vi.stubGlobal('Worker', FakeWorker);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const file = new File(['x'], 'a.png');

  it('terminates a worker after it has been idle for the timeout', async () => {
    const pool = await import('@/lib/worker-pool');
    const done = pool.runInWorker('1', file, 'jpg', {} as never);
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(pool.poolSize()).toBe(1);
    await vi.advanceTimersByTimeAsync(pool.IDLE_TIMEOUT_MS - 10);
    expect(pool.poolSize()).toBe(1);
    await vi.advanceTimersByTimeAsync(20);
    expect(pool.poolSize()).toBe(0);
    expect(FakeWorker.live).toBe(0);
  });

  it('reuses an idle worker instead of reaping it, and restarts its clock', async () => {
    const pool = await import('@/lib/worker-pool');
    const first = pool.runInWorker('1', file, 'jpg', {} as never);
    await vi.advanceTimersByTimeAsync(1);
    await first;
    await vi.advanceTimersByTimeAsync(pool.IDLE_TIMEOUT_MS - 1000);
    const second = pool.runInWorker('2', file, 'jpg', {} as never);
    await vi.advanceTimersByTimeAsync(1);
    await second;
    expect(pool.poolSize()).toBe(1); // same worker, not a new one
    await vi.advanceTimersByTimeAsync(pool.IDLE_TIMEOUT_MS - 1000);
    expect(pool.poolSize()).toBe(1); // clock restarted after the second job
    await vi.advanceTimersByTimeAsync(2000);
    expect(pool.poolSize()).toBe(0);
  });

  it('spawns again after reaping', async () => {
    const pool = await import('@/lib/worker-pool');
    const first = pool.runInWorker('1', file, 'jpg', {} as never);
    await vi.advanceTimersByTimeAsync(1);
    await first;
    await vi.advanceTimersByTimeAsync(pool.IDLE_TIMEOUT_MS + 1);
    expect(pool.poolSize()).toBe(0);
    const again = pool.runInWorker('2', file, 'jpg', {} as never);
    await vi.advanceTimersByTimeAsync(1);
    await expect(again).resolves.toBeInstanceOf(Blob);
    expect(pool.poolSize()).toBe(1);
  });
});
