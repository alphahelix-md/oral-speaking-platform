import { expect, it } from 'vitest';
import { createSession } from '@/core/speaking/engine';
import { practiceBackup } from './export';
it('exports unsaved draft text and audio references without claiming retained audio', () => {
  const session = createSession('ja', 'daily', 'Beginner', 'Food', 'Question');
  session.draft = { ...session.draft!, transcript: 'Edited text', audioId: 'raw', audioStatus: 'failed' };
  const backup = JSON.parse(practiceBackup(session));
  expect(backup.session.draft).toEqual(session.draft);
  expect(backup.audioIncluded).toBe(false); expect(backup.platformRetentionConfirmed).toBe(false);
});
