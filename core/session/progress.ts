import type { Session } from '@/types/speaking';

export type ProgressDay = {
  date: string;
  minutes: number;
  seconds: number;
  answers: number;
  sessions: number;
};

function localDateKey(value: string): string {
  const date = new Date(value);
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

function dateAtOffset(now: Date, offset: number): Date {
  const date = new Date(now);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date;
}

function dateKeyAtOffset(now: Date, offset: number): string {
  return localDateKey(dateAtOffset(now, offset).toISOString());
}

export function buildProgressDays(sessions: Session[], days = 84, language?: Session['language'], now = new Date()): ProgressDay[] {
  const count = Math.max(1, days);
  const keys = Array.from({ length: count }, (_, index) => dateKeyAtOffset(now, index - count + 1));
  const map = new Map(keys.map(date => [date, { date, minutes: 0, seconds: 0, answers: 0, sessions: 0 }]));
  const selected = language ? sessions.filter(session => session.language === language) : sessions;

  for (const session of selected) {
    const activeDates = new Set<string>();
    for (const turn of session.turns) {
      const key = localDateKey(turn.createdAt || session.startedAt);
      const day = map.get(key);
      if (!day) continue;
      const seconds = Math.max(0, Number(turn.durationSeconds) || 0);
      day.seconds += seconds;
      day.answers += 1;
      activeDates.add(key);
    }
    for (const key of activeDates) {
      const day = map.get(key);
      if (day) day.sessions += 1;
    }
  }

  return keys.map(key => {
    const day = map.get(key)!;
    return { ...day, minutes: Math.round(day.seconds / 60 * 10) / 10 };
  });
}

export function getStreaks(days: ProgressDay[]): { current: number; longest: number; activeDays: number } {
  const active = days.map(day => day.answers > 0 || day.seconds > 0);
  let current = 0;
  for (let index = active.length - 1; index >= 0 && active[index]; index -= 1) current += 1;

  let longest = 0;
  let running = 0;
  for (const value of active) {
    running = value ? running + 1 : 0;
    longest = Math.max(longest, running);
  }
  return { current, longest, activeDays: active.filter(Boolean).length };
}

export function activityLevel(day: ProgressDay): 0 | 1 | 2 | 3 | 4 {
  if (!day.answers && !day.seconds) return 0;
  if (day.seconds < 60) return 1;
  if (day.seconds < 3 * 60) return 2;
  if (day.seconds < 8 * 60) return 3;
  return 4;
}
