import { describe, expect, it } from 'vitest';
import { buildQuickFeedback } from './quick-feedback';
import type { Turn } from '@/types/speaking';

const baseTurn: Turn = {
  id: 'turn-1', question: 'Question?', transcript: 'This is a complete answer with a reason and one useful example for context.',
  createdAt: '2026-09-21T00:00:00Z', attempt: 1, durationSeconds: 12,
  audioMetrics: { durationSeconds: 12, speakingDurationSeconds: 10, silenceDurationSeconds: 2, silenceRatio: 0.17, pauseCount: 2, longPauseCount: 0, longPauseIntervals: [], averagePauseDurationSeconds: 0.4, audioEnergy: 0.1, volumeVariation: 0.02, analysisAvailable: true },
};

describe('quick feedback', () => {
  it('suggests more detail for a short answer', () => {
    expect(buildQuickFeedback({ ...baseTurn, transcript: 'Yes, I do.', durationSeconds: 3, audioMetrics: { ...baseTurn.audioMetrics!, speakingDurationSeconds: 2.5 } }, 'en').kind).toBe('add-detail');
  });
  it('prioritizes a long-pause warning after enough content', () => {
    expect(buildQuickFeedback({ ...baseTurn, audioMetrics: { ...baseTurn.audioMetrics!, longPauseCount: 1 } }, 'en').kind).toBe('reduce-pauses');
  });
  it('does not pretend typed text has audio feedback', () => {
    expect(buildQuickFeedback({ ...baseTurn, audioMetrics: undefined }, 'en').kind).toBe('text-only');
  });
  it('counts Japanese without relying on spaces', () => {
    const result = buildQuickFeedback({ ...baseTurn, transcript: '今日は公園を散歩してとても楽しかったです。' }, 'ja');
    expect(result.unit).toBe('characters');
    expect(result.responseUnits).toBeGreaterThan(18);
  });
});
