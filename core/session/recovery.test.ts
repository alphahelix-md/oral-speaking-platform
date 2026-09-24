import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSession, speakingReducer } from '@/core/speaking/engine';
import { commitDraft, recoverSession, RequestNotSentError, transcribeDraft } from './recovery';
import { deleteSessions, getSessions, saveSession } from './storage';
import type { AnswerDraft, Session } from '@/types/speaking';

let values: Map<string, string>;
let storage: { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn> };
beforeEach(() => {
  values = new Map();
  storage = { getItem: vi.fn((key: string) => values.get(key) || null), setItem: vi.fn((key: string, value: string) => values.set(key, value)) };
  vi.stubGlobal('localStorage', storage);
});
afterEach(() => vi.unstubAllGlobals());
const fresh = () => createSession('en', 'daily', 'Intermediate', 'Food', 'What do you cook?');
function reload(): Session { return recoverSession(JSON.parse(JSON.stringify(getSessions()[0]))); }

describe('durable practice recovery', () => {
  it('restores exact question, edited text, original reference, timing, and IELTS part', () => {
    const session = fresh();
    session.draft = { ...session.draft!, transcript: 'User correction', audioId: 'raw', audioStatus: 'verified', durationSeconds: 60, examPart: 2 };
    saveSession(session);
    const restored = reload();
    expect(restored.draft).toEqual(session.draft);
    expect(restored.question).toBe(session.question);
    expect(restored.draft?.turnId).toBe(session.draft.turnId);
  });
  it('atomically commits one stable turn and the next question; an old tab cannot resubmit', () => {
    let session = fresh();
    session.draft!.transcript = 'Answer';
    session = saveSession(session);
    const oldTab = structuredClone(session);
    const id = session.draft!.turnId;
    saveSession(commitDraft(session, 'Next question'));
    const restored = reload();
    expect(restored.turns.map(turn => turn.id)).toEqual([id]);
    expect(restored.draft?.transcript).toBe('');
    expect(restored.draft?.turnId).not.toBe(id);
    expect(restored.question).toBe('Next question');
    expect(() => saveSession(commitDraft(oldTab, 'Other question'))).toThrow('SESSION_CONFLICT');
    expect(speakingReducer(restored, { type: 'ANSWER', turnId: id, transcript: 'Duplicate', durationSeconds: 0 })).toBe(restored);
    expect(getSessions()[0].turns).toHaveLength(1);
  });
  it('retains draft and ID when quota failure prevents submission, then retries once', () => {
    let session = fresh(); session.draft!.transcript = 'Do not lose me'; session = saveSession(session);
    storage.setItem.mockImplementationOnce(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    expect(() => saveSession(commitDraft(session, 'Next'))).toThrow('Full');
    expect(reload().draft).toEqual(session.draft);
    saveSession(commitDraft(reload(), 'Next'));
    expect(getSessions()[0].turns).toHaveLength(1);
  });
  it('does not recreate an answer after final submission or interrupted evaluation', () => {
    let session = fresh(); session.draft!.transcript = 'Final';
    session = saveSession(commitDraft(session));
    session = saveSession({ ...session, evaluationRun: { key: session.turns[0].id, status: 'running' } });
    expect(reload().draft).toBeUndefined();
    expect(reload().evaluationRun).toEqual(session.evaluationRun);
    expect(commitDraft(reload())).toEqual(reload());
  });
  it('permits an untranscribed recording but rejects unverified or empty answers', () => {
    const session = fresh();
    expect(() => commitDraft(session)).toThrow('EMPTY_ANSWER');
    session.draft!.audioId = 'raw'; session.draft!.audioStatus = 'failed';
    expect(() => commitDraft(session)).toThrow('AUDIO_NOT_VERIFIED');
    session.draft!.audioStatus = 'verified';
    expect(commitDraft(session).turns[0]).toMatchObject({ audioId: 'raw', transcript: '', audioStatus: 'verified', transcriptionStatus: 'skipped', transcriptionChunks: [] });
  });
  it('retains completed chunk states and manual corrections after submission', () => {
    const session = fresh(); session.draft = { ...session.draft!, transcript: 'Edited answer', transcriptEdited: true, audioId: 'raw', audioStatus: 'verified', chunks: [{ status: 'succeeded', text: 'Provider answer' }] };
    saveSession(commitDraft(session, 'Next'));
    expect(getSessions()[0].turns[0]).toMatchObject({ transcript: 'Edited answer', transcriptionStatus: 'manual', transcriptionChunks: session.draft.chunks });
  });
  it('does not silently truncate older drafts when history exceeds 100 sessions', () => {
    const oldest = saveSession(fresh());
    for (let i = 0; i < 101; i++) saveSession(fresh());
    expect(getSessions().some(session => session.id === oldest.id)).toBe(true);
  });
  it('refuses to overwrite corrupt stored history', () => {
    values.set('oral.sessions.v1', '{invalid');
    expect(() => saveSession(fresh())).toThrow();
    expect(values.get('oral.sessions.v1')).toBe('{invalid');
  });
  it('does not clear damaged history when deleting a selected record', () => {
    values.set('oral.sessions.v1', '{invalid');
    expect(() => deleteSessions(['selected'])).toThrow();
    expect(values.get('oral.sessions.v1')).toBe('{invalid'); expect(storage.setItem).not.toHaveBeenCalled();
  });
  it('verifies deletion and preserves unselected drafts', () => {
    const selected = saveSession(fresh()); const remaining = saveSession(fresh());
    storage.setItem.mockImplementationOnce(() => {});
    expect(() => deleteSessions([selected.id])).toThrow('SESSION_READBACK_MISMATCH');
    deleteSessions([selected.id]); expect(getSessions()).toEqual([remaining]);
  });
  it('rejects a lost write instead of claiming saved', () => {
    storage.setItem.mockImplementation(() => {});
    expect(() => saveSession(fresh())).toThrow('SESSION_READBACK_MISMATCH');
  });
  it('migrates a legacy unfinished session without dropping old turns', () => {
    const old = fresh(); delete old.draft;
    const restored = recoverSession(old);
    expect(restored.draft?.turnId).toBeTruthy();
    expect(restored.turns).toEqual(old.turns);
  });
});

describe('durable transcription checkpoints', () => {
  const chunks = [new File(['part 1'], 'one.wav'), new File(['part 2'], 'two.wav')];
  function harness() {
    let session = saveSession(fresh());
    return {
      read: () => session.draft!,
      checkpoint: (changes: Partial<AnswerDraft>) => { session = saveSession({ ...session, draft: { ...session.draft!, ...changes } }); },
      refresh: () => { session = reload(); },
    };
  }
  it('permits retry after a proven pre-provider rejection without losing edited text', async () => {
    const h = harness(); h.checkpoint({ transcript: 'My correction', transcriptEdited: true });
    const request = vi.fn().mockRejectedValueOnce(new RequestNotSentError('AUTH_REQUIRED'));
    await expect(transcribeDraft(chunks, h.read, h.checkpoint, request)).rejects.toThrow('AUTH_REQUIRED');
    h.refresh(); expect(h.read().chunks).toEqual([]);
    request.mockResolvedValue('Provider text');
    await transcribeDraft(chunks, h.read, h.checkpoint, request);
    expect(h.read().transcript).toBe('My correction');
  });
  it('does not request already successful chunks after refresh', async () => {
    const h = harness();
    h.checkpoint({ chunks: [{ status: 'succeeded', text: 'First' }], transcript: 'Edited first' }); h.refresh();
    const request = vi.fn().mockResolvedValue('Second');
    expect(await transcribeDraft(chunks, h.read, h.checkpoint, request)).toBe('First Second');
    expect(request).toHaveBeenCalledExactlyOnceWith(chunks[1], 1);
    h.refresh(); request.mockClear();
    await transcribeDraft(chunks, h.read, h.checkpoint, request);
    expect(request).not.toHaveBeenCalled();
  });
  it('checkpoints before sending; refresh during a request preserves prior text without resending', async () => {
    const h = harness(); h.checkpoint({ transcript: 'Typed text', chunks: [{ status: 'succeeded', text: 'First' }, { status: 'running' }], stage: 'transcribing' });
    h.refresh();
    expect(h.read().transcript).toBe('Typed text');
    const request = vi.fn();
    await expect(transcribeDraft(chunks, h.read, h.checkpoint, request)).rejects.toThrow('TRANSCRIPTION_UNCERTAIN');
    expect(request).not.toHaveBeenCalled();
  });
  it('does not call a paid service if persisting the claim fails', async () => {
    const h = harness(); const request = vi.fn();
    storage.setItem.mockImplementationOnce(() => { throw new Error('Storage full'); });
    await expect(transcribeDraft(chunks, h.read, h.checkpoint, request)).rejects.toThrow('Storage full');
    expect(request).not.toHaveBeenCalled();
  });
  it('treats a failed request as uncertain and keeps successful chunks', async () => {
    const h = harness(); const request = vi.fn().mockResolvedValueOnce('First').mockRejectedValueOnce(new Error('Offline'));
    await expect(transcribeDraft(chunks, h.read, h.checkpoint, request)).rejects.toThrow('Offline');
    h.refresh(); request.mockClear();
    expect(h.read().transcript).toBe('First');
    await expect(transcribeDraft(chunks, h.read, h.checkpoint, request)).rejects.toThrow('TRANSCRIPTION_UNCERTAIN');
    expect(request).not.toHaveBeenCalled();
  });
  it('does not repeat a billed request when the response checkpoint fails', async () => {
    const h = harness();
    const request = vi.fn().mockImplementation(async () => {
      expect(getSessions()[0].draft?.chunks[0].status).toBe('running');
      storage.setItem.mockImplementationOnce(() => { throw new Error('Storage full'); });
      return 'Response';
    });
    await expect(transcribeDraft(chunks, h.read, h.checkpoint, request)).rejects.toThrow('Storage full');
    h.refresh(); request.mockClear();
    await expect(transcribeDraft(chunks, h.read, h.checkpoint, request)).rejects.toThrow('TRANSCRIPTION_UNCERTAIN');
    expect(request).not.toHaveBeenCalled();
  });
});
