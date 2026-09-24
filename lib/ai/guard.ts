import { AccountGuardError, guardAccountRequest } from '@/lib/auth/supabase-server';

class GuardError extends Error {
  constructor(readonly code: 'BETA_GUARD_NOT_CONFIGURED' | 'BETA_ACCESS_DENIED' | 'BETA_DAILY_LIMIT_REACHED') { super(code); }
}

function setting(name: string) { return process.env[name]?.trim(); }

export async function guardBetaAccess(request: Request) {
  const account = await guardAccountRequest(request);
  if (process.env.NODE_ENV !== 'production') return account?.id;
  const codes = setting('BETA_ACCESS_CODES')?.split(',').map(code => code.trim()).filter(Boolean) || [];
  const code = request.headers.get('x-beta-access-code')?.trim() || '';
  if (!codes.length) {
    console.error('[BETA_GUARD_CONFIG]', { requestId: request.headers.get('x-speech-request-id') || undefined, hasCodes: false });
    throw new GuardError('BETA_GUARD_NOT_CONFIGURED');
  }
  if (!codes.includes(code)) throw new GuardError('BETA_ACCESS_DENIED');
  return account?.id;
}

export function guardErrorResponse(error: unknown) {
  if (error instanceof GuardError) return { error: error.code, status: error.code === 'BETA_GUARD_NOT_CONFIGURED' ? 503 : 429 };
  if (error instanceof AccountGuardError) return { error: error.code, status: 401 };
  return null;
}
