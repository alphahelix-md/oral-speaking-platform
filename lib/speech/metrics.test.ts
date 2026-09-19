import { describe, expect, it } from 'vitest';
import { calculateAudioMetrics } from './metrics';
import { englishSpeechConfig } from '@/languages/en/speech-config';
import { japaneseSpeechConfig } from '@/languages/ja/speech-config';
import { combineEvaluation } from './combined-evaluator';

describe('basic audio metrics', () => {
  it('marks unsupported or empty analysis unavailable', () => {
    expect(calculateAudioMetrics([], 1000, englishSpeechConfig).analysisAvailable).toBe(false);
  });
  it('counts internal pauses and excludes leading/trailing silence', () => {
    const samples = [...Array(10).fill(0), ...Array(10).fill(0.1), ...Array(35).fill(0), ...Array(10).fill(0.1), ...Array(10).fill(0)];
    const metrics = calculateAudioMetrics(samples, samples.length * 50, englishSpeechConfig);
    expect(metrics.pauseCount).toBe(1);
    expect(metrics.longPauseCount).toBe(1);
    expect(metrics.longPauseIntervals).toEqual([{ startSeconds: 1, endSeconds: 2.8, durationSeconds: 1.8 }]);
    expect(metrics.speakingDurationSeconds).toBeCloseTo(1);
    expect(metrics.silenceRatio).toBeGreaterThan(0.7);
  });
  it('supports Japanese-specific pause threshold', () => {
    const samples = [...Array(10).fill(0.1), ...Array(6).fill(0), ...Array(10).fill(0.1)];
    expect(calculateAudioMetrics(samples, 1300, englishSpeechConfig).pauseCount).toBe(1);
    expect(calculateAudioMetrics(samples, 1300, japaneseSpeechConfig).pauseCount).toBe(0);
  });
  it('never invents a pronunciation score', () => {
    expect(combineEvaluation(null, []).pronunciation).toEqual({ status: 'not_available', score: null });
  });
});
