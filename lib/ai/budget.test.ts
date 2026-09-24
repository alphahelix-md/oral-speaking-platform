import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_PROVIDER_ATTEMPTS } from './request-policy';
import { BudgetError, budgetErrorResponse, createBudgetOperation, RESERVE_ATTEMPT_SCRIPT, wavDurationMilliseconds } from './budget';

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('RATE_LIMIT_PROVIDER', 'upstash');
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://budget-fixture.invalid'); vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'synthetic-not-a-key');
  for (const key of ['BETA_DAILY_REQUEST_LIMIT', 'BUDGET_GLOBAL_REQUEST_LIMIT', 'BUDGET_SESSION_REQUEST_LIMIT', 'BUDGET_ACCOUNT_AUDIO_SECONDS', 'BUDGET_GLOBAL_AUDIO_SECONDS', 'BUDGET_SESSION_AUDIO_SECONDS', 'BUDGET_ACCOUNT_MICRO_USD', 'BUDGET_GLOBAL_MICRO_USD', 'BUDGET_SESSION_MICRO_USD']) vi.stubEnv(key, '100');
  vi.stubEnv('BUDGET_STT_ATTEMPT_MICRO_USD', '2'); vi.stubEnv('BUDGET_EVALUATION_ATTEMPT_MICRO_USD', '3');
  vi.spyOn(console, 'info').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const request = () => new Request('http://localhost/api/transcribe', { headers: { 'x-beta-access-code': 'synthetic-code' } });
const input = { capability: 'transcription' as const, sessionId: 'session', operationId: 'recording:0', audioMilliseconds: 25000 };
function redis(result: unknown = [1, 1]) {
  const commands: any[][] = [];
  const fetcher = vi.fn(async (_url, init) => {
    const command = JSON.parse(init.body); commands.push(command);
    return Response.json({ result: command[0] === 'EVAL' ? result : 1 });
  });
  vi.stubGlobal('fetch', fetcher); return { commands, fetcher };
}

