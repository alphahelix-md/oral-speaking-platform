import { Clock3, Sparkles } from 'lucide-react';
import { buildQuickFeedback } from '@/lib/speech/quick-feedback';
import type { LanguageId, Turn } from '@/types/speaking';

type UiLanguage = 'zh-CN' | 'en' | 'zh-HK' | 'ja';
const copy: Record<UiLanguage, Record<string, string>> = {
  'zh-CN': { title: '上一题即时反馈', duration: '回答时长', pauses: '长停顿', words: '词', characters: '字', focus: '下一题只改这一点', 'add-detail': '回答偏短：补充一个原因或具体例子。', 'reduce-pauses': '内容量足够：把长句拆短，减少中途长停顿。', steady: '节奏稳定：下一题继续保持，并让结尾更明确。', 'text-only': '已保存文本；没有可用音频指标，暂不评价表达节奏。', note: '本地快速提示，不是发音或正式分数。' },
  en: { title: 'Previous answer · quick feedback', duration: 'Answer time', pauses: 'Long pauses', words: 'words', characters: 'characters', focus: 'One focus for the next answer', 'add-detail': 'The answer was short. Add one reason or concrete example.', 'reduce-pauses': 'Content length was enough. Use shorter sentences to reduce long pauses.', steady: 'Steady delivery. Keep it, and make the ending more explicit.', 'text-only': 'Text saved. No audio metrics were available, so delivery was not assessed.', note: 'Local quick guidance, not pronunciation feedback or a formal score.' },
  'zh-HK': { title: '上一題即時回饋', duration: '回答時間', pauses: '長停頓', words: '詞', characters: '字', focus: '下一題只改善這一點', 'add-detail': '回答較短：補充一個原因或具體例子。', 'reduce-pauses': '內容量足夠：把長句拆短，減少中途長停頓。', steady: '節奏穩定：下一題繼續保持，並讓結尾更明確。', 'text-only': '文字已儲存；沒有可用音訊指標，暫不評估表達節奏。', note: '本機快速提示，不是發音回饋或正式分數。' },
  ja: { title: '前の回答・クイックフィードバック', duration: '回答時間', pauses: '長い間', words: '語', characters: '文字', focus: '次の回答で直す点', 'add-detail': '回答が短めです。理由か具体例を一つ加えましょう。', 'reduce-pauses': '内容量は十分です。文を短くして、長い間を減らしましょう。', steady: '安定した話し方です。次も維持し、結論を明確にしましょう。', 'text-only': 'テキストを保存しました。音声指標がないため、話し方は評価していません。', note: '端末内の簡易ヒントです。発音評価や正式な点数ではありません。' },
};

export function TurnQuickFeedback({ turn, language, uiLanguage }: { turn: Turn; language: LanguageId; uiLanguage: UiLanguage }) {
  const feedback = buildQuickFeedback(turn, language); const text = copy[uiLanguage];
  return <section className="quick-feedback" aria-live="polite">
    <div className="quick-feedback-head"><Sparkles size={17} /><strong>{text.title}</strong></div>
    <div className="quick-feedback-metrics"><span><Clock3 size={14} />{text.duration} {feedback.durationSeconds.toFixed(1)}s</span><span>{text.pauses} {feedback.longPauseCount}</span><span>{feedback.responseUnits} {text[feedback.unit]}</span></div>
    <strong className="quick-feedback-focus">{text.focus}</strong><p>{text[feedback.kind]}</p><small>{text.note}</small>
  </section>;
}
