import { afterEach, describe, expect, it, vi } from 'vitest';
import { recordedAudioToWavChunks } from './wav';

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
});
