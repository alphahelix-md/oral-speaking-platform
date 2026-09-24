import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ access: vi.fn(), operation: vi.fn(), run: vi.fn(), transcribe: vi.fn(), evaluate: vi.fn() }));
vi.mock('@/lib/ai/guard', () => ({ guardBetaAccess: mocks.access, guardErrorResponse: () => null }));
vi.mock('@/lib/ai/budget', async original => ({ ...await original<typeof import('@/lib/ai/budget')>(), createBudgetOperation: mocks.operation }));
vi.mock('@/lib/speech/provider-registry', () => ({ getSpeechProvider: () => ({ transcribe: mocks.transcribe }) }));
vi.mock('@/lib/speech/text-evaluator', () => ({ transcriptTextEvaluator: { evaluate: mocks.evaluate } }));
vi.mock('@/lib/runtime/region', async original => ({ ...await original<typeof import('@/lib/runtime/region')>(), resolveTextProvider: () => 'deepseek', resolveSpeechProvider: () => 'glm' }));
vi.mock('@/lib/ai/server', async original => ({ ...await original<typeof import('@/lib/ai/server')>(), aiAvailable: true }));
import { BudgetError } from '@/lib/ai/budget';
import { POST as transcribe } from './transcribe/route';
import { POST as evaluate } from './ai/route';
beforeEach(() => {
  vi.clearAllMocks(); mocks.access.mockResolvedValue('account');
  mocks.run.mockImplementation(async (_provider, _model, invoke) => invoke());
  mocks.operation.mockReturnValue({ run: mocks.run });
  vi.spyOn(console, 'info').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function wave() {
  const bytes = new ArrayBuffer(32044); const view = new DataView(bytes);
  const tag = (at: number, value: string) => [...value].forEach((char, i) => view.setUint8(at + i, char.charCodeAt(0)));
  tag(0, 'RIFF'); view.setUint32(4, 32036, true); tag(8, 'WAVE'); tag(12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  tag(36, 'data'); view.setUint32(40, 32000, true); return new File([bytes], 'fixture.wav', { type: 'audio/wav' });
}
function speechRequest(audio = wave(), index = '0') {
  const form = new FormData(); form.set('audio', audio); form.set('language', 'en');
  return new Request('http://localhost/api/transcribe', { method: 'POST', headers: { 'x-speech-request-id': 'sp_stable_recording_v1', 'x-speech-chunk-index': index, 'x-oral-session-id': 'session' }, body: form });
}
function evaluationRequest() {
  return new Request('http://localhost/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-oral-session-id': 'session' }, body: JSON.stringify({ action: 'evaluate', language: 'en', mode: 'daily', topic: 'Food', level: 'Beginner', turns: [{ id: 'turn', question: 'Question', transcript: 'Answer', createdAt: '2026-09-24', attempt: 1, durationSeconds: 1 }] }) });
}
describe('route budget and free-fallback responses', () => {
  it('rejects invalid audio before creating a paid operation', async () => {
    const response = await transcribe(speechRequest(new File(['invalid'], 'a.wav')));
    expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ requestStarted: false });
    expect(mocks.operation).not.toHaveBeenCalled(); expect(mocks.transcribe).not.toHaveBeenCalled();
  });
  it('rejects excess chunks before contacting a provider', async () => {
    const response = await transcribe(speechRequest(wave(), '12'));
    expect(response.status).toBe(400); expect(mocks.transcribe).not.toHaveBeenCalled();
  });
  it('passes actual PCM duration and stable session/chunk IDs into the budget boundary', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ text: 'Answer' })); vi.stubGlobal('fetch', fetcher);
    mocks.transcribe.mockImplementation(async (_audio, language, _id, requestFetch) => { await requestFetch('https://fixture.invalid'); return { text: 'Answer', language, provider: 'glm' }; });
    const response = await transcribe(speechRequest(wave(), '1'));
    expect(response.status).toBe(200);
    expect(mocks.operation).toHaveBeenCalledWith(expect.any(Request), 'account', { capability: 'transcription', sessionId: 'session', operationId: 'sp_stable_recording_v1:1', audioMilliseconds: 1000 });
    expect(mocks.transcribe.mock.calls[0][2]).toBe('sp_stable_recording_v1_1');
    expect(mocks.run).toHaveBeenCalledOnce(); expect(fetcher).toHaveBeenCalledOnce();
  });
  it('keeps duplicate transcription requests out of the provider network', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    mocks.run.mockRejectedValue(new BudgetError('REQUEST_ALREADY_STARTED', true));
    mocks.transcribe.mockImplementation(async (_audio, _language, _id, requestFetch) => requestFetch('https://fixture.invalid'));
    const response = await transcribe(speechRequest());
    expect(response.status).toBe(409); expect(await response.json()).toMatchObject({ requestStarted: true }); expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects empty-evidence evaluation before reserving or calling a model', async () => {
    const request = evaluationRequest(); const body = await request.json(); body.turns[0].transcript = '   ';
    const response = await evaluate(new Request(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(body) }));
    expect(response.status).toBe(400); expect(mocks.operation).not.toHaveBeenCalled(); expect(mocks.evaluate).not.toHaveBeenCalled();
  });
  it('counts each evaluation retry through the budget boundary', async () => {
    mocks.evaluate.mockRejectedValueOnce(new TypeError('Network failure')).mockResolvedValueOnce({ model: 'ai', scores: [] });
    const response = await evaluate(evaluationRequest());
    expect(response.status).toBe(200); expect(mocks.run).toHaveBeenCalledTimes(2); expect(mocks.evaluate).toHaveBeenCalledTimes(2);
  });
  it('stops retries when the first provider attempt consumed the remaining budget', async () => {
    mocks.run.mockImplementationOnce(async (_provider, _model, invoke) => invoke()).mockRejectedValueOnce(new BudgetError('BUDGET_LIMIT_REACHED', true));
    mocks.evaluate.mockRejectedValue(new TypeError('Network failure'));
    const response = await evaluate(evaluationRequest());
    expect(response.status).toBe(429); expect(await response.json()).toEqual({ error: 'BUDGET_LIMIT_REACHED', requestStarted: true });
    expect(mocks.evaluate).toHaveBeenCalledOnce();
  });
  it('fails closed on missing budget settings without invoking evaluation', async () => {
    mocks.operation.mockImplementation(() => { throw new BudgetError('BUDGET_NOT_CONFIGURED'); });
    const response = await evaluate(evaluationRequest());
    expect(response.status).toBe(503); expect(mocks.evaluate).not.toHaveBeenCalled();
  });
});
