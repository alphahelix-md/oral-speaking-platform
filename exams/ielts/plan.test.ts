import { describe, expect, it } from 'vitest';
import { IELTS_FULL_MOCK, IELTS_PART_1, IELTS_PART_2, IELTS_PART_3, ieltsPartAt, ieltsPartChangesAfter, ieltsPlan, ieltsQuestionAt } from './plan';
import { ieltsQuestionSets } from './bank';

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
    expect(ieltsQuestionAt(IELTS_FULL_MOCK, 4)).toContain('?');
    expect(ieltsQuestionAt(IELTS_PART_3, 1)).not.toBe(ieltsQuestionAt(IELTS_PART_3, 0));
  });

  it('has 40 distinct, reviewed, thematically grouped practice prompts', () => {
    expect(ieltsQuestionSets).toHaveLength(5);
    const questions = ieltsQuestionSets.flatMap(set => [...set.part1, set.part2, ...set.part3]);
    expect(questions).toHaveLength(40);
    expect(new Set(questions.map(question => question.toLowerCase().trim())).size).toBe(40);
    for (const set of ieltsQuestionSets) {
      expect(set.source).toBe('original');
      expect(['intermediate', 'upper-intermediate']).toContain(set.difficulty);
      expect(set.reviewStatus).toBe('editorial-draft');
      expect(set.reviewedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(set.part1).toHaveLength(4);
      expect(set.part3).toHaveLength(3);
      expect(set.part2).toMatch(/^Describe /);
      expect(set.part2).toContain('explain');
      expect(ieltsQuestionAt(IELTS_FULL_MOCK, 3, set.id)).toBe(set.part2);
      expect(ieltsQuestionAt(IELTS_FULL_MOCK, 4, set.id)).toBe(set.part3[0]);
    }
  });
});
