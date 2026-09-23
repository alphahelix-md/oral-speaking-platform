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

  it('repairs malformed output with same provider once, never with fallback', async () => {
    const invoke = vi.fn(async (_provider: 'deepseek' | 'glm') => { throw new SyntaxError('bad json'); });
    await expect(runCapability('content_evaluation', { primary: 'deepseek', fallback: 'glm' }, invoke)).rejects.toBeInstanceOf(SyntaxError);
    expect(invoke.mock.calls.map(([provider]) => provider)).toEqual(['deepseek', 'deepseek']);
  });

  it('keeps fallback inactive when not configured', async () => {
    const invoke = vi.fn(async () => { throw new UpstreamAiError(503); });
    await expect(runCapability('content_evaluation', { primary: 'deepseek' }, invoke)).rejects.toMatchObject({ status: 503 });
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});
