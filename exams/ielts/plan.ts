import { ieltsQuestionSet } from './bank';

export const IELTS_FULL_MOCK = 'Full mock · Parts 1–3';
export const IELTS_PART_1 = 'Part 1 · Familiar topics';
export const IELTS_PART_2 = 'Part 2 · Long turn';
export const IELTS_PART_3 = 'Part 3 · Discussion';

export type IeltsPart = 1 | 2 | 3;

const plans: Record<string, readonly IeltsPart[]> = {
  [IELTS_FULL_MOCK]: [1, 1, 1, 2, 3, 3, 3],
  [IELTS_PART_1]: [1, 1, 1, 1],
  [IELTS_PART_2]: [2],
  [IELTS_PART_3]: [3, 3, 3],
};

export function ieltsPlan(topic: string): readonly IeltsPart[] {
  return plans[topic] || plans[IELTS_FULL_MOCK];
}

export function ieltsPartAt(topic: string, questionIndex: number): IeltsPart {
  const plan = ieltsPlan(topic);
  return plan[Math.min(Math.max(0, questionIndex), plan.length - 1)];
}

export function ieltsQuestionAt(topic: string, questionIndex: number, setId?: string): string {
  const plan = ieltsPlan(topic);
  const boundedIndex = Math.min(Math.max(0, questionIndex), plan.length - 1);
  const part = plan[boundedIndex];
  const ordinal = plan.slice(0, boundedIndex + 1).filter(value => value === part).length - 1;
  const set = ieltsQuestionSet(setId);
  if (part === 2) return set.part2;
  const questions = part === 1 ? set.part1 : set.part3;
  return questions[ordinal % questions.length];
}

export function ieltsPartChangesAfter(topic: string, answeredCount: number): boolean {
  const plan = ieltsPlan(topic);
  return answeredCount > 0 && answeredCount < plan.length &&
    plan[answeredCount - 1] !== plan[answeredCount];
}
