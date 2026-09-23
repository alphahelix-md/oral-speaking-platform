import { z } from 'zod';
import { UpstreamAiError } from './server';

export type Capability = 'transcription' | 'audio_evaluation' | 'content_evaluation';
export type CapabilityRoute<Provider extends string> = { primary: Provider; fallback?: Provider };

function isTransient(error: unknown): boolean {
  return error instanceof TypeError
    || error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    || error instanceof UpstreamAiError && (error.status === 408 || error.status >= 500);
}

function isMalformedOutput(error: unknown): boolean {
  return error instanceof SyntaxError || error instanceof z.ZodError;
}

export async function runCapability<Provider extends string, Result>(
  capability: Capability,
  route: CapabilityRoute<Provider>,
  invoke: (provider: Provider) => Promise<Result>,
): Promise<{ value: Result; provider: Provider; attempts: number }> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return { value: await invoke(route.primary), provider: route.primary, attempts: attempt };
    } catch (error) {
      if (attempt === 1 && (isTransient(error) || isMalformedOutput(error))) continue;
      // A provider 429 may be account quota, not capacity. Never bypass it here.
      if (!isTransient(error) || !route.fallback || route.fallback === route.primary) throw error;
      console.warn('[CAPABILITY_FAILOVER]', { capability, primary: route.primary, fallback: route.fallback });
      return { value: await invoke(route.fallback), provider: route.fallback, attempts: attempt + 1 };
    }
  }
  throw new Error('CAPABILITY_UNREACHABLE');
}
