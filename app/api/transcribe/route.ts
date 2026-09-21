import { NextResponse } from 'next/server';
import { guardBetaRequest, guardErrorResponse } from '@/lib/ai/guard';
import { getSpeechProvider } from '@/lib/speech/provider-registry';
import type { LanguageId } from '@/types/speaking';
import { resolveSpeechProvider } from '@/lib/runtime/region';
export async function POST(request: Request) {
  const requestIdHeader = request.headers.get('x-speech-request-id') || '';
  const requestId = /^sp_[a-zA-Z0-9_-]{6,64}$/.test(requestIdHeader) ? requestIdHeader : `sp_${crypto.randomUUID()}`;
  const startedAt = Date.now();
  console.info('[TRANSCRIBE] request received', { requestId });
  try {
    await guardBetaRequest(request);
    const form = await request.formData(); const audio = form.get('audio'); const language = form.get('language');
    const providerId = resolveSpeechProvider();
    console.info('[TRANSCRIBE] upload', { requestId, chunkIndex: request.headers.get('x-speech-chunk-index') || '0', hasFile: audio instanceof File, fileName: audio instanceof File ? audio.name : null, fileSize: audio instanceof File ? audio.size : null, mimeType: audio instanceof File ? audio.type : null, language: String(language), provider: providerId, model: providerId === 'glm' ? process.env.GLM_TRANSCRIBE_MODEL || 'glm-asr-2512' : process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe' });
    if (!(audio instanceof File) || audio.size === 0 || audio.size > 20_000_000 || !['en', 'ja'].includes(String(language))) return NextResponse.json({ error: 'INVALID_AUDIO_OR_LANGUAGE', requestId }, { status: 400, headers: { 'x-speech-request-id': requestId } });
    const result = await getSpeechProvider().transcribe(audio, language as LanguageId, requestId);
    console.info('[TRANSCRIBE] success', { requestId, provider: result.provider, textLength: result.text.length, durationMs: Date.now() - startedAt });
    return NextResponse.json({ ...result, transcript: result.text, requestId, received: { fileSize: audio.size, mimeType: audio.type } }, { headers: { 'x-speech-request-id': requestId } });
  } catch (error) {
    const guard = guardErrorResponse(error);
    const code = guard?.error || (error instanceof Error ? error.message : 'TRANSCRIPTION_FAILED');
    const status = guard?.status || (code === 'AI_NOT_CONFIGURED' || code === 'GLM_NOT_CONFIGURED' ? 503 : 502);
    console.error('[TRANSCRIPTION_ERROR]', { requestId, code, status, causeCode: error instanceof Error && error.cause && typeof error.cause === 'object' && 'code' in error.cause ? String(error.cause.code) : undefined, durationMs: Date.now() - startedAt });
    return NextResponse.json({ error: code, requestId }, { status, headers: { 'x-speech-request-id': requestId } });
  }
}
