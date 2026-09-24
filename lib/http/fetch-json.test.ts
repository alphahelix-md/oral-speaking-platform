import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchJsonWithTimeout } from './fetch-json';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('complete JSON request deadline', () => {
  it('covers a response body that stalls after successful headers', async () => {
    let signal!: AbortSignal;
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      signal = init.signal;
      return { ok: true, json: () => new Promise(() => {}) };
    }));
    const pending = fetchJsonWithTimeout('/api/test', {}, 1000);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(1000); await rejected;
    expect(signal.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
  });
  it('releases the caller even when fetch never settles or observes abort', async () => {
    const fetcher = vi.fn(() => new Promise(() => {})); vi.stubGlobal('fetch', fetcher);
    const pending = fetchJsonWithTimeout('/api/test', {}, 1000);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(1000); await rejected; expect(fetcher).toHaveBeenCalledOnce();
  });
  it('never sends after header preparation finishes beyond the deadline', async () => {
    let release!: (value: RequestInit) => void;
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const pending = fetchJsonWithTimeout('/api/test', () => new Promise(resolve => { release = resolve; }), 1000);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(1000); await rejected; release({});
    await Promise.resolve(); await Promise.resolve(); expect(fetcher).not.toHaveBeenCalled();
  });
  it('keeps HTTP rejection data and clears its timer after full body consumption', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'BUDGET_LIMIT_REACHED' }, { status: 429 })));
    const result = await fetchJsonWithTimeout('/api/test', {}, 1000);
    expect(result.response.status).toBe(429); expect(result.data).toEqual({ error: 'BUDGET_LIMIT_REACHED' });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not retry malformed bodies or failed preparation', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('invalid')); vi.stubGlobal('fetch', fetcher);
    await expect(fetchJsonWithTimeout('/api/test', {}, 1000)).rejects.toBeInstanceOf(SyntaxError);
    await expect(fetchJsonWithTimeout('/api/test', async () => { throw new Error('Auth failed'); }, 1000)).rejects.toThrow('Auth failed');
    expect(fetcher).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
});
