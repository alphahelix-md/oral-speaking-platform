import type { LanguageId } from '@/types/speaking';
import type { SpeechProvider } from '../speech-provider';
import type { TranscriptResult } from '../types';
export class BasicSpeechProvider implements SpeechProvider {
  readonly id = 'basic';
  async transcribe(audio: File, language: LanguageId, _requestId?: string, requestFetch: typeof fetch = fetch): Promise<TranscriptResult> {
    if (!process.env.OPENAI_API_KEY) throw new Error('AI_NOT_CONFIGURED');
    const upload = new FormData();
    upload.append('file', audio, audio.name || 'answer.webm');
    upload.append('model', process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe');
    upload.append('language', language);
    const response = await requestFetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: upload, cache: 'no-store', signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`Transcription service error ${response.status}`);
    const data: { text?: string; duration?: number; segments?: TranscriptResult['segments']; confidence?: number } = await response.json();
    return { text: String(data.text || '').trim(), language, provider: this.id, ...(typeof data.duration === 'number' ? { duration: data.duration } : {}), ...(Array.isArray(data.segments) ? { segments: data.segments } : {}), ...(typeof data.confidence === 'number' ? { confidence: data.confidence } : {}) };
  }
}
