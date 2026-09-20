import type { LanguageId } from '@/types/speaking';

const HAN = /[\u3400-\u4dbf\u4e00-\u9fff]/u;
const KANA = /[\u3040-\u30ff\u31f0-\u31ff]/u;
const LATIN = /[A-Za-z]/;

export function transcriptionLanguagePrompt(language: LanguageId, strict = false): string {
  if (language === 'ja') {
    return strict
      ? '音声は日本語です。翻訳せず、日本語の漢字・ひらがな・カタカナだけで忠実に文字起こししてください。中国語や英語として推測しないでください。'
      : '日本語音声の文字起こしです。翻訳せず、助詞や語尾を含む自然な日本語表記で出力してください。';
  }
  return strict
    ? 'The audio is English. Transcribe verbatim in English Latin script only. Never translate it or output Chinese or Japanese characters.'
    : 'English speech transcription. Keep the spoken English verbatim in Latin script; do not translate it.';
}

export function matchesTranscriptionLanguage(text: string, language: LanguageId): boolean {
  const value = text.trim();
  if (!value) return false;
  if (language === 'en') return LATIN.test(value) && !HAN.test(value) && !KANA.test(value);
  if (KANA.test(value)) return true;
  if (HAN.test(value) && !LATIN.test(value)) {
    const hanCount = Array.from(value).filter(character => HAN.test(character)).length;
    return hanCount <= 4;
  }
  return false;
}
