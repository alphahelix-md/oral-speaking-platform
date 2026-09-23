import type { Evaluation } from '@/types/speaking';
import type { UiLanguage } from '@/lib/ui-translations';

export const unavailableReviewCopy: Record<UiLanguage, { title: string; summary: string; noScore: string; notice: string }> = {
  'zh-CN': { title: '无分数回顾', summary: '练习已结束。AI 评价未生成；已保存的回答可在下方查看。', noScore: '本次未评分；发音也尚未评估。', notice: 'AI 评价暂不可用；回答已保存，本次不显示分数。' },
  en: { title: 'Unscored review', summary: 'Practice ended. AI feedback was unavailable; your saved answers appear below.', noScore: 'No score for this session. Pronunciation was not assessed.', notice: 'AI feedback is unavailable. Your answers were saved without a score.' },
  'zh-HK': { title: '無分數回顧', summary: '練習已結束。AI 評價未產生；已儲存的回答可在下方查看。', noScore: '本次未評分；發音亦尚未評估。', notice: 'AI 評價暫不可用；回答已儲存，本次不顯示分數。' },
  ja: { title: '点数なしの振り返り', summary: '練習は終了しました。AI 評価は利用できませんでした。保存した回答は下に表示されます。', noScore: '今回は採点していません。発音も評価していません。', notice: 'AI 評価を利用できません。回答は保存され、点数は表示されません。' },
};

export function unavailableEvaluation(uiLanguage: UiLanguage): Evaluation {
  return { model: 'unavailable', summary: unavailableReviewCopy[uiLanguage].summary, scores: [], strengths: [], improvements: [], weaknesses: [] };
}
