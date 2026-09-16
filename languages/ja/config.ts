import type { LanguageConfig } from '@/types/speaking';
export const japanese: LanguageConfig = {
  id: 'ja', name: 'Japanese', nativeName: '日本語', flag: 'JP', accent: 'coral', description: 'Real conversations for real-world moments.', speechLocale: 'ja-JP',
  levels: ['Beginner', 'Elementary', 'Intermediate', 'Upper Intermediate', 'Advanced'], modes: ['daily', 'scenario', 'topic', 'free-talk', 'interview', 'weakness'],
  topics: { daily: ['自己紹介', '食べ物', '趣味', '旅行'], scenario: ['コンビニ', 'レストラン', '駅', 'ホテル', '職場'], topic: ['文化', '教育', '健康'], 'free-talk': ['自由会話'] },
  fallbackQuestions: { daily: ['今日はどんな一日でしたか。', '休みの日は何をするのが好きですか。', '最近食べたおいしいものは何ですか。'], scenario: ['いらっしゃいませ。今日は何をお探しですか。', 'ご注文はお決まりですか。', 'どちらまで行かれますか。'], topic: ['日本の文化について、興味があることは何ですか。'], 'free-talk': ['今日は何について話したいですか。'] },
  rubric: [{ key: 'fluency', label: 'Fluency', guide: 'Flow and ease of expression' }, { key: 'grammar', label: 'Grammar', guide: 'Particles, conjugation, tense, and word order' }, { key: 'vocabulary', label: 'Vocabulary', guide: 'Range and collocations' }, { key: 'naturalness', label: 'Naturalness', guide: 'Idiomatic phrasing and sentence endings' }, { key: 'pronunciation', label: 'Pronunciation', guide: 'Only score with actual audio evidence' }, { key: 'appropriateness', label: 'Appropriateness', guide: 'Register, politeness, keigo, scenario fit' }],
  weaknesses: ['Particles', 'Conjugation', 'Keigo', 'Naturalness', 'Vocabulary', 'Pronunciation', 'Fluency'],
  conversationPrompt: 'あなたは自然な日本語の会話相手です。学習者のレベルに合わせ、短く話し、一度に質問は一つだけにしてください。会話中は細かく訂正しないでください。場面に合う丁寧さを守ってください。',
  evaluationPrompt: '日本語の口語を評価。助詞、活用、語順、不自然な直訳、敬語、普通体・丁寧体、語彙の組み合わせ、文末表現を具体例付きで確認。実際の音声分析なしに発音を採点しない。JLPT公式口語スコアと称しない。'
};
