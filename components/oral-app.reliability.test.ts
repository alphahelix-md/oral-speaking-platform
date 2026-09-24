import { sessionWriteAccess } from '@/core/session/write-access';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSession, speakingReducer } from '@/core/speaking/engine';
import { commitDraft, evaluationKey, recoverSession, RequestNotSentError, transcribeDraft } from '@/core/session/recovery';
import { getSessions, saveSession } from '@/core/session/storage';
import { fetchJsonWithTimeout } from '@/lib/http/fetch-json';
import { unavailableEvaluation } from '@/lib/ai/unavailable-review';
import type { Session } from '@/types/speaking';

// Execute production handlers with injected browser boundaries, not implementation copies.
// These checks complement (not replace) full browser acceptance.
const source = readFileSync(new URL('./oral-app.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('oral-app.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function handler(name: string, environment: Record<string, unknown>): (...args: any[]) => Promise<void> {
  let found: ts.FunctionDeclaration | undefined;
  const find = (node: ts.Node) => { if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node; ts.forEachChild(node, find); };
  find(ast); if (!found) throw new Error('Missing handler ' + name);
  const javascript = ts.transpileModule(found.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  return new Function(...Object.keys(environment), javascript + '; return ' + name)(...Object.values(environment));
}
let values: Map<string, string>;
let storage: { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn> };
beforeEach(() => {
  vi.spyOn(sessionWriteAccess, 'assert').mockImplementation(() => {});
  values = new Map();
  storage = { getItem: vi.fn((key: string) => values.get(key) || null), setItem: vi.fn((key: string, value: string) => values.set(key, value)) };
  vi.stubGlobal('localStorage', storage);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function context(initial?: Session) {
  const session = initial || createSession('en', 'daily', 'Intermediate', 'Food', 'Question');
  const ref = { current: session };
  const state: Record<string, any> = { transcript: session.draft?.transcript || '', busy: false, audio: null, sessionSaveFailed: false };
  const env: Record<string, any> = {
    session, sessionRef: ref, busy: false, restoring: false,
    submitLock: { current: false }, evaluationLock: { current: false }, analysisLock: { current: false }, stopLock: { current: false },
    recording: true, recordingActive: { current: true }, recordingLock: { current: false }, recordingInterruptedCopy: { en: 'Recording interrupted' }, recorder: { current: null }, browserTranscriber: { current: null }, timer: { current: null },
    originalAudio: { current: null }, language: 'en', mode: 'daily', uiLanguage: 'en', accessCode: '', authUser: null, trainingConsent: 'unset',
    speechRequestId: { current: '' }, sessionTurnLimit: 5, voice: { analyzing: 'analyzing', empty: 'empty', short: 'short', evaluating: 'evaluating' },
    extra: { saveFailed: 'Save failed', recordFailed: 'Record failed' },
    demoQuestion: vi.fn().mockReturnValue('Next question'), speakingReducer, commitDraft, evaluationKey,
    getVerifiedAudio: vi.fn().mockResolvedValue(new Blob(['raw'])), saveOriginalAudio: vi.fn().mockResolvedValue(undefined), saveAudio: vi.fn().mockResolvedValue(undefined),
    updateAudioMetadata: vi.fn().mockResolvedValue(undefined), normalizeRecordedAudio: vi.fn().mockResolvedValue(new Blob(['derived'])),
    analyzeAudio: vi.fn().mockResolvedValue(undefined), matchesTranscriptionLanguage: () => true,
    finishSession: vi.fn().mockResolvedValue(undefined), navigate: vi.fn(),
    getSupabaseAuthHeaders: vi.fn().mockResolvedValue({}), fetchJsonWithTimeout: vi.fn(),
    unavailableEvaluation, unavailableReviewCopy: { en: { notice: 'No score' } },
  };
  for (const key of ['sessionState','busy','notice','sessionSaveFailed','audioSaveFailed','audio','audioMetrics','transcriptResult','pendingAudioId','transcript','seconds','retryExamPart','quickFeedbackTurnId','recording','paused','processingStage','speechDiagnostic']) {
    env['set' + key[0].toUpperCase() + key.slice(1)] = (value: unknown) => { state[key] = typeof value === 'function' ? (value as Function)(state[key]) : value; };
  }
  env.persistSession = (next: Session) => {
    try { const saved = saveSession(next); ref.current = saved; state.sessionSaveFailed = false; return saved; }
    catch (error) { state.sessionSaveFailed = true; throw error; }
  };
  env.setSession = (next: Session | ((s: Session) => Session)) => {
    const value = typeof next === 'function' ? next(ref.current) : next;
    try { env.persistSession(value); } catch { ref.current = value; }
  };
  env.patchDraft = (changes: object, required = false) => {
    const next = { ...ref.current, draft: { ...ref.current.draft!, ...changes } };
    if (required) env.persistSession(next); else env.setSession(next);
  };
  return { env, state, ref };
}

describe('production answer handler', () => {
  it('retains input and releases locks when commit storage is full', async () => {
    const c = context(); c.ref.current.draft!.transcript = 'Keep this'; c.state.transcript = 'Keep this';
    c.env.persistSession(c.ref.current);
    storage.setItem.mockImplementationOnce(() => { throw new Error('Full'); });
    await handler('submitAnswer', c.env)();
    expect(c.state.transcript).toBe('Keep this'); expect(c.ref.current.draft!.transcript).toBe('Keep this');
    expect(c.state.sessionSaveFailed).toBe(true); expect(c.state.busy).toBe(false); expect(c.env.submitLock.current).toBe(false);
    await handler('submitAnswer', c.env)();
    expect(getSessions()[0].turns).toHaveLength(1); expect(c.state.transcript).toBe('');
  });
  it('serializes rapid clicks around async audio verification', async () => {
    const c = context(); c.ref.current.draft = { ...c.ref.current.draft!, audioId: 'raw', audioStatus: 'verified', transcript: 'One answer' };
    let release!: () => void;
    c.env.getVerifiedAudio.mockImplementation(() => new Promise<void>(resolve => { release = resolve; }));
    const submit = handler('submitAnswer', c.env); const first = submit(); await submit();
    expect(c.env.getVerifiedAudio).toHaveBeenCalledOnce(); release(); await first;
    expect(getSessions()[0].turns).toHaveLength(1); expect(c.env.submitLock.current).toBe(false);
  });
  it('does not commit, clear, or upload when original verification fails', async () => {
    const c = context(); c.ref.current.draft = { ...c.ref.current.draft!, audioId: 'raw', audioStatus: 'verified', transcript: 'Keep' };
    c.state.transcript = 'Keep'; c.env.getVerifiedAudio.mockRejectedValue(new Error('Corrupt'));
    await handler('submitAnswer', c.env)();
    expect(c.state.audioSaveFailed).toBe(true); expect(c.state.transcript).toBe('Keep');
    expect(c.ref.current.turns).toHaveLength(0); expect(c.env.updateAudioMetadata).not.toHaveBeenCalled();
  });
});

describe('production stop recording handler', () => {
  function recorded() {
    const c = context(); const raw = new Blob(['original bytes'], { type: 'audio/webm' });
    c.env.recorder.current = { stop: vi.fn().mockResolvedValue({ blob: raw, seconds: 4, metrics: { durationSeconds: 4 } }) };
    return { ...c, raw };
  }
  it('stores original before conversion and preserves it when conversion fails', async () => {
    const c = recorded();
    c.env.normalizeRecordedAudio.mockImplementation(async () => {
      expect(c.env.saveOriginalAudio).toHaveBeenCalledWith(expect.any(String), c.raw, expect.objectContaining({ sessionId: c.ref.current.id }));
      expect(getSessions()[0].draft!.audioStatus).toBe('verified');
      throw new Error('Decode failed');
    });
    await handler('finishRecording', c.env)();
    expect(c.env.originalAudio.current).toBe(c.raw); expect(c.state.audio).toBe(c.raw);
    expect(c.ref.current.draft?.audioStatus).toBe('verified'); expect(c.state.audioSaveFailed).toBe(false);
    expect(c.env.analyzeAudio).toHaveBeenCalledWith(c.raw, 4, undefined);
  });
  it('saves system-ended audio and lets the user inspect it before STT', async () => {
    const c = recorded();
    c.env.recording = false; // The callback may precede React's next render.
    c.env.recorder.current.stop.mockResolvedValue({ blob: c.raw, seconds: 4, metrics: { durationSeconds: 4 }, interrupted: true });
    await handler('finishRecording', c.env)();
    expect(c.env.saveOriginalAudio).toHaveBeenCalledOnce();
    expect(getSessions()[0].draft).toMatchObject({ audioStatus: 'verified', stage: 'interrupted' });
    expect(c.env.analyzeAudio).not.toHaveBeenCalled(); expect(c.state.notice).toBe('Recording interrupted');
    expect(c.env.recordingActive.current).toBe(false);
  });
  it('keeps downloadable original and stops before decoding or STT on write failure', async () => {
    const c = recorded(); c.env.saveOriginalAudio.mockRejectedValue(new Error('Full'));
    await handler('finishRecording', c.env)();
    expect(c.state.audio).toBe(c.raw); expect(c.env.originalAudio.current).toBe(c.raw);
    expect(c.ref.current.draft?.audioStatus).toBe('failed'); expect(c.state.audioSaveFailed).toBe(true);
    expect(c.env.normalizeRecordedAudio).not.toHaveBeenCalled(); expect(c.env.analyzeAudio).not.toHaveBeenCalled();
    expect(c.state.busy).toBe(false); expect(c.env.stopLock.current).toBe(false);
  });
});

describe('production evaluation handler', () => {
  function answered() {
    const c = context(); c.ref.current.draft!.transcript = 'Answer';
    c.env.persistSession(commitDraft(c.ref.current)); c.env.session = c.ref.current;
    return c;
  }
  it('persists request claim before fetch and prevents repetition after refresh', async () => {
    const c = answered();
    c.env.fetchJsonWithTimeout.mockImplementation(async () => {
      expect(getSessions()[0].evaluationRun?.status).toBe('running');
      throw new Error('Network lost');
    });
    await handler('finishSession', c.env)(); expect(c.env.fetchJsonWithTimeout).toHaveBeenCalledOnce();
    const restored = context(getSessions()[0]);
    await handler('finishSession', restored.env)(); expect(restored.env.fetchJsonWithTimeout).not.toHaveBeenCalled();
    expect(restored.env.navigate).toHaveBeenCalledWith('result');
  });
  it('finishes an interrupted evaluation without another request', async () => {
    const c = answered(); c.env.persistSession({ ...c.ref.current, evaluationRun: { key: evaluationKey(c.ref.current), status: 'running' } }); c.env.session = c.ref.current;
    await handler('finishSession', c.env)();
    expect(c.env.fetchJsonWithTimeout).not.toHaveBeenCalled(); expect(getSessions()[0].evaluation?.model).toBe('unavailable');
  });
  it('never evaluates while unsubmitted text remains', async () => {
    const c = context(); c.ref.current.draft!.transcript = 'Pending answer';
    await handler('finishSession', c.env)();
    expect(c.env.fetchJsonWithTimeout).not.toHaveBeenCalled(); expect(c.env.navigate).not.toHaveBeenCalled();
    expect(c.ref.current.draft?.transcript).toBe('Pending answer');
  });
  it('does not call evaluation when the durable claim cannot be stored', async () => {
    const c = answered(); storage.setItem.mockImplementation(() => { throw new Error('Full'); });
    await handler('finishSession', c.env)();
    expect(c.env.fetchJsonWithTimeout).not.toHaveBeenCalled(); expect(c.state.sessionSaveFailed).toBe(true);
  });
});

describe('production record deletion handler', () => {
  it('does not delete audio when stored history cannot be read safely', async () => {
    const c = context(); c.env.recording = false; c.env.sessionSaveFailed = false; c.env.audioSaveFailed = false;
    c.env.readSessions = vi.fn().mockImplementation(() => { throw new Error('Corrupt history'); });
    c.env.deleteAudioMany = vi.fn(); c.env.deleteSessions = vi.fn();
    await expect(handler('learningRecordsDeleted', c.env)(['selected'])).rejects.toThrow('Corrupt history');
    expect(c.env.deleteAudioMany).not.toHaveBeenCalled(); expect(c.env.deleteSessions).not.toHaveBeenCalled();
  });
});

describe('production handlers after incomplete network responses', () => {
  it('restores manual input after a stuck STT body without resending an uncertain chunk', async () => {
    vi.useFakeTimers();
    const c = context(); c.ref.current.draft = { ...c.ref.current.draft!, audioId: 'raw', audioStatus: 'verified', transcript: 'Keep my text', transcriptEdited: true };
    c.env.persistSession(c.ref.current);
    Object.assign(c.env, {
      fetchJsonWithTimeout, transcribeDraft, RequestNotSentError,
      recordedAudioToWavChunks: vi.fn().mockResolvedValue([new File(['audio'], 'chunk.wav')]),
      speechRequestCount: { current: 0 }, speechErrors: { en: { transcriptionFailed: 'Transcription failed' } }, recoveryText: { interrupted: 'Keep editing' },
    });
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => new Promise(() => {}) }); vi.stubGlobal('fetch', fetcher);
    const analyze = handler('analyzeAudio', c.env); const pending = analyze(new Blob(['original']), 4);
    await vi.advanceTimersByTimeAsync(60_000); await pending;
    expect(getSessions()[0].draft).toMatchObject({ audioId: 'raw', audioStatus: 'verified', transcript: 'Keep my text', stage: 'interrupted', chunks: [{ status: 'uncertain' }] });
    expect(c.state.busy).toBe(false); expect(c.env.analysisLock.current).toBe(false);
    await analyze(new Blob(['original']), 4); expect(fetcher).toHaveBeenCalledOnce();
  });
  it('saves a scoreless result after evaluation headers arrive but the body stalls', async () => {
    vi.useFakeTimers(); const c = context(); c.ref.current.draft!.transcript = 'Answer';
    c.env.persistSession(commitDraft(c.ref.current)); c.env.session = c.ref.current;
    c.env.fetchJsonWithTimeout = fetchJsonWithTimeout;
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => new Promise(() => {}) }); vi.stubGlobal('fetch', fetcher);
    const pending = handler('finishSession', c.env)(); await vi.advanceTimersByTimeAsync(25_000); await pending;
    expect(getSessions()[0].evaluation?.model).toBe('unavailable'); expect(getSessions()[0].turns).toHaveLength(1);
    expect(c.env.navigate).toHaveBeenCalledWith('result'); expect(c.state.busy).toBe(false); expect(c.env.evaluationLock.current).toBe(false);
    expect(fetcher).toHaveBeenCalledOnce();
  });
});


describe('saved recording playback failures', () => {
  it('shows an actionable notice instead of rejecting when IndexedDB is unavailable', async () => {
    const notice = vi.fn();
    await handler('playAudio', { getPlaybackAudio: vi.fn().mockRejectedValue(new Error('storage denied')), setNotice: notice, extra: { playback: 'Playback unavailable' } })('raw');
    expect(notice).toHaveBeenCalledWith('Playback unavailable');
  });
  it('releases the object URL after playback permission rejection', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const notice = vi.fn();
    vi.stubGlobal('Audio', class { play() { return Promise.reject(new Error('autoplay denied')); } });
    try {
      await handler('playAudio', { getPlaybackAudio: vi.fn().mockResolvedValue(new Blob(['raw'])), setNotice: notice, extra: { playback: 'Playback unavailable' } })('raw');
      expect(revoke).toHaveBeenCalledOnce(); expect(notice).toHaveBeenCalledWith('Playback unavailable');
    } finally { revoke.mockRestore(); }
  });
});


