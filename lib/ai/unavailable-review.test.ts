import { describe, expect, it } from 'vitest';
import { unavailableEvaluation, unavailableReviewCopy } from './unavailable-review';

describe('unscored evaluation fallback', () => {
  for (const language of ['zh-CN', 'en', 'zh-HK', 'ja'] as const) {
    it(`never invents a score in ${language}`, () => {
      const evaluation = unavailableEvaluation(language);
      expect(evaluation.model).toBe('unavailable');
      expect(evaluation.scores).toEqual([]);
      expect(evaluation.summary).toBe(unavailableReviewCopy[language].summary);
      expect(unavailableReviewCopy[language].noScore).toBeTruthy();
    });
  }
});
