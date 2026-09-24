import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSession, speakingReducer } from '@/core/speaking/engine';
import { commitDraft, evaluationKey } from '@/core/session/recovery';
import { getSessions, saveSession } from '@/core/session/storage';
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
  values = new Map();
  storage = { getItem: vi.fn((key: string) => values.get(key) || null), setItem: vi.fn((key: string, value: string) => values.set(key, value)) };
  vi.stubGlobal('localStorage', storage);
});
afterEach(() => vi.unstubAllGlobals());
function context(initial?: Session) {
  const session = initial || createSession('en', 'daily', 'Intermediate', 'Food', 'Question');
  const ref = { current: session };
  const state: Record<string, any> = { transcript: session.draft?.transcript || '', busy: false, audio: null, sessionSaveFailed: false };
  const env: Record<string, any> = {
    session, sessionRef: ref, busy: false, restoring: false,
    submitLock: { current: false }, evaluationLock: { current: false }, analysisLock: { current: false }, stopLock: { current: false },
    recording: true, recordingActive: { current: true }, recordingInterruptedCopy: { en: 'Recording interrupted' }, recorder: { current: null }, browserTranscriber: { current: null }, timer: { current: null },
    originalAudio: { current: null }, language: 'en', mode: 'daily', uiLanguage: 'en', accessCode: '', authUser: null, trainingConsent: 'unset',
    speechRequestId: { current: '' }, sessionTurnLimit: 5, voice: { analyzing: 'analyzing', empty: 'empty', short: 'short', evaluating: 'evaluating' },
    extra: { saveFailed: 'Save failed', recordFailed: 'Record failed' },
    demoQuestion: vi.fn().mockReturnValue('Next question'), speakingReducer, commitDraft, evaluationKey,
    getVerifiedAudio: vi.fn().mockResolvedValue(new Blob(['raw'])), saveOriginalAudio: vi.fn().mockResolvedValue(undefined), saveAudio: vi.fn().mockResolvedValue(undefined),
    updateAudioMetadata: vi.fn().mockResolvedValue(undefined), normalizeRecordedAudio: vi.fn().mockResolvedValue(new Blob(['derived'])),
    analyzeAudio: vi.fn().mockResolvedValue(undefined), matchesTranscriptionLanguage: () => true,
    finishSession: vi.fn().mockResolvedValue(undefined), navigate: vi.fn(),
    getSupabaseAuthHeaders: vi.fn().mockResolvedValue({}), fetchWithTimeout: vi.fn(),
    unavailableEvaluation, unavailableReviewCopy: { en: { notice: 'No score' } },
  };
  for (const key of ['busy','notice','sessionSaveFailed','audioSaveFailed','audio','audioMetrics','transcriptResult','pendingAudioId','transcript','seconds','retryExamPart','quickFeedbackTurnId','recording','paused','processingStage','speechDiagnostic']) {
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
    c.env.fetchWithTimeout.mockImplementation(async () => {
      expect(getSessions()[0].evaluationRun?.status).toBe('running');
      throw new Error('Network lost');
    });
    await handler('finishSession', c.env)(); expect(c.env.fetchWithTimeout).toHaveBeenCalledOnce();
    const restored = context(getSessions()[0]);
    await handler('finishSession', restored.env)(); expect(restored.env.fetchWithTimeout).not.toHaveBeenCalled();
    expect(restored.env.navigate).toHaveBeenCalledWith('result');
  });
  it('finishes an interrupted evaluation without another request', async () => {
    const c = answered(); c.env.persistSession({ ...c.ref.current, evaluationRun: { key: evaluationKey(c.ref.current), status: 'running' } }); c.env.session = c.ref.current;
    await handler('finishSession', c.env)();
    expect(c.env.fetchWithTimeout).not.toHaveBeenCalled(); expect(getSessions()[0].evaluation?.model).toBe('unavailable');
  });
  it('never evaluates while unsubmitted text remains', async () => {
    const c = context(); c.ref.current.draft!.transcript = 'Pending answer';
    await handler('finishSession', c.env)();
    expect(c.env.fetchWithTimeout).not.toHaveBeenCalled(); expect(c.env.navigate).not.toHaveBeenCalled();
    expect(c.ref.current.draft?.transcript).toBe('Pending answer');
  });
  it('does not call evaluation when the durable claim cannot be stored', async () => {
    const c = answered(); storage.setItem.mockImplementation(() => { throw new Error('Full'); });
    await handler('finishSession', c.env)();
    expect(c.env.fetchWithTimeout).not.toHaveBeenCalled(); expect(c.state.sessionSaveFailed).toBe(true);
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
