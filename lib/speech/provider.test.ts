import { afterEach, describe, expect, it, vi } from 'vitest';
import { BasicSpeechProvider } from './providers/basic-provider';
import { getSpeechProvider } from './provider-registry';
import { GlmSpeechProvider } from './providers/glm-provider';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('speech provider', () => {
  it('rejects missing server key without calling network', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(new BasicSpeechProvider().transcribe(new File(['audio'], 'a.webm'), 'en')).rejects.toThrow('AI_NOT_CONFIGURED');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('returns the unified transcript shape', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ text: 'Hello world' }) }));
    const result = await new BasicSpeechProvider().transcribe(new File(['audio'], 'a.webm'), 'en');
    expect(result).toMatchObject({ text: 'Hello world', language: 'en', provider: 'basic' });
  });
  it('fails explicitly for unknown provider', () => {
    vi.stubEnv('SPEECH_PROVIDER', 'future');
    expect(() => getSpeechProvider()).toThrow('Unsupported speech provider');
  });
  it('sends WAV audio to GLM and reads returned text', async () => {
    vi.stubEnv('GLM_API_KEY', 'test-key');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ text: '今日はいい天気です' }) });
    vi.stubGlobal('fetch', fetchMock);
    const result = await new GlmSpeechProvider().transcribe(new File(['wav'], 'answer.wav', { type: 'audio/wav' }), 'ja');
    expect(result).toMatchObject({ text: '今日はいい天気です', language: 'ja', provider: 'glm' });
    expect(fetchMock.mock.calls[0][0]).toBe('https://open.bigmodel.cn/api/paas/v4/audio/transcriptions');
    expect(fetchMock.mock.calls[0][1].body.get('model')).toBe('glm-asr-2512');
  });
  it('runs both GLM language attempts through the provider request budget', async () => {
    vi.stubEnv('GLM_API_KEY', 'test-key');
    const requestFetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ text: '这是中文' }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ text: 'This is English.' }) });
    const unrelatedFetch = vi.fn(); vi.stubGlobal('fetch', unrelatedFetch);
    const result = await new GlmSpeechProvider().transcribe(new File(['wav'], 'answer.wav', { type: 'audio/wav' }), 'en', 'sp_stable_1', requestFetch);
    expect(result.text).toBe('This is English.'); expect(requestFetch).toHaveBeenCalledTimes(2); expect(unrelatedFetch).not.toHaveBeenCalled();
    expect(requestFetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
  it('rejects unsupported GLM audio before spending API quota', async () => {
    vi.stubEnv('GLM_API_KEY', 'test-key');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(new GlmSpeechProvider().transcribe(new File(['webm'], 'answer.webm', { type: 'audio/webm' }), 'en')).rejects.toThrow('GLM_AUDIO_FORMAT_UNSUPPORTED');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
