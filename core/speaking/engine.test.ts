import { describe, expect, it } from 'vitest';
import { createSession, speakingReducer } from './engine';

describe('shared speaking engine', () => {
  it('retains IELTS part on a retried answer', () => {
    const start = createSession('en', 'ielts', 'Intermediate', 'Full mock · Parts 1–3', 'Describe a place');
    const answered = speakingReducer(start, { type: 'ANSWER', transcript: 'First answer', durationSeconds: 20, examPart: 2 });
    const retried = speakingReducer(answered, { type: 'RETRY', turnId: answered.turns[0].id });
    const updated = speakingReducer(retried, { type: 'ANSWER', transcript: 'Second answer', durationSeconds: 25, examPart: answered.turns[0].examPart });
    expect(updated.turns.map(turn => [turn.examPart, turn.attempt])).toEqual([[2, 1], [2, 2]]);
  });

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
