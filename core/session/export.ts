import type { Session } from '@/types/speaking';

export function practiceBackup(session: Session) {
  return JSON.stringify({
    format: 'oral-practice-backup-v1', exportedAt: new Date().toISOString(),
    // JSON contains references only; audio must be downloaded separately.
    audioIncluded: false, platformRetentionConfirmed: false,
    session,
  }, null, 2);
}

export function downloadPracticeBackup(session: Session): void {
  const url = URL.createObjectURL(new Blob([practiceBackup(session)], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = `oral-practice-${session.id}.json`;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
