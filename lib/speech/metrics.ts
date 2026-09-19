import type { AudioMetrics, SpeechThresholds } from './types';
export function calculateAudioMetrics(samples: number[], durationMs: number, config: SpeechThresholds): AudioMetrics {
  const durationSeconds = Math.max(0, durationMs / 1000);
  if (!samples.length || durationMs <= 0) return { durationSeconds, speakingDurationSeconds: 0, silenceDurationSeconds: 0, silenceRatio: 0, pauseCount: 0, longPauseCount: 0, longPauseIntervals: [], averagePauseDurationSeconds: 0, audioEnergy: 0, volumeVariation: 0, analysisAvailable: false };
  const interval = durationMs / samples.length;
  const runs: { speaking: boolean; start: number; duration: number }[] = [];
  for (const [index, value] of samples.entries()) { const active = value >= config.speechRmsThreshold; const last = runs.at(-1); if (last?.speaking === active) last.duration += interval; else runs.push({ speaking: active, start: index * interval, duration: interval }); }
  const speakingMs = runs.filter(run => run.speaking && run.duration >= config.minSpeechMs).reduce((sum, run) => sum + run.duration, 0);
  const pauses = runs.slice(1, -1).filter(run => !run.speaking && run.duration >= config.pauseMs);
  const longPauseIntervals = pauses.filter(run => run.duration >= config.longPauseMs).map(run => ({ startSeconds: Number((run.start / 1000).toFixed(1)), endSeconds: Number(((run.start + run.duration) / 1000).toFixed(1)), durationSeconds: Number((run.duration / 1000).toFixed(1)) }));
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const variance = samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / samples.length;
  return { durationSeconds, speakingDurationSeconds: speakingMs / 1000, silenceDurationSeconds: Math.max(0, durationMs - speakingMs) / 1000, silenceRatio: Math.max(0, 1 - speakingMs / durationMs), pauseCount: pauses.length, longPauseCount: longPauseIntervals.length, longPauseIntervals, averagePauseDurationSeconds: pauses.length ? pauses.reduce((sum, run) => sum + run.duration, 0) / pauses.length / 1000 : 0, audioEnergy: mean, volumeVariation: Math.sqrt(variance), analysisAvailable: true };
}
