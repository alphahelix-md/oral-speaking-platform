import { NextResponse } from 'next/server';
import { z } from 'zod';
import { aiAvailable, UpstreamAiError } from '@/lib/ai/server';
import { transcriptTextEvaluator } from '@/lib/speech/text-evaluator';
import { guardBetaAccess, guardErrorResponse } from '@/lib/ai/guard';
import { resolveTextProvider } from '@/lib/runtime/region';
import { createHash } from 'node:crypto';
import { budgetErrorResponse, createBudgetOperation } from '@/lib/ai/budget';
import { runCapability } from '@/lib/ai/capability-router';

const pauseIntervalSchema = z.object({ startSeconds: z.number().min(0), endSeconds: z.number().min(0), durationSeconds: z.number().min(0) });
const audioMetricsSchema = z.object({ durationSeconds: z.number().min(0), speakingDurationSeconds: z.number().min(0), silenceDurationSeconds: z.number().min(0), silenceRatio: z.number().min(0).max(1), pauseCount: z.number().int().min(0), longPauseCount: z.number().int().min(0), longPauseIntervals: z.array(pauseIntervalSchema).max(100).default([]), averagePauseDurationSeconds: z.number().min(0), audioEnergy: z.number().min(0), volumeVariation: z.number().min(0), analysisAvailable: z.boolean() });
const requestSchema = z.object({ action: z.literal('evaluate'), uiLanguage: z.enum(['zh-CN', 'en', 'zh-HK', 'ja']).default('en'), language: z.enum(['en', 'ja']), mode: z.enum(['ielts', 'daily', 'scenario', 'topic', 'free-talk', 'toefl', 'interview', 'weakness']), topic: z.string().max(120), level: z.string().max(60), turns: z.array(z.object({ id: z.string().min(1).max(160), question: z.string().max(1000), transcript: z.string().max(4000), createdAt: z.string(), attempt: z.number(), durationSeconds: z.number(), audioId: z.string().optional(), aiResponse: z.string().optional(), audioMetrics: audioMetricsSchema.optional() })).min(1).max(20).refine(turns => turns.some(turn => turn.transcript.trim()) && new Set(turns.map(turn => turn.id)).size === turns.length) });
function diagnosticCode(error: unknown) {
  if (error instanceof z.ZodError) return 'INVALID_REQUEST_OR_RESPONSE';
  if (error instanceof SyntaxError) return 'INVALID_JSON';
  if (error instanceof Error) {
    if (/^(OPENAI|DEEPSEEK|GLM)_NOT_CONFIGURED$/.test(error.message)) return error.message;
    if (/^AI service error \d{3}$/.test(error.message)) return 'UPSTREAM_HTTP_ERROR';
    if (error.name === 'TimeoutError' || error.name === 'AbortError') return 'UPSTREAM_TIMEOUT';
    if (error instanceof TypeError) return 'UPSTREAM_NETWORK_ERROR';
  }
  return 'AI_ERROR';
}
export async function POST(request: Request) {
  const startedAt = Date.now();
  let action: 'evaluate' | undefined;
  let provider: ReturnType<typeof resolveTextProvider> | undefined;
  try {
    const accountId = await guardBetaAccess(request);
    if (!aiAvailable) return NextResponse.json({ error: 'AI_NOT_CONFIGURED' }, { status: 503 });
    const input = requestSchema.parse(await request.json());
    action = input.action;
    provider = resolveTextProvider();
    console.info('[AI_REQUEST]', { action, provider });
    const key = createHash('sha256').update(JSON.stringify(input.turns.map(turn => turn.id))).digest('hex');
    const sessionId = request.headers.get('x-oral-session-id') || key;
    const operation = createBudgetOperation(request, accountId, { capability: 'evaluation', sessionId, operationId: `${sessionId}:${key}` });
    const modelFor = (selected: string) => selected === 'glm' ? process.env.GLM_TEXT_MODEL || 'glm-4.7-flash' : selected === 'deepseek' ? process.env.DEEPSEEK_TEXT_MODEL || 'deepseek-flash' : process.env.OPENAI_TEXT_MODEL || 'gpt-4.1-mini';
    const result = await runCapability('content_evaluation', { primary: provider }, (selected, timeoutMs) =>
      operation.run(selected, modelFor(selected), () => transcriptTextEvaluator.evaluate(selected, input.language, input.mode, input.turns, input.uiLanguage, timeoutMs)));
    provider = result.provider;
    const evaluation = result.value;
    console.info('[AI_SUCCESS]', { action, provider, durationMs: Date.now() - startedAt });
    return NextResponse.json({ evaluation });
  } catch (error) {
    const budget = budgetErrorResponse(error); if (budget) return NextResponse.json({ error: budget.error, requestStarted: budget.requestStarted }, { status: budget.status });
    const guard = guardErrorResponse(error); if (guard) return NextResponse.json({ error: guard.error }, { status: guard.status });
    console.error('[AI_ERROR]', { action, provider, code: diagnosticCode(error), upstreamStatus: error instanceof UpstreamAiError ? error.status : undefined, providerCode: error instanceof UpstreamAiError ? error.providerCode : undefined, durationMs: Date.now() - startedAt });
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'AI unavailable' }, { status: 502 });
  }
}
