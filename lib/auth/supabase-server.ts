import { createClient } from '@supabase/supabase-js';

export class AccountGuardError extends Error {
  constructor(readonly code: 'AUTH_REQUIRED' | 'AUTH_ACCESS_CODE_MISMATCH') {
    super(code);
  }
}

function configuration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim();
  return url && key ? { url, key } : null;
}

// Auth remains optional until Supabase variables are added. Once configured,
// every protected API request must carry a valid invited user's access token.
export async function guardAccountRequest(request: Request) {
  const config = configuration();
  if (!config) return;
  const value = request.headers.get('authorization') || '';
  const token = value.startsWith('Bearer ') ? value.slice('Bearer '.length) : '';
  if (!token) throw new AccountGuardError('AUTH_REQUIRED');

  const client = createClient(config.url, config.key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new AccountGuardError('AUTH_REQUIRED');

  const code = request.headers.get('x-beta-access-code')?.trim() || '';
  const savedCode = data.user.user_metadata?.oral_beta_access_code;
  if (typeof savedCode !== 'string' || !code || savedCode !== code) {
    throw new AccountGuardError('AUTH_ACCESS_CODE_MISMATCH');
  }
}
