import { NextResponse } from 'next/server';
import { guardBetaRequest, guardErrorResponse } from '@/lib/ai/guard';
export async function POST(request: Request) {
  try {
    await guardBetaRequest(request);
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'AI_NOT_CONFIGURED' }, { status: 503 });
    const form = await request.formData(); const audio = form.get('audio'); const language = form.get('language');
    if (!(audio instanceof File) || audio.size === 0 || audio.size > 20_000_000 || !['en', 'ja'].includes(String(language))) return NextResponse.json({ error: 'Invalid audio or language' }, { status: 400 });
    const upload = new FormData(); upload.append('file', audio, audio.name || 'answer.webm'); upload.append('model', process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe'); upload.append('language', String(language));
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: upload, cache: 'no-store' });
    if (!response.ok) return NextResponse.json({ error: `Transcription service error ${response.status}` }, { status: 502 });
    const data = await response.json(); return NextResponse.json({ transcript: String(data.text || '') });
  } catch (error) { const guard = guardErrorResponse(error); if (guard) return NextResponse.json({ error: guard.error }, { status: guard.status }); return NextResponse.json({ error: 'Transcription failed' }, { status: 502 }); }
}