describe('provider budget boundary', () => {
  it('reserves account/global/session counters together before invoking a provider', async () => {
    const { commands } = redis(); const operation = createBudgetOperation(request(), 'account', input);
    const provider = vi.fn(async () => { expect(commands[0][0]).toBe('EVAL'); return 'value'; });
    expect(await operation.run('glm', 'fixture-model', provider)).toBe('value');
    const command = commands[0]; expect(command[2]).toBe(4);
    expect(command.slice(3, 7).every((key: string) => key.startsWith('{oral-budget}:v1:'))).toBe(true);
    expect(command.slice(8, 11)).toEqual([1, 25000, 2]);
    expect(commands[1][0]).toBe('HSET');
    const ledger = JSON.parse(commands[1][3]); expect(ledger).toMatchObject({ status: 'succeeded', provider: 'glm', audioMilliseconds: 25000, estimatedMicroUsd: 2 });
    expect(JSON.stringify(commands)).not.toContain('synthetic-code');
  });
  it.each([['LIMIT', 'BUDGET_LIMIT_REACHED'], ['DUPLICATE', 'REQUEST_ALREADY_STARTED']] as const)('does not invoke when Redis returns %s', async (result, code) => {
    redis([0, result]); const provider = vi.fn();
    await expect(createBudgetOperation(request(), 'account', input).run('glm', 'model', provider)).rejects.toMatchObject({ code });
    expect(provider).not.toHaveBeenCalled();
  });
  it('fails closed when config is missing or Redis is unavailable', async () => {
    vi.stubEnv('BUDGET_GLOBAL_REQUEST_LIMIT', '');
    expect(() => createBudgetOperation(request(), 'account', input)).toThrow('BUDGET_NOT_CONFIGURED');
    vi.stubEnv('BUDGET_GLOBAL_REQUEST_LIMIT', '10'); vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Offline')));
    const provider = vi.fn(); await expect(createBudgetOperation(request(), 'account', input).run('glm', 'model', provider)).rejects.toThrow('BUDGET_UNAVAILABLE');
    expect(provider).not.toHaveBeenCalled();
  });
  it('counts each retry and reports a later quota rejection as already started', async () => {
    const { commands, fetcher } = redis(); const operation = createBudgetOperation(request(), 'account', input);
    await expect(operation.run('glm', 'model', async () => { throw new TypeError('Network lost'); })).rejects.toThrow('Network lost');
    expect(JSON.parse(commands[1][3]).status).toBe('uncertain');
    fetcher.mockResolvedValueOnce(Response.json({ result: [0, 'LIMIT'] }));
    const retry = vi.fn(); await expect(operation.run('glm', 'model', retry)).rejects.toMatchObject({ code: 'BUDGET_LIMIT_REACHED', requestStarted: true });
    expect(retry).not.toHaveBeenCalled();
  });
  it('makes at most two provider attempts even without enforced budgets in test mode', async () => {
    vi.stubEnv('RATE_LIMIT_PROVIDER', 'access-code-only'); vi.stubEnv('DEPLOYMENT_STAGE', 'test');
    const { commands } = redis(); const operation = createBudgetOperation(request(), undefined, input); const provider = vi.fn().mockResolvedValue('ok');
    await operation.run('glm', 'model', provider); await operation.run('glm', 'model', provider);
    await expect(operation.run('glm', 'model', provider)).rejects.toThrow('BUDGET_LIMIT_REACHED');
    expect(provider).toHaveBeenCalledTimes(2); expect(commands).toHaveLength(0);
    vi.stubEnv('DEPLOYMENT_STAGE', 'production');
    expect(() => createBudgetOperation(request(), undefined, input)).toThrow('BUDGET_NOT_CONFIGURED');
  });
  it('does not discard a provider result or retry it when final ledger update fails', async () => {
    const { fetcher } = redis(); fetcher.mockResolvedValueOnce(Response.json({ result: [1, 1] })).mockRejectedValueOnce(new Error('Write failed'));
    const provider = vi.fn().mockResolvedValue('result');
    expect(await createBudgetOperation(request(), 'account', input).run('glm', 'model', provider)).toBe('result');
    expect(provider).toHaveBeenCalledOnce(); await vi.waitFor(() => expect(console.error).toHaveBeenCalledWith('[BUDGET_LEDGER_WRITE_FAILED]', expect.any(Object)));
  });
  it('uses stable operation keys while separating accounts and chunk indices', async () => {
    const { commands } = redis();
    for (const [account, operationId] of [['first', 'recording:0'], ['first', 'recording:0'], ['first', 'recording:1'], ['second', 'recording:0']]) {
      await createBudgetOperation(request(), account, { ...input, operationId }).run('glm', 'model', async () => 'ok');
    }
    const keys = commands.filter(command => command[0] === 'EVAL').map(command => command[3]);
    expect(keys[0]).toBe(keys[1]); expect(keys[0]).not.toBe(keys[2]); expect(keys[0]).not.toBe(keys[3]);
  });
  it('exposes bounded errors and preserves ambiguity for duplicate work', () => {
    expect(budgetErrorResponse(new BudgetError('REQUEST_ALREADY_STARTED', true))).toEqual({ error: 'REQUEST_ALREADY_STARTED', requestStarted: true, status: 409 });
    expect(budgetErrorResponse(new Error('other'))).toBeNull();
  });
});

