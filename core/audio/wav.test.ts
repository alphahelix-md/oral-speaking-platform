import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeRecordedAudio, recordedAudioToWavChunks } from './wav';

afterEach(() => vi.unstubAllGlobals());

describe('recorded audio chunking', () => {
  it('splits a 40-second answer into 25-second and 15-second WAV requests', async () => {
    const samples = new Float32Array(40 * 16_000);
    const close = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('AudioContext', class {
      decodeAudioData = async () => ({
        duration: 40,
        numberOfChannels: 1,
        sampleRate: 16_000,
        getChannelData: () => samples,
      });
      close = close;
    });

    const chunks = await recordedAudioToWavChunks(new Blob(['recorded']));

    expect(chunks.map(chunk => chunk.size)).toEqual([44 + 25 * 16_000 * 2, 44 + 15 * 16_000 * 2]);
    expect(chunks.every(chunk => chunk.type === 'audio/wav')).toBe(true);
    expect(close).toHaveBeenCalledOnce();
  });

  it('uses PCM sample length when Android WebM reports a corrupt duration', async () => {
    const samples = new Float32Array(1.2 * 16_000);
    vi.stubGlobal('AudioContext', class {
      decodeAudioData = async () => ({
        duration: 69,
        numberOfChannels: 1,
        sampleRate: 16_000,
        getChannelData: () => samples,
      });
      close = vi.fn().mockResolvedValue(undefined);
    });

    const chunks = await recordedAudioToWavChunks(new Blob(['recorded']), 1.2);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].size).toBe(44 + samples.length * 2);
  });

  it('normalizes playback audio to a WAV with an explicit sample-based duration', async () => {
    const samples = new Float32Array(1.25 * 16_000);
    vi.stubGlobal('AudioContext', class {
      decodeAudioData = async () => ({
        duration: 69,
        numberOfChannels: 1,
        sampleRate: 16_000,
        getChannelData: () => samples,
      });
      close = vi.fn().mockResolvedValue(undefined);
    });

    const normalized = await normalizeRecordedAudio(new Blob(['recorded']), 1.25);

    expect(normalized.type).toBe('audio/wav');
    expect(normalized.size).toBe(44 + samples.length * 2);
  });
});
