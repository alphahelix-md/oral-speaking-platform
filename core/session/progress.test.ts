import { describe, expect, it } from 'vitest';
import { activityLevel, buildProgressDays, getStreaks } from './progress';
import type { Session } from '@/types/speaking';

function session(id: string, language: 'en' | 'ja', createdAt: string, seconds: number): Session {
  return {
    id,
    language,
    mode: 'daily',
    level: 'Intermediate',
    topic: 'Everyday life',
    status: 'finished',
    question: 'Question',
    startedAt: createdAt,
    turns: [{ id: id + '-turn', question: 'Question', transcript: 'Answer', createdAt, attempt: 1, durationSeconds: seconds }],
  };
}

describe('learning progress', () => {
  const now = new Date(2026, 8, 21, 12, 0, 0);

  it('groups real answer time by local activity date and language', () => {
    const sessions = [
      session('english', 'en', '2026-09-20T10:00:00+08:00', 120),
      session('japanese', 'ja', '2026-09-20T11:00:00+08:00', 60),
    ];
    const days = buildProgressDays(sessions, 3, 'en', now);
    const active = days.find(day => day.answers > 0)!;
    expect(active.answers).toBe(1);
    expect(active.seconds).toBe(120);
    expect(active.minutes).toBe(2);
  });

  it('calculates current and longest streaks without inventing activity', () => {
    const days = buildProgressDays([
      session('one', 'en', '2026-09-19T10:00:00+08:00', 10),
      session('two', 'en', '2026-09-20T10:00:00+08:00', 10),
      session('three', 'en', '2026-09-21T10:00:00+08:00', 10),
    ], 5, undefined, now);
    expect(getStreaks(days)).toEqual({ current: 3, longest: 3, activeDays: 3 });
  });

  it('uses increasing heatmap levels based on actual speaking seconds', () => {
    expect(activityLevel({ date: '2026-09-21', minutes: 0, seconds: 0, answers: 0, sessions: 0 })).toBe(0);
    expect(activityLevel({ date: '2026-09-21', minutes: 0.5, seconds: 30, answers: 1, sessions: 1 })).toBe(1);
    expect(activityLevel({ date: '2026-09-21', minutes: 5, seconds: 300, answers: 1, sessions: 1 })).toBe(3);
  });
});
