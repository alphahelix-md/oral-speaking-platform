import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestNotSentError } from '@/core/session/recovery';
import { updateAudioMetadata, type AudioMetadata } from './store';
import { transcribeLegacyAudio } from './legacy-transcription';

vi.mock('./store', () => ({ updateAudioMetadata: vi.fn() }));
let stored: AudioMetadata;
const chunks = [new File(['part0'], '0.wav'), new File(['part1'], '1.wav')];
const changed = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  stored = { createdAt: 'old', trainingConsent: false };
  vi.mocked(updateAudioMetadata).mockImplementation(async (_id, changes) => {
    stored = structuredClone({ ...stored, ...(typeof changes === 'function' ? changes(structuredClone(stored)) : changes) });
    return structuredClone(stored);
  });
});
describe('legacy audio request recovery', () => {
  it('claims before sending and reuses a persisted request ID for all chunks', async () => {
    const request = vi.fn(async (_chunk: File, index: number, requestId: string) => {
      expect(stored.transcriptionRecovery?.chunks[index].status).toBe('running');
      expect(requestId).toMatch(/^sp_[a-zA-Z0-9_-]{6,64}$/);
      return 'part ' + index;
    });
    expect(await transcribeLegacyAudio('old', chunks, request, changed)).toBe('part 0 part 1');
    expect(request.mock.calls[0][2]).toBe(request.mock.calls[1][2]);
    expect(stored.transcriptionChunks).toEqual(['part 0', 'part 1']);
    await transcribeLegacyAudio('old', chunks, request, changed);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('migrates old successful chunks and requests only the missing chunk', async () => {
    stored.transcriptionChunks = ['already paid'];
    const request = vi.fn().mockResolvedValue('new');
    expect(await transcribeLegacyAudio('old', chunks, request, changed)).toBe('already paid new');
    expect(request).toHaveBeenCalledOnce(); expect(request.mock.calls[0][1]).toBe(1);
  });
  it('retains partial text and blocks unknown outcomes after reload', async () => {
    const request = vi.fn().mockResolvedValueOnce('saved').mockRejectedValueOnce(new TypeError('offline'));
    await expect(transcribeLegacyAudio('old', chunks, request, changed)).rejects.toThrow('TRANSCRIPTION_UNCERTAIN');
    expect(stored.transcript).toBe('saved');
    expect(stored.transcriptionRecovery?.chunks[1].status).toBe('uncertain');
    stored = JSON.parse(JSON.stringify(stored));
    await expect(transcribeLegacyAudio('old', chunks, request, changed)).rejects.toThrow('TRANSCRIPTION_UNCERTAIN');
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('blocks another tab while the first request is still running', async () => {
    let release!: (text: string) => void;
    const request = vi.fn(() => new Promise<string>(resolve => { release = resolve; }));
    const first = transcribeLegacyAudio('old', chunks.slice(0, 1), request, changed);
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    await expect(transcribeLegacyAudio('old', chunks.slice(0, 1), request, changed)).rejects.toThrow('TRANSCRIPTION_UNCERTAIN');
    release('first'); await first;
    expect(request).toHaveBeenCalledOnce();
  });
  it('allows explicit not-sent rejection to retry with the same request ID', async () => {
    const request = vi.fn().mockRejectedValueOnce(new RequestNotSentError('BUDGET_LIMIT_REACHED')).mockResolvedValueOnce('ok');
    await expect(transcribeLegacyAudio('old', chunks.slice(0, 1), request, changed)).rejects.toThrow('BUDGET_LIMIT_REACHED');
    await transcribeLegacyAudio('old', chunks.slice(0, 1), request, changed);
    expect(request.mock.calls[0][2]).toBe(request.mock.calls[1][2]);
  });
  it('does not send if the pre-request checkpoint fails', async () => {
    vi.mocked(updateAudioMetadata).mockRejectedValueOnce(new Error('quota'));
    const request = vi.fn();
    await expect(transcribeLegacyAudio('old', chunks, request, changed)).rejects.toThrow('quota');
    expect(request).not.toHaveBeenCalled();
  });
  it('does not resend after receiving text but failing to persist it', async () => {
    const request = vi.fn(async () => {
      vi.mocked(updateAudioMetadata).mockRejectedValueOnce(new Error('quota')); return 'received';
    });
    await expect(transcribeLegacyAudio('old', chunks, request, changed)).rejects.toThrow('quota');
    expect(stored.transcriptionRecovery?.chunks[0].status).toBe('running');
    await expect(transcribeLegacyAudio('old', chunks, request, changed)).rejects.toThrow('TRANSCRIPTION_UNCERTAIN');
    expect(request).toHaveBeenCalledOnce();
  });
});
