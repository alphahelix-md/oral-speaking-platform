import type { SpeechThresholds } from '@/lib/speech/types';
export const englishSpeechConfig: SpeechThresholds = { sampleIntervalMs: 50, speechRmsThreshold: 0.025, minSpeechMs: 150, pauseMs: 300, longPauseMs: 1500, minimumRecordingMs: 800 };
