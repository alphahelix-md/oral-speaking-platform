import { NextResponse } from 'next/server';
import { guardBetaAccess, guardErrorResponse } from '@/lib/ai/guard';
import { budgetErrorResponse, createBudgetOperation, wavDurationMilliseconds } from '@/lib/ai/budget';
import { getSpeechProvider } from '@/lib/speech/provider-registry';
import type { LanguageId } from '@/types/speaking';
import { resolveSpeechProvider } from '@/lib/runtime/region';
export async function POST(request: Request) {
  const requestIdHeader = request.headers.get('x-speech-request-id') || '';
  const requestId = /^sp_[a-zA-Z0-9_-]{6,64}$/.test(requestIdHeader) ? requestIdHeader : `sp_${crypto.randomUUID()}`;
  const startedAt = Date.now();
  console.info('[TRANSCRIBE] request received', { requestId });
  try {
    const accountId = await guardBetaAccess(request);
    const form = await request.formData(); const audio = form.get('audio'); const language = form.get('language');
    const providerId = resolveSpeechProvider();
    console.info('[TRANSCRIBE] upload', { requestId, chunkIndex: request.headers.get('x-speech-chunk-index') || '0', hasFile: audio instanceof File, fileName: audio instanceof File ? audio.name : null, fileSize: audio instanceof File ? audio.size : null, mimeType: audio instanceof File ? audio.type : null, language: String(language), provider: providerId, model: providerId === 'glm' ? process.env.GLM_TRANSCRIBE_MODEL || 'glm-asr-2512' : process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe' });
    if (!(audio instanceof File) || audio.size === 0 || audio.size > 20_000_000 || !['en', 'ja'].includes(String(language))) return NextResponse.json({ error: 'INVALID_AUDIO_OR_LANGUAGE', requestId }, { status: 400, headers: { 'x-speech-request-id': requestId } });
    const rawChunk = request.headers.get('x-speech-chunk-index') || '0';
    if (!/^(?:[0-9]|1[01])$/.test(rawChunk)) return NextResponse.json({ error: 'INVALID_BUDGET_INPUT', requestStarted: false, requestId }, { status: 400 });
    const milliseconds = await wavDurationMilliseconds(audio);
    const operation = createBudgetOperation(request, accountId, {
      capability: 'transcription', sessionId: request.headers.get('x-oral-session-id') || requestId,
      operationId: `${requestId}:${rawChunk}`, audioMilliseconds: milliseconds,
    });
    const model = providerId === 'glm' ? process.env.GLM_TRANSCRIBE_MODEL || 'glm-asr-2512' : process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe';
    const budgetFetch: typeof fetch = (input, init) => operation.run(providerId, model, () => fetch(input, init));
    const result = await getSpeechProvider().transcribe(audio, language as LanguageId, `${requestId}_${rawChunk}`, budgetFetch);
    console.info('[TRANSCRIBE] success', { requestId, provider: result.provider, textLength: result.text.length, durationMs: Date.now() - startedAt });
    return NextResponse.json({ ...result, transcript: result.text, requestId, received: { fileSize: audio.size, mimeType: audio.type } }, { headers: { 'x-speech-request-id': requestId } });
  } catch (error) {
    const budget = budgetErrorResponse(error);
    if (budget) return NextResponse.json({ error: budget.error, requestStarted: budget.requestStarted, requestId }, { status: budget.status, headers: { 'x-speech-request-id': requestId } });
    const guard = guardErrorResponse(error);
    const code = guard?.error || (error instanceof Error ? error.message : 'TRANSCRIPTION_FAILED');
    const status = guard?.status || (code === 'AI_NOT_CONFIGURED' || code === 'GLM_NOT_CONFIGURED' ? 503 : 502);
    console.error('[TRANSCRIPTION_ERROR]', { requestId, code, status, causeCode: error instanceof Error && error.cause && typeof error.cause === 'object' && 'code' in error.cause ? String(error.cause.code) : undefined, durationMs: Date.now() - startedAt });
    return NextResponse.json({ error: code, requestId }, { status, headers: { 'x-speech-request-id': requestId } });
  }
}
