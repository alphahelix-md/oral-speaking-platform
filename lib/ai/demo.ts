import { languages } from '@/languages';
import type { Evaluation, LanguageId, ModeId, Turn } from '@/types/speaking';
export function demoQuestion(language: LanguageId, mode: ModeId, count: number, topic = ''): string {
  if (mode === 'ielts' && topic.includes('Part 2')) return ['Describe a place you would like to visit. Say where it is, why you want to go, and what you would do there.', 'What makes this place especially interesting to you?'][count % 2];
  if (mode === 'ielts' && topic.includes('Part 3')) return ['Why do people choose to travel to other countries?', 'How might travel change in the future?'][count % 2];
  if (language === 'ja' && mode === 'scenario') {
    const scenarios: Record<string, string[]> = { 'コンビニ': ['いらっしゃいませ。何をお探しですか。', 'ほかに何かご入用ですか。'], 'レストラン': ['いらっしゃいませ。ご注文はお決まりですか。', 'お飲み物はいかがですか。'], '駅': ['どちらまで行かれますか。', '片道と往復、どちらになさいますか。'], 'ホテル': ['いらっしゃいませ。ご予約のお名前を教えていただけますか。', '何泊のご予定ですか。'], '職場': ['今日の予定を教えていただけますか。', 'その仕事はいつまでに終わりそうですか。'] };
    return (scenarios[topic] || scenarios['コンビニ'])[count % 2];
  }
  const list = languages[language].fallbackQuestions[mode] || languages[language].fallbackQuestions.daily; return list[count % list.length];
}
export function demoEvaluation(language: LanguageId, turns: Turn[]): Evaluation {
  const words = turns.map(t => t.transcript.trim()).filter(Boolean); const total = words.reduce((n, t) => n + t.length, 0);
  return { model: 'demo', summary: language === 'ja' ? 'デモ分析：回答を保存しました。詳しい文法・自然さの評価には AI 接続が必要です。' : 'Demo review: your answers were saved. Connect AI for detailed language feedback.', scores: [], strengths: total ? [language === 'ja' ? `${words.length} 回の回答を完了` : `Completed ${words.length} spoken answer${words.length === 1 ? '' : 's'}`] : [], improvements: [language === 'ja' ? 'AI を接続すると、助詞・活用・敬語を具体的に分析できます。' : 'Connect AI for evidence-based grammar and vocabulary analysis.'], weaknesses: [] };
}
