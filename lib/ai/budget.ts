import { createHash, randomUUID } from 'node:crypto';
import { withDeadline } from '@/lib/http/deadline';
import { MAX_PROVIDER_ATTEMPTS } from './request-policy';

export type PaidCapability = 'transcription' | 'evaluation';
type Limits = { calls: number; audioMilliseconds: number; estimatedMicroUsd: number };
type Policy = { account: Limits; global: Limits; session: Limits; attemptEstimate: number };
type OperationInput = { capability: PaidCapability; sessionId: string; operationId: string; audioMilliseconds?: number };
export class BudgetError extends Error {
  constructor(readonly code: 'BUDGET_NOT_CONFIGURED' | 'BUDGET_UNAVAILABLE' | 'BUDGET_LIMIT_REACHED' | 'REQUEST_ALREADY_STARTED' | 'INVALID_BUDGET_INPUT', readonly requestStarted = false) { super(code); }
}
export function budgetErrorResponse(error: unknown) {
  if (!(error instanceof BudgetError)) return null;
  return { error: error.code, requestStarted: error.requestStarted,
    status: error.code === 'REQUEST_ALREADY_STARTED' ? 409 : error.code === 'BUDGET_LIMIT_REACHED' ? 429 : error.code === 'INVALID_BUDGET_INPUT' ? 400 : 503 };
}
function positive(name: string): number {
  const value = Number(process.env[name]);
  if (!Number.isSafeInteger(value) || value <= 0 || value > 1_000_000_000_000) throw new BudgetError('BUDGET_NOT_CONFIGURED');
  return value;
}
function policy(capability: PaidCapability): Policy | null {
  if (process.env.NODE_ENV !== 'production') return null;
  if (process.env.RATE_LIMIT_PROVIDER === 'access-code-only' && process.env.DEPLOYMENT_STAGE === 'test') return null;
  if ((process.env.RATE_LIMIT_PROVIDER || 'upstash') !== 'upstash') throw new BudgetError('BUDGET_NOT_CONFIGURED');
  const limits = (scope: 'ACCOUNT' | 'GLOBAL' | 'SESSION'): Limits => ({
    calls: positive(scope === 'ACCOUNT' ? 'BETA_DAILY_REQUEST_LIMIT' : `BUDGET_${scope}_REQUEST_LIMIT`),
    audioMilliseconds: positive(`BUDGET_${scope}_AUDIO_SECONDS`) * 1000,
    estimatedMicroUsd: positive(`BUDGET_${scope}_MICRO_USD`),
  });
  return { account: limits('ACCOUNT'), global: limits('GLOBAL'), session: limits('SESSION'),
    attemptEstimate: positive(capability === 'transcription' ? 'BUDGET_STT_ATTEMPT_MICRO_USD' : 'BUDGET_EVALUATION_ATTEMPT_MICRO_USD') };
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

// A single Lua transaction owns the operation and checks all limits before charging
// any counter. Failed/uncertain provider attempts are never refunded automatically.
export const RESERVE_ATTEMPT_SCRIPT = `
local owner = redis.call('HGET', KEYS[1], 'owner')
if owner and owner ~= ARGV[1] then return {0, 'DUPLICATE'} end
local attempt = tonumber(redis.call('HGET', KEYS[1], 'attempts') or '0') + 1
if attempt ~= tonumber(ARGV[2]) or attempt > 2 then return {0, 'DUPLICATE'} end
local fields = {'calls', 'audio_ms', 'estimated_micro_usd'}
local increments = {1, tonumber(ARGV[3]), tonumber(ARGV[4])}
for scope = 1, 3 do
  for metric = 1, 3 do
    local current = tonumber(redis.call('HGET', KEYS[scope + 1], fields[metric]) or '0')
    local limit = tonumber(ARGV[4 + (scope - 1) * 3 + metric])
    if current + increments[metric] > limit then return {0, 'LIMIT'} end
  end
end
redis.call('HSET', KEYS[1], 'owner', ARGV[1], 'attempts', attempt, 'attempt_' .. attempt, ARGV[14])
redis.call('EXPIRE', KEYS[1], 604800)
for scope = 1, 3 do
  for metric = 1, 3 do redis.call('HINCRBY', KEYS[scope + 1], fields[metric], increments[metric]) end
  redis.call('EXPIRE', KEYS[scope + 1], scope == 3 and 604800 or 172800)
end
return {1, attempt}
`;

async function redis(command: (string | number)[], signal?: AbortSignal): Promise<unknown> {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) throw new BudgetError('BUDGET_NOT_CONFIGURED');
  try {
    return await withDeadline(5000, async requestSignal => {
      const response = await fetch(url.replace(/\/$/, ''), {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(command), cache: 'no-store', signal: requestSignal,
      });
      if (!response.ok) throw new Error('Redis request rejected');
      const value: { result?: unknown; error?: unknown } = await response.json();
      if (value.error || !('result' in value)) throw new Error('Redis command failed');
      return value.result;
    }, signal);
  } catch { throw new BudgetError('BUDGET_UNAVAILABLE'); }
}

