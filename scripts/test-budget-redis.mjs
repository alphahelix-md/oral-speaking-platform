// Manual real-Redis acceptance. No .env files are loaded and no Provider is called.
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import ts from 'typescript';

const source = await readFile(new URL('../lib/ai/budget.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('budget.ts', source, ts.ScriptTarget.Latest, true);
let script;
function find(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'RESERVE_ATTEMPT_SCRIPT' && ts.isNoSubstitutionTemplateLiteral(node.initializer)) script = node.initializer.text;
  ts.forEachChild(node, find);
}
find(ast);
if (!script) throw new Error('Production Lua script could not be extracted');
const scriptSha256 = createHash('sha256').update(script).digest('hex');
if (process.argv.includes('--check')) {
  console.log(JSON.stringify({ mode: 'offline-check', scriptSha256, networkRequests: 0 }));
  process.exit(0);
}
if (!process.argv.includes('--run') || process.env.ORAL_REDIS_TEST_ACK !== 'isolated-test-database') {
  console.error('Manual run requires --run and ORAL_REDIS_TEST_ACK=isolated-test-database. Use --check for an offline check.');
  process.exit(2);
}
const endpoint = process.env.ORAL_REDIS_TEST_URL;
const token = process.env.ORAL_REDIS_TEST_TOKEN;
try {
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !token) throw new Error();
} catch {
  console.error('Set a dedicated HTTPS test database URL and token in ORAL_REDIS_TEST_URL / ORAL_REDIS_TEST_TOKEN.');
  process.exit(2);
}
const prefix = `{oral-budget-qa-${randomUUID()}}:`;
const created = new Set(); let commandCount = 0; let passed = 0;
function check(condition, label) { if (!condition) throw new Error(label); }
async function redis(command) {
  commandCount++;
  let response;
  try {
    response = await fetch(endpoint.replace(/\/$/, ''), { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(command), signal: AbortSignal.timeout(10000) });
  } catch { throw new Error('Redis network/timeout failure'); }
  if (!response.ok) throw new Error(`Redis HTTP ${response.status}`);
  let data; try { data = await response.json(); } catch { throw new Error('Invalid Redis response'); }
  if (data.error || !('result' in data)) throw new Error('Redis command failed');
  return data.result;
}
const key = (name) => { const value = prefix + name; created.add(value); return value; };
const counters = (name) => ['account', 'global', 'session'].map(scope => key(`${name}:${scope}`));
const generous = () => [1000, 1000000, 1000000, 1000, 1000000, 1000000, 1000, 1000000, 1000000];
async function reserve(operation, owner, attempt, buckets, limits = generous()) {
  return redis(['EVAL', script, 4, operation, ...buckets, owner, attempt, 1000, 10, ...limits, JSON.stringify({ provider: 'fixture', model: 'no-provider-call', status: 'reserved' })]);
}
async function totals(buckets, expected) {
  for (const bucket of buckets) {
    const result = await redis(['HMGET', bucket, 'calls', 'audio_ms', 'estimated_micro_usd']);
    check(Array.isArray(result) && result.map(Number).join(',') === [expected, expected * 1000, expected * 10].join(','), 'Atomic counter totals differ');
  }
}
function pass(name) { passed++; console.log(JSON.stringify({ test: name, status: 'passed' })); }
try {
  const buckets = counters('duplicate'); const operation = key('duplicate:operation');
  const duplicates = await Promise.allSettled(Array.from({ length: 24 }, () => reserve(operation, randomUUID(), 1, buckets)));
  check(duplicates.every(item => item.status === 'fulfilled'), 'Duplicate concurrency request failed');
  const values = duplicates.map(item => item.value);
  check(values.filter(value => value[0] === 1).length === 1 && values.filter(value => value[1] === 'DUPLICATE').length === 23, 'Concurrent duplicate ownership failed');
  await totals(buckets, 1); pass('concurrent-duplicate');

  for (let scope = 0; scope < 3; scope++) {
    for (let metric = 0; metric < 3; metric++) {
      const name = `limit-${scope}-${metric}`; const group = counters(name); const limits = generous();
      limits[scope * 3 + metric] = [3, 3000, 30][metric];
      const attempts = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => reserve(key(`${name}:operation:${index}`), randomUUID(), 1, group, limits)));
      check(attempts.every(item => item.status === 'fulfilled'), 'Limit concurrency request failed');
      const outcomes = attempts.map(item => item.value);
      check(outcomes.filter(value => value[0] === 1).length === 3 && outcomes.filter(value => value[1] === 'LIMIT').length === 5, `Concurrent limit failed: scope ${scope}, metric ${metric}`);
      await totals(group, 3); pass(name);
    }
  }
  const retryBuckets = counters('retry'); const retryOperation = key('retry:operation'); const owner = randomUUID();
  check((await reserve(retryOperation, owner, 2, retryBuckets))[1] === 'DUPLICATE', 'Out-of-order attempt accepted');
  check((await reserve(retryOperation, owner, 1, retryBuckets))[0] === 1, 'First attempt refused');
  check((await reserve(retryOperation, owner, 2, retryBuckets))[0] === 1, 'Internal retry refused');
  check((await reserve(retryOperation, owner, 3, retryBuckets))[1] === 'DUPLICATE', 'Third attempt accepted');
  await totals(retryBuckets, 2); pass('retry-charged-twice');
  for (const [entry, seconds] of [[retryOperation, 604800], [retryBuckets[0], 172800], [retryBuckets[1], 172800], [retryBuckets[2], 604800]]) {
    const ttl = Number(await redis(['TTL', entry])); check(ttl > seconds - 120 && ttl <= seconds, 'Retention TTL differs');
  }
  pass('retention-ttl');
  console.log(JSON.stringify({ status: 'passed', passed, scriptSha256, note: 'Lua only; HTTP route timeouts and actual billing still need separate acceptance.' }));
} catch (error) {
  console.error(JSON.stringify({ status: 'failed', passed, error: error.message })); process.exitCode = 1;
} finally {
  try {
    const keys = [...created];
    check(keys.every(value => value.startsWith(prefix)), 'Cleanup key ownership check failed');
    for (let at = 0; at < keys.length; at += 100) await redis(['DEL', ...keys.slice(at, at + 100)]);
    console.log(JSON.stringify({ cleanup: 'passed', commandCount }));
  } catch {
    console.error(JSON.stringify({ cleanup: 'failed', note: 'Only this run’s random test keys may remain; reservation keys expire within seven days.' })); process.exitCode = 1;
  }
}
