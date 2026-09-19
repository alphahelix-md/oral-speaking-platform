import { NextResponse } from 'next/server';
import { z } from 'zod';
import { aiAvailable, nextQuestion } from '@/lib/ai/server';
import { transcriptTextEvaluator } from '@/lib/speech/text-evaluator';
import { guardBetaRequest, guardErrorResponse } from '@/lib/ai/guard';

const pauseIntervalSchema = z.object({ startSeconds: z.number().min(0), endSeconds: z.number().min(0), durationSeconds: z.number().min(0) });
const audioMetricsSchema = z.object({ durationSeconds: z.number().min(0), speakingDurationSeconds: z.number().min(0), silenceDurationSeconds: z.number().min(0), silenceRatio: z.number().min(0).max(1), pauseCount: z.number().int().min(0), longPauseCount: z.number().int().min(0), longPauseIntervals: z.array(pauseIntervalSchema).max(100).default([]), averagePauseDurationSeconds: z.number().min(0), audioEnergy: z.number().min(0), volumeVariation: z.number().min(0), analysisAvailable: z.boolean() });
const requestSchema = z.object({ action: z.enum(['next', 'evaluate']), provider: z.enum(['openai', 'deepseek', 'glm']).default('openai'), uiLanguage: z.enum(['zh-CN', 'en', 'zh-HK', 'ja']).default('en'), language: z.enum(['en', 'ja']), mode: z.enum(['ielts', 'daily', 'scenario', 'topic', 'free-talk', 'toefl', 'interview', 'weakness']), topic: z.string().max(120), level: z.string().max(60), questionSetId: z.string().max(32).optional(), turns: z.array(z.object({ id: z.string(), question: z.string().max(1000), transcript: z.string().max(4000), createdAt: z.string(), attempt: z.number(), durationSeconds: z.number(), audioId: z.string().optional(), aiResponse: z.string().optional(), audioMetrics: audioMetricsSchema.optional() })).max(20) });
export async function POST(request: Request) {
  try {
    await guardBetaRequest(request);
    if (!aiAvailable) return NextResponse.json({ error: 'AI_NOT_CONFIGURED' }, { status: 503 });
    const input = requestSchema.parse(await request.json());
    if (input.action === 'next') return NextResponse.json({ question: await nextQuestion(input.provider, input.language, input.mode, input.topic, input.level, input.turns, input.questionSetId) });
    return NextResponse.json({ evaluation: await transcriptTextEvaluator.evaluate(input.provider, input.language, input.mode, input.turns, input.uiLanguage) });
  } catch (error) {
    const guard = guardErrorResponse(error); if (guard) return NextResponse.json({ error: guard.error }, { status: guard.status });
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'AI unavailable' }, { status: 502 });
  }
}