describe('interrupted draft recovery with question playback', () => {
  function restoredDraft(text = '') {
    const c = context();
    c.ref.current.draft = { ...c.ref.current.draft!, audioId: 'raw', audioStatus: 'verified', transcript: text,
      stage: 'transcribing', chunks: text ? [{ status: 'succeeded', text }, { status: 'running' }] : [{ status: 'running' }] };
    c.env.persistSession(c.ref.current);
    Object.assign(c.env, {
      recording: false, recordingActive: { current: false }, sessionSaveFailed: false, audioSaveFailed: false,
      pageRef: { current: 'speaking' }, questionPlaybackId: { current: 0 },
      getSessions, recoverSession, getPlaybackAudio: vi.fn().mockResolvedValue(new Blob(['playback'])),
      recoveryText: { interrupted: 'Processing interrupted', empty: 'No transcript saved; keep audio or type', partial: 'Saved text retained; complete manually' },
      questionAudioKey: () => 'question', questionAudioRequest: { current: { key: 'question', promise: Promise.resolve(new Blob(['question audio'])) } },
      playingQuestionAudio: { current: null }, playingQuestionAudioUrl: { current: '' },
      questionVoiceUnavailable: { en: 'Voice unavailable' }, questionVoiceFallback: { en: 'Local voice' },
      questionVoicePreparing: { en: 'Preparing voice' }, selectLearningVoice: () => undefined,
      languages: { en: { speechLocale: 'en-US' } },
    });
    for (const key of ['restoring', 'sessionState', 'language', 'mode', 'level', 'topic', 'questionAudioState', 'questionVoiceNotice']) {
      c.env['set' + key[0].toUpperCase() + key.slice(1)] = (value: unknown) => { c.state[key] = value; };
    }
    c.env.cancelQuestionPlayback = handler('cancelQuestionPlayback', c.env);
    c.env.isQuestionPlaybackCurrent = handler('isQuestionPlaybackCurrent', c.env);
    return c;
  }
  it('explains an empty interrupted transcript and retains the notice after cloud autoplay', async () => {
    const c = restoredDraft();
    vi.stubGlobal('window', {});
    vi.stubGlobal('Audio', class { play = vi.fn().mockResolvedValue(undefined); });
    await handler('openSession', c.env)(getSessions()[0]);
    expect(c.state.notice).toBe(c.env.recoveryText.empty);
    expect(c.state.transcript).toBe(''); expect(c.ref.current.draft?.chunks).toEqual([{ status: 'uncertain' }]);
    await handler('speakQuestion', c.env)(c.ref.current, true);
    expect(c.state.notice).toBe(c.env.recoveryText.empty);
    expect(c.env.fetchJsonWithTimeout).not.toHaveBeenCalled();
    c.env.playingQuestionAudio.current.onended();
  });
  it('retains saved partial text and the recovery notice during local question playback', async () => {
    const c = restoredDraft('First saved chunk');
    const speech = { getVoices: () => [], cancel: vi.fn(), resume: vi.fn(), speak: vi.fn() };
    vi.stubGlobal('window', { speechSynthesis: speech }); vi.stubGlobal('speechSynthesis', speech);
    vi.stubGlobal('SpeechSynthesisUtterance', class {});
    await handler('openSession', c.env)(getSessions()[0]);
    await handler('speakQuestionLocally', c.env)(c.ref.current);
    expect(c.state.notice).toBe(c.env.recoveryText.partial);
    expect(c.state.transcript).toBe('First saved chunk');
    expect(getSessions()[0].draft?.transcript).toBe('First saved chunk');
    expect(c.env.fetchJsonWithTimeout).not.toHaveBeenCalled();
    expect(speech.speak).toHaveBeenCalledOnce();
  });
  it('does not claim the original is retained when verification fails', async () => {
    const c = restoredDraft(); c.env.getVerifiedAudio.mockRejectedValue(new Error('Corrupt'));
    await handler('openSession', c.env)(getSessions()[0]);
    expect(c.state.audioSaveFailed).toBe(true);
    expect(c.state.notice).toBe(c.env.recoveryText.interrupted);
    expect(c.env.getPlaybackAudio).not.toHaveBeenCalled();
  });
});


