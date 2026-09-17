import type { LanguageId } from '@/types/speaking';
import type { SpeechProvider } from '../speech-provider';
import type { TranscriptResult } from '../types';

// GLM-ASR-2512 accepts WAV/MP3, at most 25 MB and 30 seconds per request.
export class GlmSpeechProvider implements SpeechProvider {
  readonly id = 'glm';

  async transcribe(audio: File, language: LanguageId): Promise<TranscriptResult> {
    const key = process.env.GLM_API_KEY;
    if (!key) throw new Error('GLM_NOT_CONFIGURED');
    if (!/audio\/(wav|wave|x-wav|mpeg|mp3)/.test(audio.type) && !/\.(wav|mp3)$/i.test(audio.name)) throw new Error('GLM_AUDIO_FORMAT_UNSUPPORTED');
    const form = new FormData();
    form.append('file', audio, audio.name);
    form.append('model', process.env.GLM_TRANSCRIBE_MODEL || 'glm-asr-2512');
    form.append('stream', 'false');
    const response = await fetch('https://open.bigmodel.cn/api/paas/v4/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      cache: 'no-store',
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error('GLM_KEY_INVALID');
      if (response.status === 402 || response.status === 429) throw new Error('GLM_QUOTA_OR_LIMIT');
      throw new Error(`GLM_TRANSCRIPTION_ERROR_${response.status}`);
    }
    const data: { text?: string } = await response.json();
    return { text: String(data.text || '').trim(), language, provider: this.id };
  }
}
