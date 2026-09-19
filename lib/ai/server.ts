import { z } from 'zod';
import { languages } from '@/languages';
import { modes } from '@/training/config';
import type { LanguageId, ModeId, Turn, Evaluation } from '@/types/speaking';
import type { UiLanguage } from '@/lib/ui-translations';
import { ieltsPartAt } from '@/exams/ielts/plan';
import { ieltsQuestionSet } from '@/exams/ielts/bank';
import { buildDeliveryEvidence } from '@/lib/speech/evidence';

export type TextProvider = 'openai' | 'deepseek' | 'glm';
const providerConfig: Record<TextProvider, { key?: string; model: string; url: string; format: 'responses' | 'chat' }> = {
  openai: { key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_TEXT_MODEL || 'gpt-4.1-mini', url: 'https://api.openai.com/v1/responses', format: 'responses' },
  deepseek: { key: process.env.DEEPSEEK_API_KEY, model: process.env.DEEPSEEK_TEXT_MODEL || 'deepseek-v4-flash', url: 'https://api.deepseek.com/chat/completions', format: 'chat' },
  glm: { key: process.env.GLM_API_KEY, model: process.env.GLM_TEXT_MODEL || 'glm-4.7-flash', url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', format: 'chat' },
};
export const aiAvailable = Object.values(providerConfig).some(provider => Boolean(provider.key));

async function generate(provider: TextProvider, instructions: string, input: string): Promise<string> {
  const config = providerConfig[provider];
  if (!config.key) throw new Error(`${provider.toUpperCase()}_NOT_CONFIGURED`);
  const requestBody = config.format === 'responses'
    ? { model: config.model, instructions, input, store: false }
    : { model: config.model, messages: [{ role: 'system', content: instructions }, { role: 'user', content: input }], temperature: 0.4 };
  const response = await fetch(config.url, {
    method: 'POST', headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody), cache: 'no-store'
  });
  if (!response.ok) throw new Error(`AI service error ${response.status}`);
  const responseBody = await response.json();
  if (config.format === 'responses') return responseBody.output?.flatMap((item: { content?: { type: string; text?: string }[] }) => item.content || []).filter((item: { type: string }) => item.type === 'output_text').map((item: { text?: string }) => item.text || '').join('') || '';
  return responseBody.choices?.[0]?.message?.content || '';
}

export async function nextQuestion(provider: TextProvider, language: LanguageId, mode: ModeId, topic: string, level: string, turns: Turn[], questionSetId?: string): Promise<string> {
  const config = languages[language]; const training = modes[mode];
  const history = turns.map(t => `Examiner: ${t.question}\nLearner: ${t.transcript}`).join('\n');
  const stage = mode === 'ielts' ? `Stay in IELTS Speaking Part ${ieltsPartAt(topic, turns.length)}. The question set theme is ${ieltsQuestionSet(questionSetId).theme}. Ask a relevant follow-up for this part and theme only; do not move to another part.` : '';
  const output = await generate(provider, `${config.conversationPrompt}\n${training.prompt}\n${stage}\nLevel: ${level}. Topic: ${topic}. Return ONLY the next question, under 35 words. Language: ${config.name}.`, `Conversation so far:\n${history}\nAsk one relevant follow-up.`);
  return output.trim().replace(/^['"“”]|['"“”]$/g, '').slice(0, 500);
}

const evaluationSchema = z.object({ summary: z.string(), scores: z.array(z.object({ key: z.string(), value: z.number().min(0).max(10), note: z.string() })), strengths: z.array(z.string()), improvements: z.array(z.string()), weaknesses: z.array(z.string()) });
export async function evaluate(provider: TextProvider, language: LanguageId, mode: ModeId, turns: Turn[], uiLanguage: UiLanguage = 'en'): Promise<Evaluation> {
  const config = languages[language]; const rubric = modes[mode].rubric || config.rubric;
  const transcript = turns.map(t => `Question: ${t.question}\nAttempt ${t.attempt}: ${t.transcript}`).join('\n');
  const deliveryEvidence = buildDeliveryEvidence(turns);
  const feedbackLanguage = { 'zh-CN': 'Simplified Chinese', en: 'English', 'zh-HK': 'Traditional Chinese as used in Hong Kong', ja: 'Japanese' }[uiLanguage];
  const output = await generate(provider, `${config.evaluationPrompt}\nRubric: ${JSON.stringify(rubric)}. Write all feedback prose in ${feedbackLanguage}, regardless of the language being practiced. Keep JSON keys and rubric keys in English. Return ONLY JSON: {"summary":string,"scores":[{"key":string,"value":number 0-10,"note":string}],"strengths":string[],"improvements":string[],"weaknesses":string[]}. Include only rubric keys supported by transcript. Audio evidence below contains microphone-volume estimates only. Use it for specific rhythm observations in summary or improvements, but do not turn it into a numeric score and do not infer pronunciation, accent, acoustic fluency, or audio quality. Never score pronunciation from a transcript. For IELTS, these are practice indicators, never official bands.`, `${transcript}\n\nBasic audio evidence:\n${deliveryEvidence.length ? deliveryEvidence.join('\n') : 'Unavailable.'}`);
  const parsed = evaluationSchema.parse(JSON.parse(output.replace(/^```(?:json)?\s*|\s*```$/g, '')));
  return { ...parsed, scores: parsed.scores.filter(s => s.key !== 'pronunciation' && rubric.some(r => r.key === s.key)).map(s => ({ ...s, label: rubric.find(r => r.key === s.key)!.label })), model: 'ai', evidenceSources: deliveryEvidence.length ? ['transcript', 'basic_audio_metrics'] : ['transcript'] };
}