function wav(seconds = 1) {
  const bytes = new ArrayBuffer(44 + seconds * 32000); const view = new DataView(bytes);
  const tag = (at: number, value: string) => [...value].forEach((char, i) => view.setUint8(at + i, char.charCodeAt(0)));
  tag(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); tag(8, 'WAVE'); tag(12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  tag(36, 'data'); view.setUint32(40, bytes.byteLength - 44, true);
  return bytes;
}
describe('authoritative transcription duration', () => {
  it('derives milliseconds from actual PCM bytes', async () => {
    expect(await wavDurationMilliseconds(new File([wav(25)], 'fixture.wav'))).toBe(25000);
  });
  it.each([new ArrayBuffer(0), wav(26), new TextEncoder().encode('not WAV').buffer])('rejects invalid or overlong input', async bytes => {
    await expect(wavDurationMilliseconds(new File([bytes], 'fixture.wav'))).rejects.toThrow('INVALID_BUDGET_INPUT');
  });
  it('rejects forged duration and truncated headers', async () => {
    const bytes = wav(); new DataView(bytes).setUint32(28, 64000, true);
    await expect(wavDurationMilliseconds(new File([bytes], 'fixture.wav'))).rejects.toThrow('INVALID_BUDGET_INPUT');
    await expect(wavDurationMilliseconds(new File([wav().slice(0, 40)], 'fixture.wav'))).rejects.toThrow('INVALID_BUDGET_INPUT');
  });
});


describe('budget deadlines and attempt contract', () => {
  it('keeps the production Lua limit consistent with the shared provider cap', () => {
    expect(Number(RESERVE_ATTEMPT_SCRIPT.match(/attempt > (\d+)/)?.[1])).toBe(MAX_PROVIDER_ATTEMPTS);
  });
  it('blocks late provider work after cancellation during reservation', async () => {
    vi.useFakeTimers();
    let release!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { release = resolve; })));
    const controller = new AbortController(); const provider = vi.fn();
    const result = createBudgetOperation(request(), 'account', input).run('glm', 'model', provider, controller.signal);
    const rejected = expect(result).rejects.toThrow('BUDGET_UNAVAILABLE');
    await vi.advanceTimersByTimeAsync(1);
    controller.abort(new DOMException('Expired', 'TimeoutError')); await rejected;
    release(Response.json({ result: [1, 1] })); await vi.advanceTimersByTimeAsync(1);
    expect(provider).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it('stops before reserving or sending when the operation already expired', async () => {
    const { fetcher } = redis(); const provider = vi.fn();
    const signal = AbortSignal.abort(new DOMException('Expired', 'TimeoutError'));
    await expect(createBudgetOperation(request(), 'account', input).run('glm', 'model', provider, signal)).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(fetcher).not.toHaveBeenCalled(); expect(provider).not.toHaveBeenCalled();
  });
  it('bounds a stalled Redis response body and refuses the provider call', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => new Promise(() => {}) }));
    const provider = vi.fn();
    const result = createBudgetOperation(request(), 'account', input).run('glm', 'model', provider);
    const rejected = expect(result).rejects.toThrow('BUDGET_UNAVAILABLE');
    await vi.advanceTimersByTimeAsync(5000); await rejected;
    expect(provider).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
});


describe('nonblocking completion receipts', () => {
  it('returns received provider output without waiting on a stalled final ledger write', async () => {
    vi.useFakeTimers();
    const { fetcher } = redis();
    fetcher.mockResolvedValueOnce(Response.json({ result: [1, 1] })).mockImplementationOnce(() => new Promise(() => {}));
    const provider = vi.fn().mockResolvedValue('received');
    const operation = createBudgetOperation(request(), 'account', input);
    expect(await operation.run('glm', 'model', provider)).toBe('received');
    expect(provider).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(5000);
    expect(console.error).toHaveBeenCalledWith('[BUDGET_LEDGER_WRITE_FAILED]', expect.any(Object));
    expect(vi.getTimerCount()).toBe(0);
  });
});


