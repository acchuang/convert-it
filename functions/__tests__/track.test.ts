import { describe, it, expect, beforeEach, vi } from 'vitest';
import { onRequestPost, onRequestOptions } from '@/functions/api/track';

class FakeKV {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  async put(key: string, value: string, _options?: { expirationTtl?: number }): Promise<void> {
    this.store.set(key, value);
  }

  // test helpers
  _set(key: string, value: string) {
    this.store.set(key, value);
  }
  _get(key: string) {
    return this.store.get(key);
  }
}

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://test/api/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.useRealTimers();
});

describe('onRequestOptions', () => {
  it('returns 204 with CORS headers', async () => {
    const res = await onRequestOptions();
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

describe('onRequestPost: validation', () => {
  it('returns 200 with total/active for a valid sessionId', async () => {
    const STATS = new FakeKV();
    const res = await onRequestPost({ request: makeRequest({ sessionId: 'abc-123' }), env: { STATS } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ total: 0, active: 1 });
  });

  it('rejects sessionId with invalid characters', async () => {
    const STATS = new FakeKV();
    const res = await onRequestPost({ request: makeRequest({ sessionId: 'abc_123!' }), env: { STATS } });
    expect(res.status).toBe(400);
  });

  it('rejects sessionId that is too long', async () => {
    const STATS = new FakeKV();
    const longId = 'a'.repeat(65);
    const res = await onRequestPost({ request: makeRequest({ sessionId: longId }), env: { STATS } });
    expect(res.status).toBe(400);
  });

  it('rejects non-string sessionId', async () => {
    const STATS = new FakeKV();
    const res = await onRequestPost({ request: makeRequest({ sessionId: 12345 }), env: { STATS } });
    expect(res.status).toBe(400);
  });

  it('rejects missing sessionId', async () => {
    const STATS = new FakeKV();
    const res = await onRequestPost({ request: makeRequest({}), env: { STATS } });
    expect(res.status).toBe(400);
  });

  it('returns 400 for malformed JSON body', async () => {
    const STATS = new FakeKV();
    const res = await onRequestPost({ request: makeRequest('{not json'), env: { STATS } });
    expect(res.status).toBe(400);
  });
});

describe('onRequestPost: corrupted KV state', () => {
  it('recovers gracefully when the sessions KV value is corrupted (non-JSON)', async () => {
    const STATS = new FakeKV();
    STATS._set('sessions', 'not-json-{{{');

    const res = await onRequestPost({ request: makeRequest({ sessionId: 'abc-123' }), env: { STATS } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ total: 0, active: 1 });

    const stored = JSON.parse(STATS._get('sessions')!);
    expect(Object.keys(stored)).toEqual(['abc-123']);
  });
});

describe('onRequestPost: total_visits counting', () => {
  it('increments total_visits when isNew is true', async () => {
    const STATS = new FakeKV();
    const res = await onRequestPost({
      request: makeRequest({ sessionId: 'abc-123', isNew: true }, { 'CF-Connecting-IP': '1.1.1.1' }),
      env: { STATS },
    });
    const json = await res.json();
    expect(json.total).toBe(1);
  });

  it('does not increment total_visits when isNew is falsy', async () => {
    const STATS = new FakeKV();
    const res = await onRequestPost({
      request: makeRequest({ sessionId: 'abc-123' }, { 'CF-Connecting-IP': '1.1.1.1' }),
      env: { STATS },
    });
    const json = await res.json();
    expect(json.total).toBe(0);
  });

  it('rate-limits a second isNew:true POST from the same IP within 10s', async () => {
    const STATS = new FakeKV();
    const ip = '2.2.2.2';

    const res1 = await onRequestPost({
      request: makeRequest({ sessionId: 'session-one', isNew: true }, { 'CF-Connecting-IP': ip }),
      env: { STATS },
    });
    expect((await res1.json()).total).toBe(1);

    const res2 = await onRequestPost({
      request: makeRequest({ sessionId: 'session-two', isNew: true }, { 'CF-Connecting-IP': ip }),
      env: { STATS },
    });
    // second "new visit" from the same IP within the rate-limit window must not increment
    expect((await res2.json()).total).toBe(1);
  });

  it('allows a new visit count from a different IP within the same window', async () => {
    const STATS = new FakeKV();

    const res1 = await onRequestPost({
      request: makeRequest({ sessionId: 'session-one', isNew: true }, { 'CF-Connecting-IP': '3.3.3.3' }),
      env: { STATS },
    });
    expect((await res1.json()).total).toBe(1);

    const res2 = await onRequestPost({
      request: makeRequest({ sessionId: 'session-two', isNew: true }, { 'CF-Connecting-IP': '4.4.4.4' }),
      env: { STATS },
    });
    expect((await res2.json()).total).toBe(2);
  });
});

describe('onRequestPost: session pruning', () => {
  it('prunes stale session entries older than 60s from the active count', async () => {
    const STATS = new FakeKV();
    const now = Date.now();
    STATS._set('sessions', JSON.stringify({
      'stale-session': now - 61_000,
      'fresh-session': now - 5_000,
    }));

    const res = await onRequestPost({ request: makeRequest({ sessionId: 'new-session' }), env: { STATS } });
    const json = await res.json();

    // stale-session pruned, fresh-session + new-session remain
    expect(json.active).toBe(2);

    const stored = JSON.parse(STATS._get('sessions')!);
    expect(stored['stale-session']).toBeUndefined();
    expect(stored['fresh-session']).toBeDefined();
    expect(stored['new-session']).toBeDefined();
  });
});
