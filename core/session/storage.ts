import type { Session } from '@/types/speaking';
const KEY = 'oral.sessions.v1';
export function getSessions(): Session[] { try { return JSON.parse(localStorage.getItem(KEY) || '[]') as Session[]; } catch { return []; } }
export function saveSession(session: Session): void { const sessions = getSessions().filter(s => s.id !== session.id); localStorage.setItem(KEY, JSON.stringify([session, ...sessions].slice(0, 100))); }
export function deleteSessions(ids: string[]): void {
  const selected = new Set(ids);
  localStorage.setItem(KEY, JSON.stringify(getSessions().filter(session => !selected.has(session.id))));
}
export function getStats(sessions: Session[], language?: Session['language']) {
  const selected = language ? sessions.filter(s => s.language === language) : sessions;
  const seconds = selected.flatMap(s => s.turns).reduce((sum, t) => sum + t.durationSeconds, 0);
  const scored = selected.flatMap(s => s.evaluation?.scores || []);
  const weaknesses = selected.flatMap(s => s.evaluation?.weaknesses || []);
  return { sessions: selected.length, minutes: Math.round(seconds / 60), average: scored.length ? Math.round(scored.reduce((sum, s) => sum + s.value, 0) / scored.length * 10) / 10 : null, weaknesses: [...new Set(weaknesses)].slice(0, 5) };
}
