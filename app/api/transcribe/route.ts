import { NextResponse } from 'next/server';
import { guardBetaRequest, guardErrorResponse } from '@/lib/ai/guard';
import { getSpeechProvider } from '@/lib/speech/provider-registry';
import type { LanguageId } from '@/types/speaking';
export async function POST(request: Request) {
  try {
    await guardBetaRequest(request);
    const form = await request.formData(); const audio = form.get('audio'); const language = form.get('language');
    if (!(audio instanceof File) || audio.size === 0 || audio.size > 20_000_000 || !['en', 'ja'].includes(String(language))) return NextResponse.json({ error: 'Invalid audio or language' }, { status: 400 });
    const result = await getSpeechProvider().transcribe(audio, language as LanguageId);
    return NextResponse.json({ ...result, transcript: result.text });
  } catch (error) { const guard = guardErrorResponse(error); if (guard) return NextResponse.json({ error: guard.error }, { status: guard.status }); if (error instanceof Error && error.message === 'AI_NOT_CONFIGURED') return NextResponse.json({ error: 'AI_NOT_CONFIGURED' }, { status: 503 }); return NextResponse.json({ error: error instanceof Error ? error.message : 'Transcription failed' }, { status: 502 }); }
}
