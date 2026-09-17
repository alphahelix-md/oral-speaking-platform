import type { SpeechThresholds } from '@/lib/speech/types';
export const japaneseSpeechConfig: SpeechThresholds = { sampleIntervalMs: 50, speechRmsThreshold: 0.025, minSpeechMs: 150, pauseMs: 350, longPauseMs: 1500, minimumRecordingMs: 800 };
