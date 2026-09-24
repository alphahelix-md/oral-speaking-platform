import type { AnswerDraft, Evaluation, Session, SessionStatus, Turn } from '@/types/speaking';

export type Action =
  | { type: 'STATUS'; status: SessionStatus }
  | { type: 'QUESTION'; question: string }
  | { type: 'ANSWER'; turnId?: string; transcript: string; audioId?: string; durationSeconds: number; examPart?: 1 | 2 | 3; audioMetrics?: Turn['audioMetrics']; transcriptResult?: Turn['transcriptResult'] }
  | { type: 'EVALUATE'; evaluation: Evaluation }
  | { type: 'FINISH' }
  | { type: 'RETRY'; turnId: string };

export function speakingReducer(session: Session, action: Action): Session {
  switch (action.type) {
    case 'STATUS': return { ...session, status: action.status };
    case 'QUESTION': return { ...session, question: action.question, draft: createDraft(), status: 'listening' };
    case 'ANSWER': {
      const id = action.turnId || session.draft?.turnId || crypto.randomUUID();
      if (session.turns.some(turn => turn.id === id)) return session;
      const attempt = session.turns.filter(t => t.question === session.question).length + 1;
      const turn: Turn = { id, question: session.question, transcript: action.transcript, audioId: action.audioId, durationSeconds: action.durationSeconds, createdAt: new Date().toISOString(), attempt, examPart: action.examPart, audioMetrics: action.audioMetrics, transcriptResult: action.transcriptResult };
      return { ...session, turns: [...session.turns, turn], draft: undefined, status: 'thinking' };
    }
    case 'EVALUATE': return { ...session, evaluation: action.evaluation, draft: undefined, status: 'finished', endedAt: new Date().toISOString() };
    case 'FINISH': return { ...session, status: 'finished', endedAt: new Date().toISOString() };
    case 'RETRY': {
      const turn = session.turns.find(t => t.id === action.turnId);
      return turn ? { ...session, question: turn.question, draft: createDraft(turn.examPart), status: 'listening', evaluationRun: undefined, evaluation: undefined, endedAt: undefined } : session;
    }
  }
}

export function createDraft(examPart?: 1 | 2 | 3): AnswerDraft {
  return { turnId: crypto.randomUUID(), transcript: '', durationSeconds: 0, stage: 'editing', chunks: [], examPart };
}

export function createSession(language: Session['language'], mode: Session['mode'], level: string, topic: string, question: string): Session {
  return { id: crypto.randomUUID(), language, mode, level, topic, question, status: 'listening', draft: createDraft(), turns: [], startedAt: new Date().toISOString(), examType: mode === 'ielts' || mode === 'toefl' ? mode : null };
}
