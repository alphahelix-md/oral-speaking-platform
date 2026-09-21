import type { LanguageId, Turn } from '@/types/speaking';

export type QuickFeedbackKind = 'add-detail' | 'reduce-pauses' | 'steady' | 'text-only';

export type QuickFeedback = {
  kind: QuickFeedbackKind;
  responseUnits: number;
  unit: 'words' | 'characters';
  durationSeconds: number;
  longPauseCount: number;
};

function countResponseUnits(text: string, language: LanguageId) {
  if (language === 'ja') return [...text.replace(/\s/g, '')].length;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function buildQuickFeedback(turn: Turn, language: LanguageId): QuickFeedback {
  const responseUnits = countResponseUnits(turn.transcript, language);
  const metrics = turn.audioMetrics?.analysisAvailable ? turn.audioMetrics : undefined;
  const shortResponse = language === 'ja' ? responseUnits < 18 : responseUnits < 12;
  let kind: QuickFeedbackKind = 'steady';

  if (!metrics) kind = 'text-only';
  else if (shortResponse || metrics.speakingDurationSeconds < 5) kind = 'add-detail';
  else if (metrics.longPauseCount > 0 || metrics.silenceRatio >= 0.55) kind = 'reduce-pauses';

  return { kind, responseUnits, unit: language === 'ja' ? 'characters' : 'words', durationSeconds: turn.durationSeconds, longPauseCount: metrics?.longPauseCount || 0 };
}
