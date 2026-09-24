import { describe, expect, it, vi } from 'vitest';
import { UpstreamAiError } from './server';
import { runCapability } from './capability-router';

describe('capability routing', () => {
  it('retries transient primary failure then switches only this capability', async () => {
    const invoke = vi.fn(async (provider: 'deepseek' | 'glm') => {
      if (provider === 'glm') return 'fallback review';
      if (invoke.mock.calls.length === 1) throw new TypeError('network');
      throw new UpstreamAiError(503);
    });
    const result = await runCapability('content_evaluation', { primary: 'deepseek', fallback: 'glm' }, invoke);
    expect(result).toEqual({ value: 'fallback review', provider: 'glm', attempts: 3 });
    expect(invoke.mock.calls.map(([provider]) => provider)).toEqual(['deepseek', 'deepseek', 'glm']);
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

  it('tries configured fallback after repeated malformed output', async () => {
    const invoke = vi.fn(async (_provider: 'deepseek' | 'glm') => { throw new SyntaxError('bad json'); });
    await expect(runCapability('content_evaluation', { primary: 'deepseek', fallback: 'glm' }, invoke)).rejects.toBeInstanceOf(SyntaxError);
    expect(invoke.mock.calls.map(([provider]) => provider)).toEqual(['deepseek', 'deepseek', 'glm']);
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

  it('reserves time for all three attempts', async () => {
    const invoke = vi.fn(async (provider: string, timeoutMs: number) => {
      expect(timeoutMs).toBe(7000);
      if (provider === 'deepseek') throw new UpstreamAiError(503);
      return 'ok';
    });
    await runCapability('content_evaluation', { primary: 'deepseek', fallback: 'glm' }, invoke);
    expect(invoke).toHaveBeenCalledTimes(3);
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
    expect(invoke.mock.calls[0]).toEqual(['glm', 10000]);
  });
});