export function createBudgetOperation(request: Request, accountId: string | undefined, input: OperationInput) {
  const limits = policy(input.capability);
  const milliseconds = input.audioMilliseconds || 0;
  if (!input.sessionId || input.sessionId.length > 160 || !input.operationId || input.operationId.length > 300
    || !Number.isSafeInteger(milliseconds) || milliseconds < 0 || milliseconds > 30_000) throw new BudgetError('INVALID_BUDGET_INPUT');
  // Without account auth, a shared code gets a shared limit; spoofed IPs cannot reset it.
  const subject = hash(accountId ? `account:${accountId}` : `code:${request.headers.get('x-beta-access-code') || 'development'}`);
  const session = hash(`${subject}:${input.sessionId}`);
  const operation = hash(`${subject}:${input.capability}:${input.operationId}`);
  const operationKey = `{oral-budget}:v1:operation:${operation}`;
  const owner = randomUUID(); let attempts = 0;
  const record = async (attempt: number, data: object, signal?: AbortSignal) => {
    console.info('[PROVIDER_ATTEMPT]', { operation, capability: input.capability, attempt, enforced: Boolean(limits), ...data });
    if (limits) {
      try { await redis(['HSET', operationKey, `attempt_${attempt}`, JSON.stringify(data)], signal); }
      catch { console.error('[BUDGET_LEDGER_WRITE_FAILED]', { operation, attempt }); }
    }
  };
  return {
    get attempts() { return attempts; },
    async run<T>(provider: string, model: string, invoke: () => Promise<T>, signal?: AbortSignal): Promise<T> {
      signal?.throwIfAborted();
      const attempt = attempts + 1;
      if (attempt > MAX_PROVIDER_ATTEMPTS) throw new BudgetError('BUDGET_LIMIT_REACHED', attempts > 0);
      const startedAt = new Date().toISOString();
      const meta = { provider, model, startedAt, audioMilliseconds: milliseconds, estimatedMicroUsd: limits?.attemptEstimate ?? null };
      if (limits) {
        const day = startedAt.slice(0, 10);
        const keys = [operationKey, `{oral-budget}:v1:account:${subject}:${day}`, `{oral-budget}:v1:global:${day}`, `{oral-budget}:v1:session:${session}`];
        let result: unknown;
        try { result = await redis(['EVAL', RESERVE_ATTEMPT_SCRIPT, keys.length, ...keys, owner, attempt, milliseconds, limits.attemptEstimate,
          ...[limits.account, limits.global, limits.session].flatMap(limit => [limit.calls, limit.audioMilliseconds, limit.estimatedMicroUsd]), JSON.stringify({ ...meta, status: 'reserved' })], signal); }
        catch (error) { throw new BudgetError(error instanceof BudgetError ? error.code : 'BUDGET_UNAVAILABLE', attempts > 0); }
        if (!Array.isArray(result) || result[0] !== 1) {
          const code = Array.isArray(result) && result[1] === 'DUPLICATE' ? 'REQUEST_ALREADY_STARTED' : Array.isArray(result) && result[1] === 'LIMIT' ? 'BUDGET_LIMIT_REACHED' : 'BUDGET_UNAVAILABLE';
          throw new BudgetError(code, code === 'REQUEST_ALREADY_STARTED' || attempts > 0);
        }
      }
      attempts = attempt;
      const started = Date.now();
      try {
        signal?.throwIfAborted();
        const value = await invoke();
        const failed = value instanceof Response && !value.ok;
        // The reserved receipt is authoritative. A slow optional ledger update
        // must not turn a received result into another paid model attempt.
        void record(attempt, { ...meta, status: failed ? 'failed' : value instanceof Response ? 'response_received' : 'succeeded', latencyMs: Date.now() - started, ...(value instanceof Response ? { httpStatus: value.status } : {}) }, signal);
        return value;
      } catch (error) {
        void record(attempt, { ...meta, status: 'uncertain', latencyMs: Date.now() - started }, signal);
        throw error;
      }
    },
  };
}

// Browser chunk encoder emits PCM16 mono / 16 kHz. Derive billable duration from
// the actual bytes, never a duration field supplied by the client.
export async function wavDurationMilliseconds(audio: File): Promise<number> {
  const bytes = await audio.arrayBuffer();
  const view = new DataView(bytes);
  const tag = (at: number) => String.fromCharCode(...new Uint8Array(bytes, at, 4));
  if (bytes.byteLength < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE' || view.getUint32(4, true) !== bytes.byteLength - 8) throw new BudgetError('INVALID_BUDGET_INPUT');
  let byteRate = 0; let dataBytes = -1;
  for (let at = 12; at + 8 <= bytes.byteLength;) {
    const size = view.getUint32(at + 4, true); const end = at + 8 + size;
    if (end > bytes.byteLength) throw new BudgetError('INVALID_BUDGET_INPUT');
    if (tag(at) === 'fmt ') {
      if (size < 16 || view.getUint16(at + 8, true) !== 1 || view.getUint16(at + 10, true) !== 1 || view.getUint32(at + 12, true) !== 16000
        || view.getUint16(at + 20, true) !== 2 || view.getUint16(at + 22, true) !== 16 || view.getUint32(at + 16, true) !== 32000) throw new BudgetError('INVALID_BUDGET_INPUT');
      byteRate = 32000;
    }
    if (tag(at) === 'data') { if (dataBytes !== -1) throw new BudgetError('INVALID_BUDGET_INPUT'); dataBytes = size; }
    at = end + size % 2;
  }
  const milliseconds = Math.ceil(dataBytes / byteRate * 1000);
  if (!byteRate || dataBytes <= 0 || dataBytes % 2 || milliseconds > 25_000) throw new BudgetError('INVALID_BUDGET_INPUT');
  return milliseconds;
}