describe('received transcription after storage failure', () => {
  function transcribing() {
    const c = context();
    c.ref.current.draft = { ...c.ref.current.draft!, audioId: 'raw', audioStatus: 'verified' };
    c.env.persistSession(c.ref.current);
    Object.assign(c.env, {
      transcribeDraft, RequestNotSentError,
      recordedAudioToWavChunks: vi.fn().mockResolvedValue([new File(['first'], 'first.wav'), new File(['second'], 'second.wav')]),
      speechRequestCount: { current: 0 }, speechErrors: { en: { transcriptionFailed: 'Transcription failed' } }, recoveryText: { interrupted: 'Keep editing' },
    });
    return c;
  }
  it('keeps returned text in the editor and exportable draft, then stops before the next chunk', async () => {
    const c = transcribing();
    c.env.fetchJsonWithTimeout.mockImplementation(async () => {
      storage.setItem.mockImplementation(() => { throw new Error('Storage full'); });
      return { response: { ok: true, status: 200 }, data: { text: 'Received first chunk' } };
    });
    await handler('analyzeAudio', c.env)(new Blob(['raw']), 90, 'Older browser fallback');
    expect(c.env.fetchJsonWithTimeout).toHaveBeenCalledOnce();
    expect(c.state.transcript).toBe('Received first chunk'); expect(c.state.notice).toBe('Save failed');
    expect(c.ref.current.draft).toMatchObject({ transcript: 'Received first chunk', chunks: [{ status: 'succeeded', text: 'Received first chunk' }] });
    expect(c.state.sessionSaveFailed).toBe(true);
    expect(c.state.busy).toBe(false);
    expect(getSessions()[0].draft).toMatchObject({ transcript: '', chunks: [{ status: 'running' }] });
    storage.setItem.mockImplementation((key, value) => values.set(key, value));
    c.env.persistSession(c.ref.current);
    expect(getSessions()[0].draft?.transcript).toBe('Received first chunk');
  });
  it('preserves manual corrections when a received result cannot be saved', async () => {
    const c = transcribing(); c.ref.current.draft!.transcript = 'My correction'; c.ref.current.draft!.transcriptEdited = true;
    c.state.transcript = 'My correction'; c.env.persistSession(c.ref.current);
    c.env.fetchJsonWithTimeout.mockImplementation(async () => {
      storage.setItem.mockImplementation(() => { throw new Error('Storage full'); });
      return { response: { ok: true, status: 200 }, data: { text: 'Provider words' } };
    });
    await handler('analyzeAudio', c.env)(new Blob(['raw']), 90);
    expect(c.state.transcript).toBe('My correction'); expect(c.ref.current.draft?.transcript).toBe('My correction');
    expect(c.ref.current.draft?.chunks[0]).toEqual({ status: 'succeeded', text: 'Provider words' });
    expect(c.env.fetchJsonWithTimeout).toHaveBeenCalledOnce(); expect(c.state.sessionSaveFailed).toBe(true);
  });
  it('still refuses a provider request when its initial durable claim fails', async () => {
    const c = transcribing(); storage.setItem.mockImplementation(() => { throw new Error('Storage full'); });
    await handler('analyzeAudio', c.env)(new Blob(['raw']), 90);
    expect(c.env.fetchJsonWithTimeout).not.toHaveBeenCalled();
    expect(c.ref.current.draft?.chunks).toEqual([]); expect(c.state.sessionSaveFailed).toBe(true);
  });
});