describe('budget receipt correlation', () => {
  it('links reserved and final receipts to the same counters without exposing original identities', async () => {
    const { commands } = redis();
    const accountId = 'private-account-fixture'; const sessionId = 'private-session-fixture'; const operationId = 'private-operation-fixture';
    await createBudgetOperation(request(), accountId, { ...input, sessionId, operationId }).run('glm', 'fixture', async () => 'ok');
    const command = commands[0]; const reserved = JSON.parse(command.at(-1)); const final = JSON.parse(commands[1][3]);
    const identity = { subjectHash: reserved.subjectHash, sessionHash: reserved.sessionHash, operation: reserved.operation, capability: 'transcription', attempt: 1 };
    for (const name of ['subjectHash', 'sessionHash', 'operation']) expect(reserved[name]).toMatch(/^[a-f0-9]{64}$/);
    expect(command[3]).toBe(`{oral-budget}:v1:operation:${reserved.operation}`);
    expect(command[4]).toContain(`:account:${reserved.subjectHash}:`);
    expect(command[6]).toBe(`{oral-budget}:v1:session:${reserved.sessionHash}`);
    expect(reserved).toMatchObject({ ...identity, status: 'reserved' });
    expect(final).toMatchObject({ ...identity, status: 'succeeded' });
    expect(console.info).toHaveBeenCalledWith('[PROVIDER_ATTEMPT]', expect.objectContaining(identity));
    const output = JSON.stringify([commands, vi.mocked(console.info).mock.calls]);
    for (const privateValue of [accountId, sessionId, operationId, 'synthetic-code', 'synthetic-not-a-key']) expect(output).not.toContain(privateValue);
  });
  it('groups chunks and evaluation under one session while separating different accounts and sessions', async () => {
    const { commands } = redis();
    const cases = [
      { account: 'first', sessionId: 'one', operationId: 'chunk:0', capability: 'transcription' as const },
      { account: 'first', sessionId: 'one', operationId: 'chunk:1', capability: 'transcription' as const },
      { account: 'first', sessionId: 'one', operationId: 'evaluation', capability: 'evaluation' as const },
      { account: 'first', sessionId: 'two', operationId: 'chunk:0', capability: 'transcription' as const },
      { account: 'second', sessionId: 'one', operationId: 'chunk:0', capability: 'transcription' as const },
    ];
    for (const { account, ...value } of cases) await createBudgetOperation(request(), account, { ...input, ...value }).run('glm', 'fixture', async () => 'ok');
    const receipts = commands.filter(command => command[0] === 'EVAL').map(command => JSON.parse(command.at(-1)));
    expect(new Set(receipts.slice(0, 3).map(receipt => receipt.sessionHash)).size).toBe(1);
    expect(new Set(receipts.slice(0, 3).map(receipt => receipt.operation)).size).toBe(3);
    expect(receipts[2].capability).toBe('evaluation');
    expect(receipts[3].sessionHash).not.toBe(receipts[0].sessionHash);
    expect(receipts[3].subjectHash).toBe(receipts[0].subjectHash);
    expect(receipts[4].subjectHash).not.toBe(receipts[0].subjectHash);
    expect(receipts[4].sessionHash).not.toBe(receipts[0].sessionHash);
  });
  it('preserves operation and session identity for an uncertain attempt and its retry', async () => {
    const { commands } = redis(); const operation = createBudgetOperation(request(), 'account', input);
    await expect(operation.run('glm', 'fixture', async () => { throw new Error('Interrupted'); })).rejects.toThrow('Interrupted');
    await operation.run('glm', 'fixture', async () => 'ok');
    const receipts = commands.filter(command => command[0] === 'HSET').map(command => JSON.parse(command[3]));
    expect(receipts.map(receipt => [receipt.attempt, receipt.status])).toEqual([[1, 'uncertain'], [2, 'succeeded']]);
    for (const name of ['subjectHash', 'sessionHash', 'operation', 'capability']) expect(receipts[1][name]).toBe(receipts[0][name]);
  });
  it('correlates shared-code test sessions without implying an enforced budget or known cost', async () => {
    vi.stubEnv('RATE_LIMIT_PROVIDER', 'access-code-only'); vi.stubEnv('DEPLOYMENT_STAGE', 'test');
    const { fetcher } = redis();
    for (const operationId of ['chunk:0', 'chunk:1']) await createBudgetOperation(request(), undefined, { ...input, operationId }).run('glm', 'fixture', async () => 'ok');
    const records = vi.mocked(console.info).mock.calls.map(call => call[1]);
    expect(records[0]).toMatchObject({ enforced: false, estimatedMicroUsd: null, capability: 'transcription' });
    expect(records[1].sessionHash).toBe(records[0].sessionHash);
    expect(records[1].subjectHash).toBe(records[0].subjectHash);
    expect(records[1].operation).not.toBe(records[0].operation);
    expect(JSON.stringify(records)).not.toContain('synthetic-code');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
