import { describe, expect, it } from 'vitest';
import { IELTS_FULL_MOCK, IELTS_PART_1, IELTS_PART_2, IELTS_PART_3, ieltsPartAt, ieltsPartChangesAfter, ieltsPlan, ieltsQuestionAt } from './plan';

describe('IELTS practice plan', () => {
  it('runs a full mock in Part 1, Part 2, Part 3 order', () => {
    expect(ieltsPlan(IELTS_FULL_MOCK)).toEqual([1, 1, 1, 2, 3, 3, 3]);
    expect([0, 3, 4].map(index => ieltsPartAt(IELTS_FULL_MOCK, index))).toEqual([1, 2, 3]);
    expect(ieltsPartChangesAfter(IELTS_FULL_MOCK, 3)).toBe(true);
    expect(ieltsPartChangesAfter(IELTS_FULL_MOCK, 4)).toBe(true);
    expect(ieltsPartChangesAfter(IELTS_FULL_MOCK, 2)).toBe(false);
  });

  it('keeps focused practice inside the selected part', () => {
    expect(ieltsPlan(IELTS_PART_1)).toHaveLength(4);
    expect(ieltsPlan(IELTS_PART_2)).toEqual([2]);
    expect(ieltsPlan(IELTS_PART_3)).toEqual([3, 3, 3]);
    expect(ieltsPartChangesAfter(IELTS_PART_2, 1)).toBe(false);
  });

  it('offers a cue card at Part 2 and discussion questions at Part 3', () => {
    expect(ieltsQuestionAt(IELTS_FULL_MOCK, 3)).toContain('Describe');
    expect(ieltsQuestionAt(IELTS_FULL_MOCK, 4)).toContain('Why');
    expect(ieltsQuestionAt(IELTS_PART_3, 1)).not.toBe(ieltsQuestionAt(IELTS_PART_3, 0));
  });
});