describe('question audio lifecycle', () => {
  function playback() {
    const c = context();
    let resolve!: (blob: Blob) => void; let reject!: (error: Error) => void;
    const pending = new Promise<Blob>((yes, no) => { resolve = yes; reject = no; });
    const play = vi.fn().mockResolvedValue(undefined); const pause = vi.fn(); const local = vi.fn();
    const speech = { cancel: vi.fn(), resume: vi.fn(), speak: vi.fn(), getVoices: () => [] };
    vi.stubGlobal('window', { speechSynthesis: speech, history: { pushState: vi.fn() } });
    vi.stubGlobal('speechSynthesis', speech);
    vi.stubGlobal('navigator', { userAgent: 'Test browser' });
    vi.stubGlobal('MediaRecorder', class { static isTypeSupported() { return true; } });
    vi.stubGlobal('Audio', class { play = play; pause = pause; });
    Object.assign(c.env, {
      recordingActive: { current: false }, recording: false, page: 'speaking', pageRef: { current: 'speaking' }, questionPlaybackId: { current: 0 },
      questionAudioKey: (s: { text: string }) => s.text, questionAudioRequest: { current: { key: c.ref.current.question, promise: pending } },
      playingQuestionAudio: { current: null }, playingQuestionAudioUrl: { current: '' },
      setQuestionAudioState: vi.fn(), setQuestionVoiceNotice: vi.fn(), setPage: vi.fn(),
      questionVoiceUnavailable: { en: 'Unavailable' }, questionVoiceFallback: { en: 'Local' }, questionVoicePreparing: { en: 'Preparing' },
      speakQuestionLocally: local, speechRequestCount: { current: 0 },
      AudioRecorder: class { start() { return Promise.reject(new Error('Permission cancelled')); } dispose() {} },
    });
    c.env.cancelQuestionPlayback = handler('cancelQuestionPlayback', c.env);
    c.env.isQuestionPlaybackCurrent = handler('isQuestionPlaybackCurrent', c.env);
    const speak = handler('speakQuestion', c.env);
    return { ...c, resolve, reject, play, pause, local, speak };
  }
  it.each(['success', 'failure'] as const)('does not play or fall back after recording begins and pending TTS resolves with %s', async result => {
    const c = playback(); const pending = c.speak(c.ref.current, true);
    await handler('startRecordingNow', c.env)();
    if (result === 'success') c.resolve(new Blob(['voice'])); else c.reject(new Error('TTS failed'));
    await pending;
    expect(c.play).not.toHaveBeenCalled(); expect(c.local).not.toHaveBeenCalled();
  });
  it.each(['success', 'failure'] as const)('does not play or fall back after leaving the practice, pending TTS %s', async result => {
    const c = playback(); const pending = c.speak(c.ref.current, true);
    await handler('navigate', c.env)('home');
    if (result === 'success') c.resolve(new Blob(['voice'])); else c.reject(new Error('TTS failed'));
    await pending;
    expect(c.play).not.toHaveBeenCalled(); expect(c.local).not.toHaveBeenCalled();
  });
  it('ignores an old question response even before the changed-question effect runs', async () => {
    const c = playback(); const pending = c.speak(c.ref.current, true);
    c.ref.current = { ...c.ref.current, question: 'Different question' };
    c.resolve(new Blob(['old question'])); await pending;
    expect(c.play).not.toHaveBeenCalled(); expect(c.local).not.toHaveBeenCalled();
  });
  it('only plays the most recent request when two play actions share pending audio', async () => {
    const c = playback(); const first = c.speak(c.ref.current, true); const second = c.speak(c.ref.current, false);
    c.resolve(new Blob(['voice'])); await Promise.all([first, second]);
    expect(c.play).toHaveBeenCalledOnce(); expect(c.local).not.toHaveBeenCalled();
    c.env.playingQuestionAudio.current.onended();
  });
  it('does not fall back when playback rejection arrives after navigation', async () => {
    const c = playback(); let rejectPlay!: (reason: Error) => void;
    c.play.mockImplementation(() => new Promise((_, reject) => { rejectPlay = reject; }));
    const pending = c.speak(c.ref.current, true); c.resolve(new Blob(['voice'])); await Promise.resolve();
    expect(c.play).toHaveBeenCalledOnce();
    await handler('navigate', c.env)('home'); rejectPlay(new Error('Playback cancelled')); await pending;
    expect(c.local).not.toHaveBeenCalled(); expect(c.pause).toHaveBeenCalledOnce();
  });
  it('keeps normal local fallback when the active question audio fails', async () => {
    const c = playback(); const pending = c.speak(c.ref.current, false);
    c.reject(new Error('TTS unavailable')); await pending;
    expect(c.local).toHaveBeenCalledWith(c.ref.current, c.env.questionPlaybackId.current);
  });
  it('does not send a late TTS preparation after auth headers arrive for a cancelled request', async () => {
    const c = playback(); c.env.questionAudioRequest.current = null;
    let finishHeaders!: (headers: object) => void;
    c.env.getSupabaseAuthHeaders.mockImplementation(() => new Promise(resolve => { finishHeaders = resolve; }));
    c.env.prepareQuestionAudio = vi.fn().mockResolvedValue(new Blob(['voice']));
    const pending = handler('speakQuestion', c.env)(c.ref.current, true);
    await handler('navigate', c.env)('home'); finishHeaders({}); await pending;
    expect(c.env.prepareQuestionAudio).not.toHaveBeenCalled(); expect(c.play).not.toHaveBeenCalled(); expect(c.local).not.toHaveBeenCalled();
  });
});
