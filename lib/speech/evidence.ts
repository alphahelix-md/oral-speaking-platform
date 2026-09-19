import type { Turn } from '@/types/speaking';

export function buildDeliveryEvidence(turns: Turn[]): string[] {
  return turns.flatMap((turn, index) => {
    const metrics = turn.audioMetrics;
    if (!metrics?.analysisAvailable) return [];
    const intervals = (metrics.longPauseIntervals || [])
      .map(pause => `${pause.startSeconds.toFixed(1)}-${pause.endSeconds.toFixed(1)}s`)
      .join(', ') || 'none';
    return [`Turn ${index + 1}: duration ${metrics.durationSeconds.toFixed(1)}s; detected speech ${metrics.speakingDurationSeconds.toFixed(1)}s; silence ${(metrics.silenceRatio * 100).toFixed(0)}%; pauses ${metrics.pauseCount}; long pauses ${metrics.longPauseCount}; long-pause intervals ${intervals}.`];
  });
}
