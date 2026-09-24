import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ access: vi.fn(), guardError: vi.fn(), construct: vi.fn(), metadata: vi.fn(), stream: vi.fn(), close: vi.fn() }));
vi.mock('@/lib/ai/guard', () => ({ guardBetaAccess: mocks.access, guardErrorResponse: mocks.guardError }));
vi.mock('msedge-tts', () => ({
  OUTPUT_FORMAT: { AUDIO_24KHZ_48KBITRATE_MONO_MP3: 'fixture-mp3' },
  MsEdgeTTS: class {
    constructor() { mocks.construct(); }
    setMetadata = mocks.metadata;
    toStream = mocks.stream;
    close = mocks.close;
  },
}));
import { POST } from './route';

const input = { text: 'A & B < C > D', language: 'en', mode: 'daily', level: 'Beginner' };
function request(body = input, signal?: AbortSignal) {
  return new Request('http://localhost/api/tts', { method: 'POST', body: JSON.stringify(body), signal });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers();
  mocks.access.mockResolvedValue('account'); mocks.guardError.mockReturnValue(null); mocks.metadata.mockResolvedValue(undefined);
  mocks.stream.mockImplementation(() => ({ audioStream: Readable.from([Buffer.from('audio'), Buffer.from(' bytes')]) }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('question speech route', () => {
  it.each([
    ['en', 'daily', 'Beginner', 'en-US-AriaNeural', '-5%'],
    ['en', 'ielts', 'B1', 'en-GB-SoniaNeural', '-6%'],
    ['ja', 'daily', 'Beginner', 'ja-JP-NanamiNeural', '-12%'],
    ['ja', 'daily', 'Intermediate', 'ja-JP-NanamiNeural', '-7%'],
  ])('preserves %s/%s/%s voice, complete bytes and private caching', async (language, mode, level, voice, rate) => {
    const response = await POST(request({ ...input, language, mode, level }));
    expect(response.status).toBe(200); expect(await response.text()).toBe('audio bytes');
    expect(response.headers.get('content-type')).toBe('audio/mpeg');
    expect(response.headers.get('cache-control')).toBe('private, max-age=604800');
    expect(mocks.metadata).toHaveBeenCalledWith(voice, 'fixture-mp3');
    expect(mocks.stream).toHaveBeenCalledWith('A &amp; B &lt; C &gt; D', { rate, pitch: '+0Hz', volume: '+0%' });
    expect(mocks.close).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it('rejects denied access before connecting', async () => {
    mocks.access.mockRejectedValue(new Error('denied')); mocks.guardError.mockReturnValue({ error: 'ACCESS_DENIED', status: 401 });
    expect((await POST(request())).status).toBe(401); expect(mocks.construct).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('rejects invalid input before connecting', async () => {
    expect((await POST(request({ ...input, text: '' }))).status).toBe(400);
    expect(mocks.construct).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it('does no work for an already cancelled request', async () => {
    expect((await POST(request(input, AbortSignal.abort()))).status).toBe(502);
    expect(mocks.access).not.toHaveBeenCalled(); expect(mocks.construct).not.toHaveBeenCalled();
  });
  it.each(['authentication', 'body'] as const)('bounds stalled %s and prevents late synthesis', async stage => {
    const gate = deferred<unknown>(); const req = request();
    if (stage === 'authentication') mocks.access.mockReturnValue(gate.promise);
    else vi.spyOn(req, 'json').mockReturnValue(gate.promise);
    let response: Response | undefined;
    const pending = POST(req).then(value => { response = value; });
    await vi.advanceTimersByTimeAsync(15_000);
    const statusAtDeadline = response?.status;
    gate.resolve(stage === 'body' ? input : 'account');
    await pending;
    expect(statusAtDeadline).toBe(502); expect(mocks.construct).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['deadline', 'cancel'] as const)('closes stalled metadata on %s and never starts a late stream', async reason => {
    const gate = deferred<void>(); mocks.metadata.mockReturnValue(gate.promise);
    const controller = new AbortController();
    let response: Response | undefined;
    const pending = POST(request(input, controller.signal)).then(value => { response = value; });
    await vi.advanceTimersByTimeAsync(0); expect(mocks.metadata).toHaveBeenCalledOnce();
    if (reason === 'cancel') controller.abort();
    await vi.advanceTimersByTimeAsync(reason === 'deadline' ? 15_000 : 0);
    const statusWhenStopped = response?.status; const closedWhenStopped = mocks.close.mock.calls.length;
    gate.resolve(); await pending; await vi.advanceTimersByTimeAsync(0);
    expect(statusWhenStopped).toBe(502); expect(closedWhenStopped).toBeGreaterThan(0);
    expect(mocks.stream).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['deadline', 'cancel'] as const)('discards partial audio and releases a stalled stream on %s', async reason => {
    const audioStream = new Readable({ read() {} }); audioStream.push(Buffer.from('partial'));
    mocks.stream.mockReturnValue({ audioStream }); const controller = new AbortController();
    let response: Response | undefined;
    const pending = POST(request(input, controller.signal)).then(value => { response = value; });
    await vi.advanceTimersByTimeAsync(0);
    if (reason === 'cancel') controller.abort();
    await vi.advanceTimersByTimeAsync(reason === 'deadline' ? 15_000 : 0);
    const statusWhenStopped = response?.status; const destroyedWhenStopped = audioStream.destroyed;
    audioStream.push(null); await pending;
    expect(statusWhenStopped).toBe(502); expect(destroyedWhenStopped).toBe(true);
    expect(await response!.json()).toEqual({ error: 'TTS_UNAVAILABLE' });
    expect(mocks.close).toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['empty', 'stream error', 'metadata error'] as const)('returns a bounded failure for %s without retrying', async kind => {
    if (kind === 'metadata error') mocks.metadata.mockRejectedValue(new Error('fixture failure'));
    else mocks.stream.mockReturnValue({ audioStream: kind === 'empty' ? Readable.from([]) : Readable.from((async function* () { yield Buffer.from('partial'); throw new Error('fixture failure'); })()) });
    const response = await POST(request());
    expect(response.status).toBe(502); expect(await response.json()).toEqual({ error: 'TTS_UNAVAILABLE' });
    expect(mocks.construct).toHaveBeenCalledOnce(); expect(mocks.close).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
});
