import { NextResponse } from 'next/server';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { z } from 'zod';
import { guardBetaAccess, guardErrorResponse } from '@/lib/ai/guard';

export const runtime = 'nodejs';
export const maxDuration = 20;

const requestSchema = z.object({
  text: z.string().trim().min(1).max(600),
  language: z.enum(['en', 'ja']),
  mode: z.enum(['ielts', 'daily', 'scenario', 'topic', 'free-talk', 'toefl', 'interview', 'weakness']),
  level: z.string().max(60),
});

function escapeXml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function voiceFor(input: z.infer<typeof requestSchema>) {
  if (input.language === 'ja') return { name: 'ja-JP-NanamiNeural', rate: input.level === 'Beginner' ? '-12%' : '-7%' };
  if (input.mode === 'ielts') return { name: 'en-GB-SoniaNeural', rate: '-6%' };
  return { name: 'en-US-AriaNeural', rate: '-5%' };
}

async function synthesize(input: z.infer<typeof requestSchema>) {
  const tts = new MsEdgeTTS();
  const voice = voiceFor(input);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const work = (async () => {
      await tts.setMetadata(voice.name, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(escapeXml(input.text), { rate: voice.rate, pitch: '+0Hz', volume: '+0%' });
      const chunks: Buffer[] = [];
      for await (const chunk of audioStream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      const audio = Buffer.concat(chunks);
      if (!audio.length) throw new Error('TTS_EMPTY_AUDIO');
      return audio;
    })();
    const deadline = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error('TTS_TIMEOUT')), 15_000);
    });
    return await Promise.race([work, deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
    tts.close();
  }
}

export async function POST(request: Request) {
  try {
    await guardBetaAccess(request);
    const input = requestSchema.parse(await request.json());
    const audio = await synthesize(input);
    return new Response(new Uint8Array(audio), {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'private, max-age=604800',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    const guard = guardErrorResponse(error);
    if (guard) return NextResponse.json({ error: guard.error }, { status: guard.status });
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'INVALID_TTS_REQUEST' }, { status: 400 });
    console.error('[TTS_ERROR]', { code: error instanceof Error ? error.message : 'TTS_UNAVAILABLE' });
    return NextResponse.json({ error: 'TTS_UNAVAILABLE' }, { status: 502 });
  }
}
