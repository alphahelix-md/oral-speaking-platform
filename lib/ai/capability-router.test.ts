import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpstreamAiError } from './server';
import { runCapability } from './capability-router';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('capability routing', () => {
  it('reserves the second and last attempt for the configured fallback', async () => {
    const invoke = vi.fn(async (provider: 'deepseek' | 'glm') => {
      if (provider === 'glm') return 'fallback review';
      if (invoke.mock.calls.length === 1) throw new TypeError('network');
      throw new UpstreamAiError(503);
    });
    const result = await runCapability('content_evaluation', { primary: 'deepseek', fallback: 'glm' }, invoke);
    expect(result).toEqual({ value: 'fallback review', provider: 'glm', attempts: 2 });
    expect(invoke.mock.calls.map(([provider]) => provider)).toEqual(['deepseek', 'glm']);
  });

  it('does not bypass provider 429, which may mean account quota', async () => {
    const invoke = vi.fn(async () => { throw new UpstreamAiError(429, '1305'); });
    await expect(runCapability('content_evaluation', { primary: 'deepseek', fallback: 'glm' }, invoke)).rejects.toMatchObject({ status: 429 });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('does not route around invalid credentials', async () => {
    const invoke = vi.fn(async () => { throw new UpstreamAiError(401); });
    await expect(runCapability('content_evaluation', { primary: 'deepseek', fallback: 'glm' }, invoke)).rejects.toMatchObject({ status: 401 });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('uses the last attempt for fallback after malformed output', async () => {
    const invoke = vi.fn(async (_provider: 'deepseek' | 'glm') => { throw new SyntaxError('bad json'); });
    await expect(runCapability('content_evaluation', { primary: 'deepseek', fallback: 'glm' }, invoke)).rejects.toBeInstanceOf(SyntaxError);
    expect(invoke.mock.calls.map(([provider]) => provider)).toEqual(['deepseek', 'glm']);
  });

  it('keeps fallback inactive when not configured', async () => {
    const invoke = vi.fn(async () => { throw new UpstreamAiError(503); });
    await expect(runCapability('content_evaluation', { primary: 'deepseek' }, invoke)).rejects.toMatchObject({ status: 503 });
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});

describe('capacity and deadline boundaries', () => {
  it('switches GLM capacity error without immediately retrying the busy provider', async () => {
    const invoke = vi.fn(async (provider: string) => {
      if (provider === 'glm') throw new UpstreamAiError(429, '1305', 60);
      return 'ok';
    });
    expect(await runCapability('content_evaluation', { primary: 'glm', fallback: 'deepseek' }, invoke))
      .toEqual({ value: 'ok', provider: 'deepseek', attempts: 2 });
    expect(invoke.mock.calls.map(([p]) => p)).toEqual(['glm', 'deepseek']);
  });

  it('does not reinterpret unknown GLM quota errors as capacity', async () => {
    const invoke = vi.fn(async () => { throw new UpstreamAiError(429, 'unknown'); });
    await expect(runCapability('content_evaluation', { primary: 'glm', fallback: 'deepseek' }, invoke))
      .rejects.toMatchObject({ status: 429 });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('caps the combined primary and fallback attempts at two', async () => {
    const invoke = vi.fn(async (provider: string, timeoutMs: number) => {
      expect(timeoutMs).toBe(10000);
      if (provider === 'deepseek') throw new UpstreamAiError(503);
      return 'ok';
    });
    await runCapability('content_evaluation', { primary: 'deepseek', fallback: 'glm' }, invoke);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('stops before starting another request after the total budget expires', async () => {
    const now = vi.spyOn(Date, 'now');
    let clock = 0;
    now.mockImplementation(() => clock);
    const invoke = vi.fn(async () => { clock = 21_000; throw new TypeError('network'); });
    try {
      await expect(runCapability('content_evaluation', { primary: 'deepseek', fallback: 'glm' }, invoke))
        .rejects.toMatchObject({ name: 'TimeoutError' });
      expect(invoke).toHaveBeenCalledTimes(1);
    } finally { now.mockRestore(); }
  });

  it('never invokes the same provider as its own fallback', async () => {
    const invoke = vi.fn(async () => { throw new UpstreamAiError(503); });
    await expect(runCapability('content_evaluation', { primary: 'glm', fallback: 'glm' }, invoke)).rejects.toMatchObject({ status: 503 });
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls[0]).toEqual(['glm', 10000, expect.any(AbortSignal)]);
  });
});


describe('enforced operation deadlines', () => {
  it('aborts stuck calls and never starts a third attempt when an adapter ignores abort', async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const invoke = vi.fn((_provider: string, _timeout: number, signal: AbortSignal) => {
      signals.push(signal); return new Promise<string>(() => {});
    });
    const result = runCapability('content_evaluation', { primary: 'deepseek' }, invoke);
    const rejected = expect(result).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(21_000); await rejected;
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(signals.every(signal => signal.aborted)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('shares a decreasing overall deadline when time is spent outside the provider', async () => {
    let clock = 0; vi.spyOn(Date, 'now').mockImplementation(() => clock);
    const invoke = vi.fn(async (_provider: string, timeout: number) => {
      if (invoke.mock.calls.length === 1) { clock = 19_000; throw new TypeError('network'); }
      expect(timeout).toBe(2000); return 'ok';
    });
    expect((await runCapability('content_evaluation', { primary: 'deepseek' }, invoke)).attempts).toBe(2);
  });
});
