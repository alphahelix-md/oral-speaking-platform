import type { Session } from '@/types/speaking';
const KEY = 'oral.sessions.v1';
export function getSessions(): Session[] { try { return readSessions(); } catch { return []; } }
export function saveSession(session: Session): Session {
  // A stale tab must not replace a newer draft or a completed turn.
  const all = readSessions();
  const previous = all.find(item => item.id === session.id);
  if ((previous?.revision || 0) !== (session.revision || 0)) throw new Error('SESSION_CONFLICT');
  const saved = { ...session, revision: (session.revision || 0) + 1 };
  const value = JSON.stringify([saved, ...all.filter(item => item.id !== session.id)]);
  localStorage.setItem(KEY, value);
  if (localStorage.getItem(KEY) !== value) throw new Error('SESSION_READBACK_MISMATCH');
  return saved;
}
function readSessions(): Session[] {
  const value = JSON.parse(localStorage.getItem(KEY) || '[]');
  if (!Array.isArray(value)) throw new Error('SESSION_STORAGE_INVALID');
  return value as Session[];
}
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
