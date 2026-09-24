import { z } from 'zod';
import { UpstreamAiError } from './server';

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
  capability: Capability,
  route: CapabilityRoute<Provider>,
  invoke: (provider: Provider, timeoutMs: number) => Promise<Result>,
): Promise<{ value: Result; provider: Provider; attempts: number }> {
  const deadline = Date.now() + 21_000;
  const hasFallback = Boolean(route.fallback && route.fallback !== route.primary);
  const call = (provider: Provider) => {
    const remaining = deadline - Date.now();
    if (remaining < 1_000) throw new DOMException('Evaluation deadline exceeded', 'TimeoutError');
    return invoke(provider, Math.min(hasFallback ? 7_000 : 10_000, remaining));
  };
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return { value: await call(route.primary), provider: route.primary, attempts: attempt };
    } catch (error) {
      const retryable = isTransient(error, route.primary) || isMalformedOutput(error);
      const capacity = error instanceof UpstreamAiError && error.status === 429;
      // Do not hammer a capacity-limited provider or bypass unknown quota/auth failures.
      if (attempt === 1 && retryable && !capacity) continue;
      if (!retryable || !hasFallback) throw error;
      console.warn('[CAPABILITY_FAILOVER]', { capability, primary: route.primary, fallback: route.fallback });
      return { value: await call(route.fallback!), provider: route.fallback!, attempts: attempt + 1 };
    }
  }
  throw new Error('CAPABILITY_UNREACHABLE');
}
