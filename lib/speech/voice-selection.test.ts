import { describe, expect, it } from 'vitest';
import { selectLearningVoice, type VoiceCandidate } from './voice-selection';

const voice = (name: string, lang: string, localService = true, isDefault = false): VoiceCandidate => ({ name, lang, localService, default: isDefault });

describe('learning voice selection', () => {
  it('never selects a voice from the wrong language', () => {
    expect(selectLearningVoice([voice('Chinese', 'zh-CN')], 'ja', 'ja-JP')).toBeUndefined();
  });

  it('prefers the requested locale and a natural engine', () => {
    const selected = selectLearningVoice([
      voice('Basic US', 'en-US'),
      voice('Google UK English', 'en-GB', false),
      voice('Japanese', 'ja-JP'),
    ], 'en', 'en-GB');
    expect(selected?.name).toBe('Google UK English');
  });
});
