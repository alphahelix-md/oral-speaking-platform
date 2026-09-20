import type { LanguageId } from '@/types/speaking';

export type VoiceCandidate = Pick<SpeechSynthesisVoice, 'name' | 'lang' | 'default' | 'localService'>;

function normalizedLocale(value: string): string {
  return value.toLowerCase().replace('_', '-');
}

export function selectLearningVoice<T extends VoiceCandidate>(voices: T[], language: LanguageId, preferredLocale: string): T | undefined {
  const prefix = language === 'ja' ? 'ja' : 'en';
  const preferred = normalizedLocale(preferredLocale);
  return voices
    .filter(voice => normalizedLocale(voice.lang).split('-')[0] === prefix)
    .map(voice => {
      const locale = normalizedLocale(voice.lang);
      const name = voice.name.toLowerCase();
      let score = locale === preferred ? 100 : 60;
      if (/google|microsoft|apple|natural|premium|enhanced/.test(name)) score += 20;
      if (voice.localService) score += 4;
      if (voice.default) score += 1;
      return { voice, score };
    })
    .sort((left, right) => right.score - left.score)[0]?.voice;
}
