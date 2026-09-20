import { createHash } from 'crypto';
import { AccountGuardError, guardAccountRequest } from '@/lib/auth/supabase-server';

class GuardError extends Error {
  constructor(readonly code: 'BETA_GUARD_NOT_CONFIGURED' | 'BETA_ACCESS_DENIED' | 'BETA_DAILY_LIMIT_REACHED') { super(code); }
}

function setting(name: string) { return process.env[name]?.trim(); }

async function redis(command: string[]) {
  const url = setting('UPSTASH_REDIS_REST_URL'); const token = setting('UPSTASH_REDIS_REST_TOKEN');
  if (!url || !token) {
    console.error('[BETA_GUARD_CONFIG]', { hasRedisUrl: Boolean(url), hasRedisToken: Boolean(token) });
    throw new GuardError('BETA_GUARD_NOT_CONFIGURED');
  }
  const response = await fetch(`${url.replace(/\/$/, '')}/${command.map(encodeURIComponent).join('/')}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!response.ok) {
    console.error('[BETA_GUARD_REDIS]', { status: response.status });
    throw new GuardError('BETA_GUARD_NOT_CONFIGURED');
  }
  return response.json() as Promise<{ result: number | string | null }>;
}

export async function guardBetaAccess(request: Request) {
  await guardAccountRequest(request);
  if (process.env.NODE_ENV !== 'production') return;
  const codes = setting('BETA_ACCESS_CODES')?.split(',').map(code => code.trim()).filter(Boolean) || [];
  const code = request.headers.get('x-beta-access-code')?.trim() || '';
  if (!codes.length) {
    console.error('[BETA_GUARD_CONFIG]', { requestId: request.headers.get('x-speech-request-id') || undefined, hasCodes: false });
    throw new GuardError('BETA_GUARD_NOT_CONFIGURED');
  }
  if (!codes.includes(code)) throw new GuardError('BETA_ACCESS_DENIED');
}

export async function guardBetaRequest(request: Request) {
  await guardBetaAccess(request);
  if (process.env.NODE_ENV !== 'production') return;
  const limit = Number(setting('BETA_DAILY_REQUEST_LIMIT'));
  if (!Number.isInteger(limit) || limit < 1) {
    console.error('[BETA_GUARD_CONFIG]', { requestId: request.headers.get('x-speech-request-id') || undefined, validLimit: false });
    throw new GuardError('BETA_GUARD_NOT_CONFIGURED');
  }

  const code = request.headers.get('x-beta-access-code')?.trim() || '';
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const day = new Date().toISOString().slice(0, 10);
  const fingerprint = createHash('sha256').update(`${code}:${ip}`).digest('hex').slice(0, 24);
  const key = `oral:beta:v2:${day}:${fingerprint}`;
  const speechRequestId = request.headers.get('x-speech-request-id')?.trim() || '';
  const isChunkedSpeech = /^sp_[a-zA-Z0-9_-]{6,64}$/.test(speechRequestId);
  const recordingKey = isChunkedSpeech
    ? `oral:beta:v2:recording:${day}:${fingerprint}:${createHash('sha256').update(speechRequestId).digest('hex').slice(0, 24)}`
    : '';
  if (recordingKey && (await redis(['get', recordingKey])).result) return;
  const current = Number((await redis(['get', key])).result || 0);
  if (current >= limit) throw new GuardError('BETA_DAILY_LIMIT_REACHED');
  const next = Number((await redis(['incr', key])).result);
  if (next === 1) await redis(['expire', key, '86400']);
  if (next > limit) throw new GuardError('BETA_DAILY_LIMIT_REACHED');
  if (recordingKey) await redis(['set', recordingKey, '1', 'ex', '86400']);
}

export function guardErrorResponse(error: unknown) {
  if (error instanceof GuardError) return { error: error.code, status: error.code === 'BETA_GUARD_NOT_CONFIGURED' ? 503 : 429 };
  if (error instanceof AccountGuardError) return { error: error.code, status: 401 };
  return null;
}
