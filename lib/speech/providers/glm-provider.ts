import type { LanguageId } from '@/types/speaking';
import type { SpeechProvider } from '../speech-provider';
import type { TranscriptResult } from '../types';
import { matchesTranscriptionLanguage, transcriptionLanguagePrompt } from '../language-boundary';

// GLM-ASR-2512 accepts WAV/MP3, at most 25 MB and 30 seconds per request.
export class GlmSpeechProvider implements SpeechProvider {
  readonly id = 'glm';

  async transcribe(audio: File, language: LanguageId, requestId?: string): Promise<TranscriptResult> {
    const key = process.env.GLM_API_KEY;
    if (!key) throw new Error('GLM_NOT_CONFIGURED');
    if (!/audio\/(wav|wave|x-wav|mpeg|mp3)/.test(audio.type) && !/\.(wav|mp3)$/i.test(audio.name)) throw new Error('GLM_AUDIO_FORMAT_UNSUPPORTED');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const form = new FormData();
      form.append('file', audio, audio.name);
      form.append('model', process.env.GLM_TRANSCRIBE_MODEL || 'glm-asr-2512');
      form.append('stream', 'false');
      form.append('prompt', transcriptionLanguagePrompt(language, attempt > 0));
      if (requestId) form.append('request_id', `${requestId}-${attempt}`.slice(0, 64));
      console.info('[TRANSCRIBE_PROVIDER] request', { requestId, provider: this.id, model: process.env.GLM_TRANSCRIBE_MODEL || 'glm-asr-2512', language, attempt: attempt + 1, fileSize: audio.size, mimeType: audio.type });
      const response = await fetch('https://open.bigmodel.cn/api/paas/v4/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: form,
        cache: 'no-store',
      });
      if (!response.ok) {
        console.error('[TRANSCRIBE_PROVIDER] error', { requestId, provider: this.id, status: response.status, providerRequestId: response.headers.get('x-request-id') || undefined });
        if (response.status === 401 || response.status === 403) throw new Error('GLM_KEY_INVALID');
        if (response.status === 402 || response.status === 429) throw new Error('GLM_QUOTA_OR_LIMIT');
        throw new Error(`GLM_TRANSCRIPTION_ERROR_${response.status}`);
      }
      const data: { text?: string } = await response.json();
      const text = String(data.text || '').trim();
      const languageMatched = matchesTranscriptionLanguage(text, language);
      console.info('[TRANSCRIBE_PROVIDER] success', { requestId, provider: this.id, status: response.status, attempt: attempt + 1, textLength: text.length, languageMatched });
      if (languageMatched) return { text, language, provider: this.id };
      console.warn('[TRANSCRIBE_PROVIDER] language mismatch', { requestId, provider: this.id, language, attempt: attempt + 1 });
    }
    throw new Error('TRANSCRIPT_LANGUAGE_MISMATCH');
  }
}
