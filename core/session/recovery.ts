import type { AnswerDraft, Session } from '@/types/speaking';
import { createDraft, speakingReducer } from '@/core/speaking/engine';

export class RequestNotSentError extends Error {}

export function recoverSession(session: Session): Session {
  if (session.evaluation || session.revision !== undefined && !session.draft) return session;
  const draft = session.draft || createDraft();
  const interrupted = draft.stage === 'recording' || draft.stage === 'transcribing';
  return { ...session, status: 'listening', draft: { ...draft,
    stage: interrupted ? 'interrupted' : draft.stage,
    chunks: draft.chunks.map(chunk => chunk.status === 'running' ? { ...chunk, status: 'uncertain' } : chunk),
  } };
}

export function commitDraft(session: Session, nextQuestion?: string): Session {
  const draft = session.draft;
  if (!draft || session.turns.some(turn => turn.id === draft.turnId)) return session;
  if (draft.audioId && draft.audioStatus !== 'verified') throw new Error('AUDIO_NOT_VERIFIED');
  if (!draft.transcript.trim() && !draft.audioId) throw new Error('EMPTY_ANSWER');
  const reduced = speakingReducer(session, { type: 'ANSWER', ...draft, transcript: draft.transcript.trim() });
  const answered: Session = { ...reduced, turns: reduced.turns.map(turn => turn.id !== draft.turnId ? turn : { ...turn,
    audioStatus: draft.audioId ? 'verified' : 'none',
    transcriptionStatus: !draft.transcript.trim() ? 'skipped' : draft.transcriptEdited || !draft.audioId ? 'manual' : draft.transcriptResult ? 'succeeded' : 'partial',
    transcriptionChunks: draft.chunks.map(chunk => ({ ...chunk })),
  }) };
  return nextQuestion === undefined ? answered : speakingReducer(answered, { type: 'QUESTION', question: nextQuestion });
}

export function evaluationKey(session: Session): string {
  return session.turns.map(turn => turn.id).join(':');
}

// Checkpoint BEFORE sending and AFTER receiving each chunk. An interrupted request
// may already have been billed; only never-started chunks can be requested on resume.
export async function transcribeDraft(
  chunks: File[],
  read: () => AnswerDraft,
  checkpoint: (changes: Partial<AnswerDraft>) => void,
  request: (chunk: File, index: number) => Promise<string>,
): Promise<string> {
  for (const [index, chunk] of chunks.entries()) {
    const state = read().chunks[index];
    if (state?.status === 'succeeded') continue;
    if (state) throw new Error('TRANSCRIPTION_UNCERTAIN');
    const states = [...read().chunks];
    states[index] = { status: 'running' };
    checkpoint({ chunks: states, stage: 'transcribing' });
    let text: string;
    try { text = await request(chunk, index); }
    catch (error) {
      if (error instanceof RequestNotSentError) states.splice(index);
      else states[index] = { status: 'uncertain' };
      checkpoint({ chunks: states, stage: 'interrupted' });
      throw error;
    }
    states[index] = { status: 'succeeded', text };
    checkpoint({ chunks: states, ...(!read().transcriptEdited ? { transcript: states.map(part => part.text || '').join(' ').trim() } : {}) });
  }
  const text = read().chunks.map(part => part.text || '').join(' ').trim();
  if (!text) throw new Error('EMPTY_TRANSCRIPT');
  return text;
}
