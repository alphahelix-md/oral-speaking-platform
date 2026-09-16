import { describe, expect, it } from 'vitest';
import { createSession, speakingReducer } from './engine';

describe('shared speaking engine', () => {
  for (const language of ['en', 'ja'] as const) {
    it(`records and retries ${language} without language rules`, () => {
      const start = createSession(language, 'daily', 'Beginner', 'Food', 'Question');
      const answered = speakingReducer(start, { type: 'ANSWER', transcript: 'Answer', durationSeconds: 4 });
      expect(answered.turns[0].attempt).toBe(1);
      const retried = speakingReducer(answered, { type: 'RETRY', turnId: answered.turns[0].id });
      expect(speakingReducer(retried, { type: 'ANSWER', transcript: 'Better', durationSeconds: 6 }).turns[1].attempt).toBe(2);
    });
  }
});
