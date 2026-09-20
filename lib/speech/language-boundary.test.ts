import { describe, expect, it } from 'vitest';
import { matchesTranscriptionLanguage, transcriptionLanguagePrompt } from './language-boundary';

describe('transcription language boundary', () => {
  it('accepts English and rejects CJK output for English practice', () => {
    expect(matchesTranscriptionLanguage('I usually exercise on weekends.', 'en')).toBe(true);
    expect(matchesTranscriptionLanguage('我通常周末运动。', 'en')).toBe(false);
    expect(matchesTranscriptionLanguage('I usually 去运动。', 'en')).toBe(false);
  });

  it('accepts Japanese script and rejects English or long Chinese-only output', () => {
    expect(matchesTranscriptionLanguage('休みの日は公園へ行きます。', 'ja')).toBe(true);
    expect(matchesTranscriptionLanguage('カフェで本を読みます。', 'ja')).toBe(true);
    expect(matchesTranscriptionLanguage('I read at a cafe.', 'ja')).toBe(false);
    expect(matchesTranscriptionLanguage('我通常周末去公园运动', 'ja')).toBe(false);
    expect(matchesTranscriptionLanguage('東京', 'ja')).toBe(true);
  });

  it('builds explicit non-translation prompts', () => {
    expect(transcriptionLanguagePrompt('en', true)).toContain('English');
    expect(transcriptionLanguagePrompt('ja', true)).toContain('日本語');
  });
});
