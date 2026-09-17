import type { Evaluation, Turn } from '@/types/speaking';
import type { AudioMetrics } from './types';

export type CombinedEvaluation = {
  content: Evaluation | null;
  delivery: { kind: 'basic_estimate'; metrics: AudioMetrics[] } | { kind: 'not_available'; metrics: [] };
  pronunciation: { status: 'not_available'; score: null };
};

export function combineEvaluation(content: Evaluation | null, turns: Turn[]): CombinedEvaluation {
  const metrics = turns.flatMap(turn => turn.audioMetrics?.analysisAvailable ? [turn.audioMetrics] : []);
  return {
    content: content?.model === 'ai' ? content : null,
    delivery: metrics.length ? { kind: 'basic_estimate', metrics } : { kind: 'not_available', metrics: [] },
    pronunciation: { status: 'not_available', score: null },
  };
}
