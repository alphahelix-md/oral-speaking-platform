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

function recordingBrowser() {
  let now = 0;
  const stopTrack = vi.fn();
  class MockRecorder {
    static latest: MockRecorder;
    static isTypeSupported() { return true; }
    state: RecordingState = 'inactive'; mimeType = 'audio/webm';
    ondataavailable?: (event: { data: Blob }) => void;
    onstop?: () => void; onerror?: () => void;
    stopCalls = 0;
    constructor() { MockRecorder.latest = this; }
    start() { this.state = 'recording'; }
    pause() { this.state = 'paused'; }
    resume() { this.state = 'recording'; }
    stop() { this.stopCalls++; this.state = 'inactive'; }
    data(text: string) { this.ondataavailable?.({ data: new Blob([text]) }); }
    end() { this.state = 'inactive'; this.onstop?.(); }
  }
  vi.stubGlobal('navigator', { userAgent: 'test', mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] }) } });
  vi.stubGlobal('window', { MediaRecorder: MockRecorder }); vi.stubGlobal('MediaRecorder', MockRecorder);
  vi.stubGlobal('performance', { now: () => now });
  return { latest: () => MockRecorder.latest, time: (value: number) => { now = value; }, stopTrack };
}
describe('recording completion events', () => {
  it('caches a system-ended result and includes the final data event', async () => {
    const browser = recordingBrowser(); const interrupted = vi.fn(); const recorder = new AudioRecorder('en', interrupted);
    await recorder.start(); browser.latest().data('first'); browser.time(4200);
    browser.latest().data('last'); browser.latest().end();
    expect(interrupted).toHaveBeenCalledOnce(); expect(browser.stopTrack).toHaveBeenCalledOnce();
    const result = await recorder.stop();
    expect(await result.blob.text()).toBe('firstlast'); expect(result.seconds).toBe(4); expect(result.interrupted).toBe(true);
    expect(await recorder.stop()).toBe(result); expect(browser.latest().stopCalls).toBe(0);
  });
  it('waits for queued final data after the recorder has already become inactive', async () => {
    const browser = recordingBrowser(); const recorder = new AudioRecorder(); await recorder.start();
    browser.time(3000); browser.latest().state = 'inactive';
    const result = recorder.stop(); browser.latest().data('queued'); browser.latest().end();
    expect(await (await result).blob.text()).toBe('queued'); expect((await result).interrupted).toBe(true);
  });
  it('preserves data delivered after the error event instead of rejecting early', async () => {
    const browser = recordingBrowser(); const interrupted = vi.fn(); const recorder = new AudioRecorder('en', interrupted);
    await recorder.start(); browser.time(2000); browser.latest().onerror?.();
    browser.time(9000); browser.latest().data('recoverable'); browser.latest().end();
    const result = await recorder.stop(); expect(await result.blob.text()).toBe('recoverable');
    expect(result.seconds).toBe(2); expect(result.interrupted).toBe(true); expect(interrupted).toHaveBeenCalledOnce();
  });
  it('shares explicit stop requests without duplicate callbacks or elapsed pause time', async () => {
    const browser = recordingBrowser(); const interrupted = vi.fn(); const recorder = new AudioRecorder('en', interrupted);
    await recorder.start(); browser.time(1000); recorder.pause(); browser.time(11000); recorder.resume(); browser.time(14000);
    const first = recorder.stop(); const second = recorder.stop(); expect(first).toBe(second);
    browser.time(20000); browser.latest().data('complete'); browser.latest().end();
    expect((await first).seconds).toBe(4); expect((await first).interrupted).toBe(false);
    expect(browser.latest().stopCalls).toBe(1); expect(interrupted).not.toHaveBeenCalled();
  });
  it('does not trigger automatic saving after intentional disposal', async () => {
    const browser = recordingBrowser(); const interrupted = vi.fn(); const recorder = new AudioRecorder('en', interrupted);
    await recorder.start(); recorder.dispose(); browser.latest().data('discarded'); browser.latest().end();
    expect(interrupted).not.toHaveBeenCalled(); expect(browser.stopTrack).toHaveBeenCalledOnce();
  });
  it('releases a microphone granted after the recorder was disposed', async () => {
    recordingBrowser(); let resolve!: (value: unknown) => void; const stop = vi.fn();
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: () => new Promise(r => { resolve = r; }) } });
    const recorder = new AudioRecorder(); const start = recorder.start(); recorder.dispose();
    resolve({ getTracks: () => [{ stop }] }); await expect(start).rejects.toThrow('cancelled'); expect(stop).toHaveBeenCalledOnce();
  });
});


describe('recording format compatibility', () => {
  it('records and preserves MP4 when WebM is unavailable, as on older Safari', async () => {
    const stopTrack = vi.fn(); let recorder: SafariRecorder;
    class SafariRecorder {
      static isTypeSupported = (type: string) => type === 'audio/mp4';
      state: RecordingState = 'inactive'; mimeType: string;
      ondataavailable?: (event: { data: Blob }) => void; onstop?: () => void;
      constructor(_stream: unknown, options?: MediaRecorderOptions) {
        expect(options?.mimeType).toBe('audio/mp4'); this.mimeType = options!.mimeType!; recorder = this;
      }
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['original-mp4'], { type: this.mimeType }) }); this.onstop?.(); }
    }
    vi.stubGlobal('navigator', { userAgent: 'iPhone', mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] }) } });
    vi.stubGlobal('window', { MediaRecorder: SafariRecorder }); vi.stubGlobal('MediaRecorder', SafariRecorder);
    const capture = new AudioRecorder(); await capture.start();
    expect(recorder!.state).toBe('recording'); const result = await capture.stop();
    expect(result.blob.type).toBe('audio/mp4'); expect(await result.blob.text()).toBe('original-mp4');
    expect(stopTrack).toHaveBeenCalledOnce();
  });
});
