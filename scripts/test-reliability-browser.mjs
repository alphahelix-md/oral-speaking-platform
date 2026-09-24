// Local-only browser fault checks. No dependencies and no live model requests.
// Start `next start --hostname 127.0.0.1 --port 3417`, then run this script.
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const origin = process.env.ORAL_TEST_ORIGIN || 'http://127.0.0.1:3417';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) throw new Error('Local test origin required');
const output = resolve('.codex/qa', `reliability-${Date.now()}`);
await mkdir(output, { recursive: true });
// Keep locked Chromium profile files outside Tailwind's project source scan.
const profile = await mkdtemp(join(tmpdir(), 'oral-reliability-'));
const browser = spawn(process.env.ORAL_TEST_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--disable-sync', '--disable-background-networking', '--autoplay-policy=no-user-gesture-required', 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket; let command;
const checks = [];
try {
  let port;
  for (let i = 0; i < 100; i++) { try { port = (await readFile(`${profile}/DevToolsActivePort`, 'utf8')).split('\n')[0]; break; } catch { await sleep(100); } }
  assert.ok(port, 'Browser debugging port is available');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let serial = 0; const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) { const job = pending.get(message.id); pending.delete(message.id); message.error ? job?.reject(new Error(JSON.stringify(message.error))) : job?.resolve(message.result); }
    if (message.method === 'Page.javascriptDialogOpening') void send('Page.handleJavaScriptDialog', { accept: true });
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 10000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
  command = send;
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  const wait = async (expression, label = expression) => {
    for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await sleep(100); }
    throw new Error(`Timed out: ${label}`);
  };
  const click = async selector => { await wait(`document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled`); await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); };
  const text = async value => {
    await evaluate(`{ const input = document.querySelector('#transcript'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); }`);
    await wait(`document.querySelector('#transcript').value === ${JSON.stringify(value)}`);
  };
  const sessions = () => evaluate(`JSON.parse(localStorage.getItem('oral.sessions.v1') || '[]')`);
  const reload = async () => { console.log('STEP reload'); await send('Page.reload'); await wait(`document.querySelector('.hero') && window.__qa && window.history.state?.oralPage === 'home'`); };
  const resume = async () => { await click('.recent-card'); await wait(`document.querySelector('.speaking-body') && !document.querySelector('.finish-link').disabled`); };
  const resumeDraft = async () => { console.log('STEP resume draft'); await click('.recent-card'); await wait(`document.querySelector('#transcript') && !document.querySelector('#transcript').disabled`); };
  const begin = async () => { await click('.language-card.en'); await click('.mode-card'); await click('.primary-button'); await wait(`document.querySelector('#transcript')`); };
  const record = async () => {
    await click('.mic-button'); await wait(`document.querySelector('.stop-button')`); await sleep(1200); await click('.stop-button');
  };
  const passed = name => { checks.push(name); console.log(`PASS ${name}`); };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__qa = { stt: 0, evaluations: 0, mode: 'ok', storageFull: false, audioFull: false, decodeFails: false };
    const realFetch = window.fetch;
    window.fetch = async function(input, init) {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (url.pathname === '/api/transcribe') {
        window.__qa.stt++;
        if (window.__qa.mode === 'hold-stt') return new Promise(() => {});
        return new Response(JSON.stringify({ text: 'A synthetic answer from the browser test.', provider: 'glm' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.pathname === '/api/ai') {
        window.__qa.evaluations++;
        if (window.__qa.mode === 'hold-evaluation') return new Promise(() => {});
        return new Response(JSON.stringify({ evaluation: { summary: 'Synthetic feedback', scores: [], strengths: [], improvements: [], weaknesses: [], model: 'ai' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.pathname.startsWith('/api/') || url.origin !== location.origin) return new Response('{}', { status: 503 });
      return realFetch.call(this, input, init);
    };
    const realSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (window.__qa.storageFull && key === 'oral.sessions.v1') throw new DOMException('Test storage full', 'QuotaExceededError');
      return realSet.call(this, key, value);
    };
    const realPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, key) {
      if (window.__qa.audioFull && this.name === 'records') throw new DOMException('Test audio full', 'QuotaExceededError');
      return realPut.call(this, value, key);
    };
    const realDecode = AudioContext.prototype.decodeAudioData;
    AudioContext.prototype.decodeAudioData = function(...args) { if (window.__qa.decodeFails) return Promise.reject(new Error('Test conversion failure')); return realDecode.apply(this, args); };
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext(); const destination = context.createMediaStreamDestination();
      const oscillator = context.createOscillator(); oscillator.connect(destination); oscillator.start(); await context.resume();
      return destination.stream;
    };
    window.SpeechRecognition = undefined; window.webkitSpeechRecognition = undefined;
  ` });
  await send('Page.navigate', { url: origin }); await wait(`document.querySelector('.hero') && window.history.state?.oralPage === 'home'`);
  console.log('STEP first draft'); await begin(); await text('Edited text must survive refresh');
  const first = (await sessions())[0]; assert.equal(first.draft.transcript, 'Edited text must survive refresh');
  await reload(); await resumeDraft();
  assert.equal(await evaluate(`document.querySelector('#transcript').value`), first.draft.transcript);
  assert.equal((await sessions())[0].draft.turnId, first.draft.turnId);
  passed('typed draft and stable turn ID survive browser refresh');
  await evaluate(`{ const button = document.querySelector('.submit-button'); button.click(); button.click(); }`);
  await wait(`JSON.parse(localStorage.getItem('oral.sessions.v1'))[0].turns.length === 1`);
  assert.equal((await sessions())[0].turns[0].id, first.draft.turnId);
  await reload(); await resumeDraft();
  assert.equal((await sessions())[0].turns.length, 1); assert.equal(await evaluate(`document.querySelector('#transcript').value`), '');
  passed('double submit creates exactly one answer and restores next question');

  await text('Retain after quota failure'); await evaluate(`window.__qa.storageFull = true`); await click('.submit-button');
  await wait(`document.querySelector('[role="alert"]')`);
  assert.equal(await evaluate(`document.querySelector('#transcript').value`), 'Retain after quota failure');
  assert.equal((await sessions())[0].turns.length, 1);
  await evaluate(`window.__qa.storageFull = false`); await click('.submit-button');
  await wait(`JSON.parse(localStorage.getItem('oral.sessions.v1'))[0].turns.length === 2`);
  passed('submission storage failure retains input and retry adds one answer');

  await evaluate(`window.__qa.mode = 'hold-stt'`); await record();
  await wait(`window.__qa.stt === 1`);
  const inFlight = (await sessions())[0]; assert.equal(inFlight.draft.audioStatus, 'verified');
  assert.equal(inFlight.draft.chunks[0].status, 'running');
  const audioId = inFlight.draft.audioId;
  const verifyRaw = id => evaluate(`(async () => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('oral-audio-v1', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const raw = await new Promise(resolve => { const r = db.transaction('records').objectStore('records').get(${JSON.stringify(id)}); r.onsuccess = () => resolve(r.result); }); db.close();
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await raw.blob.arrayBuffer())), b => b.toString(16).padStart(2, '0')).join('');
    return { hash, expected: raw.metadata.sha256, type: raw.blob.type, size: raw.blob.size, kind: raw.metadata.kind };
  })()`);
  const raw = await verifyRaw(audioId); assert.equal(raw.hash, raw.expected); assert.equal(raw.kind, 'original'); assert.ok(raw.size > 0);
  await reload(); await resumeDraft();
  await wait(`document.querySelector('audio')?.readyState >= 1`);
  assert.equal(await evaluate(`window.__qa.stt`), 0);
  assert.equal((await sessions())[0].draft.audioId, audioId);
  assert.equal((await sessions())[0].draft.chunks[0].status, 'uncertain');
  await evaluate(`document.querySelector('audio').play()`); await wait(`!document.querySelector('audio').paused`);
  passed('raw bytes verify and audio replays after refresh during transcription; no request repeats');
  await click('.submit-button'); await wait(`JSON.parse(localStorage.getItem('oral.sessions.v1'))[0].turns.length === 3`);
  assert.equal((await sessions())[0].turns[2].audioId, audioId);
  assert.equal((await sessions())[0].turns[2].transcript, '');
  passed('untranscribed audio can be submitted through free manual fallback');

  await evaluate(`window.__qa.mode = 'hold-evaluation'`); await click('.finish-link');
  await wait(`window.__qa.evaluations === 1`);
  await reload(); await resume(); await click('.finish-link');
  await wait(`document.querySelector('.result-intro')`);
  assert.equal(await evaluate(`window.__qa.evaluations`), 0); assert.equal((await sessions())[0].evaluation.model, 'unavailable');
  passed('evaluation interrupted by refresh finishes without repeating the billed request');

  // Fresh practice; corrupt decoder must not endanger the original recording.
  await reload(); await begin(); await evaluate(`window.__qa.decodeFails = true`); await record();
  await wait(`document.querySelector('#transcript') && !document.querySelector('#transcript').disabled`);
  const conversion = (await sessions())[0]; assert.equal(conversion.draft.audioStatus, 'verified');
  assert.equal(await evaluate(`window.__qa.stt`), 0); assert.equal((await verifyRaw(conversion.draft.audioId)).kind, 'original');
  await reload(); await resumeDraft(); assert.equal((await sessions())[0].draft.audioId, conversion.draft.audioId);
  passed('conversion failure preserves verified original and recoverable draft');

  await evaluate(`window.__qa.audioFull = true`); await record();
  await wait(`document.querySelector('.unsaved-download') && !document.querySelector('.mic-button').disabled`);
  const failed = (await sessions())[0]; assert.equal(failed.draft.audioStatus, 'failed');
  const downloadedType = await evaluate(`fetch(document.querySelector('.unsaved-download').href).then(response => response.blob()).then(blob => blob.type)`);
  assert.ok(downloadedType.includes('webm') || downloadedType.includes('mp4'));
  assert.equal(await evaluate(`window.__qa.stt`), 0);
  await evaluate(`window.__qa.audioFull = false`); await click('.submit-button');
  await wait(`JSON.parse(localStorage.getItem('oral.sessions.v1'))[0].turns.length === 1`);
  passed('raw storage failure exposes original download and allows verified retry');
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(`${output}/final.png`, Buffer.from(screenshot.data, 'base64'));
  await writeFile(`${output}/results.json`, JSON.stringify({ checks, paidRequests: 0 }, null, 2));
  console.log(`Browser checks passed: ${checks.length}; artifacts: ${output}`);
  await send('Browser.close');
} catch (error) {
  if (command) {
    const screenshot = await command('Page.captureScreenshot', { format: 'png' }).catch(() => null);
    if (screenshot) await writeFile(`${output}/failure.png`, Buffer.from(screenshot.data, 'base64'));
    const state = await command('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true }).catch(() => null);
    await writeFile(`${output}/failure.txt`, String(error) + '\n' + (state?.result?.value || ''));
  }
  if (command) await command('Browser.close').catch(() => undefined);
  console.error(`Failure artifacts: ${output}`); throw error;
} finally { socket?.close(); browser.kill(); }
