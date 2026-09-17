import type { LanguageId } from '@/types/speaking';
export type SpeechThresholds = { sampleIntervalMs: number; speechRmsThreshold: number; minSpeechMs: number; pauseMs: number; longPauseMs: number; minimumRecordingMs: number };
export type AudioMetrics = { durationSeconds: number; speakingDurationSeconds: number; silenceDurationSeconds: number; silenceRatio: number; pauseCount: number; longPauseCount: number; averagePauseDurationSeconds: number; audioEnergy: number; volumeVariation: number; analysisAvailable: boolean };
export type TranscriptResult = { text: string; language: LanguageId; segments?: { start: number; end: number; text: string }[]; confidence?: number; duration?: number; provider: string };
export type SpeechAnalysis = { metrics?: AudioMetrics; transcript?: TranscriptResult; pronunciation: { status: 'not_available' | 'basic_estimate' | 'professional'; note?: string } };
