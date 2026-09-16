import { describe, expect, it } from 'vitest';
import { languages } from './index';
import { modes } from '@/training/config';
import { demoQuestion, demoEvaluation } from '@/lib/ai/demo';

describe('language and mode composition', () => {
  it('keeps IELTS separate from Japanese and uses distinct rubrics', () => {
    expect(languages.en.modes).toContain('ielts');
    expect(languages.ja.modes).not.toContain('ielts');
    expect(languages.ja.rubric.map(item => item.key)).toContain('appropriateness');
    expect(languages.en.rubric.map(item => item.key)).not.toContain('appropriateness');
    expect(modes.toefl.enabled).toBe(false);
  });
  it('uses scenario-specific Japanese questions and never invents demo scores', () => {
    expect(demoQuestion('ja', 'scenario', 0, 'レストラン')).toContain('ご注文');
    expect(demoQuestion('en', 'ielts', 0, 'Part 2 · Long turn')).toContain('Describe');
    expect(demoEvaluation('ja', []).scores).toEqual([]);
  });
});
