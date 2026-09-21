import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAllowedTextProviders, getAppRegion, resolveSpeechProvider, resolveTextProvider } from './region';

afterEach(() => vi.unstubAllEnvs());

describe('regional provider policy', () => {
  it('keeps global defaults backward compatible', () => {
    expect(getAppRegion()).toBe('global');
    expect(getAllowedTextProviders()).toEqual(['openai', 'deepseek', 'glm']);
  });

  it('never permits OpenAI in China even when configured', () => {
    vi.stubEnv('APP_REGION', 'china');
    vi.stubEnv('TEXT_PROVIDER_ALLOWLIST', 'openai,glm');
    vi.stubEnv('TEXT_PROVIDER', 'openai');
    expect(getAllowedTextProviders()).toEqual(['glm']);
    expect(resolveTextProvider('openai')).toBe('glm');
  });

  it('forces GLM speech in China', () => {
    vi.stubEnv('APP_REGION', 'china');
    vi.stubEnv('SPEECH_PROVIDER', 'basic');
    expect(resolveSpeechProvider()).toBe('glm');
  });

  it('honors allowed provider choices globally', () => {
    vi.stubEnv('APP_REGION', 'global');
    vi.stubEnv('TEXT_PROVIDER_ALLOWLIST', 'deepseek,glm');
    vi.stubEnv('TEXT_PROVIDER', 'glm');
    expect(resolveTextProvider('deepseek')).toBe('deepseek');
    expect(resolveTextProvider('openai')).toBe('glm');
  });
});
