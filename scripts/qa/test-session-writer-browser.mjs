// Isolated browser API check: no product API, account, provider or user profile.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import ts from 'typescript';

const sources = Object.fromEntries(await Promise.all(['write-access', 'storage'].map(async name => [name, await readFile(new URL(`../../core/session/${name}.ts`, import.meta.url), 'utf8')])));
const modules = Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText]));
const html = `<!doctype html><title>Isolated writer check</title><script type="module">
import { observeSessionWriteAccess } from '/write-access';
import { saveSession, getSessions, deleteSessions } from '/storage';
window.qa = { status: 'starting', saveSession, getSessions, deleteSessions };
window.qa.release = observeSessionWriteAccess(window, navigator.locks, status => window.qa.status = status);
</script>`;
const server = http.createServer((request, response) => {
  const key = request.url.slice(1);
  response.setHeader('Content-Type', key in modules ? 'text/javascript' : 'text/html');
  response.end(key in modules ? modules[key] : html);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(join(tmpdir(), 'oral-writer-qa-'));
const output = resolve('.codex/qa', `session-writer-${Date.now()}`); await mkdir(output, { recursive: true });
const browser = spawn(process.env.ORAL_TEST_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--disable-sync', '--disable-background-networking', 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
let processError; browser.on('error', error => { processError = error.code || 'BROWSER_START_FAILED'; });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const sockets = []; const checks = []; let port;
const report = { status: 'running', checks, sourceSha256: Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, createHash('sha256').update(source).digest('hex')])), providerRequests: 0, evidence: 'Isolated desktop browser API check, not phone/UI acceptance' };
async function connection(url) {
  const socket = new WebSocket(url); sockets.push(socket);
  await Promise.race([new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; }), sleep(5000).then(() => { throw new Error('WebSocket open timeout'); })]);
  let serial = 0; const pending = new Map();
  socket.onmessage = event => { const data = JSON.parse(event.data); if (data.id) { const job = pending.get(data.id); pending.delete(data.id); if (job) { clearTimeout(job.timer); data.error ? job.reject(new Error(data.error.message)) : job.resolve(data.result); } } };
  return (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial; const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout ' + method)); }, 5000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
}
async function tab() {
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(origin)}`, { method: 'PUT' })).json();
  const send = await connection(target.webSocketDebuggerUrl);
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error('Browser script exception'); return result.result.value;
  };
  const wait = async expression => { for (let i = 0; i < 80; i++) { if (await evaluate(expression)) return; await sleep(100); } throw new Error('Browser state timeout: ' + expression); };
  await wait('Boolean(window.qa)');
  return { send, evaluate, wait, close: () => fetch(`http://127.0.0.1:${port}/json/close/${target.id}`) };
}
try {
  for (let i = 0; i < 100; i++) { if (processError) throw new Error(processError); try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await sleep(100); } }
  assert.ok(port, 'Browser debugging port');
  const first = await tab(); await first.wait("qa.status === 'ready'");
  report.browser = await first.evaluate('navigator.userAgent');
  await first.evaluate(`qa.saveSession({id:'qa-session', language:'en', mode:'daily', level:'Beginner', topic:'Food', status:'listening', question:'Synthetic original', turns:[], startedAt:new Date().toISOString()})`);
  const second = await tab(); await second.wait("qa.status === 'waiting'");
  assert.equal(await second.evaluate(`(() => { try { qa.saveSession({...qa.getSessions()[0], question:'Overwrite'}); return 'unexpected'; } catch(e) { return e.message; } })()`), 'SESSION_WRITER_UNAVAILABLE');
  assert.equal(await second.evaluate(`(() => { try { qa.deleteSessions(['qa-session']); return 'unexpected'; } catch(e) { return e.message; } })()`), 'SESSION_WRITER_UNAVAILABLE');
  assert.equal(await first.evaluate('qa.getSessions()[0].question'), 'Synthetic original'); checks.push('second-window-writes-and-deletes-blocked');
  await first.close(); await second.wait("qa.status === 'ready'");
  assert.equal(await second.evaluate(`qa.saveSession({...qa.getSessions()[0], question:'New owner'}).revision`), 2); checks.push('owner-close-transfers-lock-and-preserves-history');
  const third = await tab(); await third.wait("qa.status === 'waiting'"); await third.close();
  const fourth = await tab(); await fourth.wait("qa.status === 'waiting'"); await second.close(); await fourth.wait("qa.status === 'ready'"); checks.push('closed-waiter-does-not-block-next-window');
  const timeOrigin = await fourth.evaluate('performance.timeOrigin'); await fourth.send('Page.reload');
  await fourth.wait(`performance.timeOrigin !== ${timeOrigin} && window.qa && qa.status === 'ready'`);
  assert.equal(await fourth.evaluate('qa.getSessions()[0].question'), 'New owner'); checks.push('refresh-reacquires-lock-with-saved-history');
  await fourth.send('Page.navigate', { url: 'about:blank' }); await fourth.wait("location.href === 'about:blank'");
  const fifth = await tab(); await fifth.wait("qa.status === 'ready'");
  const history = await fourth.send('Page.getNavigationHistory');
  const prior = history.entries.find(item => item.url.startsWith(origin)); assert.ok(prior, 'Prior local test page');
  await fourth.send('Page.navigateToHistoryEntry', { entryId: prior.id }); await fourth.wait("window.qa && qa.status === 'waiting'");
  assert.equal(await fourth.evaluate(`(() => { try { qa.saveSession(qa.getSessions()[0]); return 'unexpected'; } catch(e) { return e.message; } })()`), 'SESSION_WRITER_UNAVAILABLE');
  await fifth.close(); await fourth.wait("qa.status === 'ready'"); checks.push('back-forward-navigation-reacquires-before-writing');
  await fourth.evaluate('qa.release()');
  assert.equal(await fourth.evaluate(`(() => { try { qa.saveSession(qa.getSessions()[0]); return 'unexpected'; } catch(e) { return e.message; } })()`), 'SESSION_WRITER_UNAVAILABLE'); checks.push('disposed-owner-cannot-write');
  report.status = 'passed'; console.log(JSON.stringify({ status: report.status, checks, output }));
} catch (error) {
  report.status = 'failed'; report.error = error instanceof Error ? error.message : 'Unknown failure'; process.exitCode = 1;
  console.error(JSON.stringify({ status: report.status, error: report.error, output }));
} finally {
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  sockets.forEach(socket => socket.close()); browser.kill(); server.close();
}
