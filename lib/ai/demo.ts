import { languages } from '@/languages';
import type { Evaluation, LanguageId, ModeId, Turn } from '@/types/speaking';
import type { UiLanguage } from '@/lib/ui-translations';
export function demoQuestion(language: LanguageId, mode: ModeId, count: number, topic = ''): string {
  if (mode === 'ielts' && topic.includes('Part 2')) return ['Describe a place you would like to visit. Say where it is, why you want to go, and what you would do there.', 'What makes this place especially interesting to you?'][count % 2];
  if (mode === 'ielts' && topic.includes('Part 3')) return ['Why do people choose to travel to other countries?', 'How might travel change in the future?'][count % 2];
  if (language === 'ja' && mode === 'scenario') {
    const scenarios: Record<string, string[]> = { 'コンビニ': ['いらっしゃいませ。何をお探しですか。', 'ほかに何かご入用ですか。'], 'レストラン': ['いらっしゃいませ。ご注文はお決まりですか。', 'お飲み物はいかがですか。'], '駅': ['どちらまで行かれますか。', '片道と往復、どちらになさいますか。'], 'ホテル': ['いらっしゃいませ。ご予約のお名前を教えていただけますか。', '何泊のご予定ですか。'], '職場': ['今日の予定を教えていただけますか。', 'その仕事はいつまでに終わりそうですか。'] };
    return (scenarios[topic] || scenarios['コンビニ'])[count % 2];
  }
  const list = languages[language].fallbackQuestions[mode] || languages[language].fallbackQuestions.daily; return list[count % list.length];
}
export function demoEvaluation(language: LanguageId, turns: Turn[], uiLanguage: UiLanguage = 'en'): Evaluation {
  const words = turns.map(t => t.transcript.trim()).filter(Boolean); const total = words.reduce((n, t) => n + t.length, 0);
  const copy = {
    en: ['Demo review: your answers were saved. Connect AI for detailed language feedback.', 'Connect AI for evidence-based grammar and vocabulary analysis.', 'Completed'],
    'zh-CN': ['演示回顾：回答已保存。连接 AI 后可获得详细的语言反馈。', '连接 AI 后，可针对语法和词汇提供有依据的分析。', '已完成'],
    'zh-HK': ['示範回顧：回答已儲存。連接 AI 後可取得詳細的語言回饋。', '連接 AI 後，可針對文法和詞彙提供有依據的分析。', '已完成'],
    ja: ['デモレビュー：回答を保存しました。詳しい言語フィードバックには AI 接続が必要です。', 'AI に接続すると、文法と語彙を具体的に分析できます。', '完了した回答：'],
  }[uiLanguage];
  return { model: 'demo', summary: copy[0], scores: [], strengths: total ? [`${copy[2]} ${words.length}`] : [], improvements: [copy[1]], weaknesses: [] };
}
