import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioRecorder } from './recorder';

afterEach(() => vi.unstubAllGlobals());
describe('browser recording failures', () => {
  it('reports unsupported browsers before asking permission', async () => {
    vi.stubGlobal('navigator', { mediaDevices: undefined });
    vi.stubGlobal('window', {});
    await expect(new AudioRecorder().start()).rejects.toThrow('Recording is unsupported');
  });
  it('propagates denied microphone permission', async () => {
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError')) } });
    vi.stubGlobal('window', { MediaRecorder: function MediaRecorder() {} });
    await expect(new AudioRecorder().start()).rejects.toMatchObject({ name: 'NotAllowedError' });
  });
});
