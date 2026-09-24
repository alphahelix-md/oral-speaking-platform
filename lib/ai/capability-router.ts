import { z } from 'zod';
import { UpstreamAiError } from './server';
import { withDeadline } from '@/lib/http/deadline';
import { EVALUATION_DEADLINE_MS, MAX_PROVIDER_ATTEMPTS } from './request-policy';

export type Capability = 'transcription' | 'audio_evaluation' | 'content_evaluation';
export type CapabilityRoute<Provider extends string> = { primary: Provider; fallback?: Provider };

function isTransient(error: unknown, provider: string): boolean {
  return error instanceof TypeError
    || error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    || error instanceof UpstreamAiError && (error.status === 408 || error.status >= 500
      || provider === 'glm' && error.status === 429 && error.providerCode === '1305');
}

function isMalformedOutput(error: unknown): boolean {
  return error instanceof SyntaxError || error instanceof z.ZodError;
}

export async function runCapability<Provider extends string, Result>(
  capability: Capability, route: CapabilityRoute<Provider>,
  invoke: (provider: Provider, timeoutMs: number, signal: AbortSignal) => Promise<Result>,
  parent?: AbortSignal,
): Promise<{ value: Result; provider: Provider; attempts: number }> {
  const deadline = Date.now() + EVALUATION_DEADLINE_MS;
  const fallback = route.fallback && route.fallback !== route.primary ? route.fallback : undefined;
  return withDeadline(EVALUATION_DEADLINE_MS, async overallSignal => {
    let provider = route.primary;
    for (let attempt = 1; attempt <= MAX_PROVIDER_ATTEMPTS; attempt += 1) {
      const remaining = deadline - Date.now();
      if (remaining < 1_000) throw new DOMException('Evaluation deadline exceeded', 'TimeoutError');
      const timeout = Math.min(10_000, remaining);
      try {
        const value = await withDeadline(timeout, signal => invoke(provider, timeout, signal), overallSignal);
        return { value, provider, attempts: attempt };
      } catch (error) {
        overallSignal.throwIfAborted();
        const retryable = isTransient(error, provider) || isMalformedOutput(error);
        const capacity = error instanceof UpstreamAiError && error.status === 429;
        if (attempt >= MAX_PROVIDER_ATTEMPTS || !retryable || capacity && !fallback) throw error;
        if (fallback) {
          console.warn('[CAPABILITY_FAILOVER]', { capability, primary: route.primary, fallback });
          provider = fallback;
        }
      }
    }
    throw new Error('CAPABILITY_UNREACHABLE');
  }, parent);
}
