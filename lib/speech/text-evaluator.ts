import type { Evaluation, LanguageId, ModeId, Turn } from '@/types/speaking';
import type { UiLanguage } from '@/lib/ui-translations';
import { evaluate, type TextProvider } from '@/lib/ai/server';

export interface TextEvaluator {
  evaluate(provider: TextProvider, language: LanguageId, mode: ModeId, turns: Turn[], uiLanguage: UiLanguage): Promise<Evaluation>;
}
export const transcriptTextEvaluator: TextEvaluator = { evaluate };
