// Browser service failure checks against an existing local production build.
// Uses existing Playwright/Chromium; isolated profiles, synthetic audio, mocked APIs.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const origin = process.env.ORAL_TEST_ORIGIN || 'http://127.0.0.1:3421';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) throw new Error('Local test origin required');
const require = createRequire(process.env.ORAL_PLAYWRIGHT_MODULES ? join(resolve(process.env.ORAL_PLAYWRIGHT_MODULES), '_oral_loader.cjs') : import.meta.url);
const { chromium } = require('playwright');
const output = resolve(process.env.ORAL_SERVICE_OUTPUT || '.codex/qa/service-faults/' + Date.now());
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.ORAL_TEST_BROWSER ? { executablePath: process.env.ORAL_TEST_BROWSER } : {}) });
const report = { startedAt: new Date().toISOString(), scope: 'Isolated Chromium; synthetic audio and mocked API errors/timeouts; not live provider or Redis validation', origin, realProviderRequests: 0, cases: [] };
const transcript = 'Synthetic recording for storage recovery.';
const allCases = ['stt-budget', 'stt-auth', 'stt-provider-error', 'stt-timeout', 'evaluation-budget', 'evaluation-invalid-json', 'evaluation-timeout'];
const selectedCases = process.env.ORAL_SERVICE_CASE ? [process.env.ORAL_SERVICE_CASE] : allCases;
assert.ok(selectedCases.every(mode => allCases.includes(mode)), 'Unknown storage case');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
try {
  for (const mode of selectedCases) {
    const item = { mode, passed: false, mockedRequests: {}, externalRequestsBlocked: 0, pageErrors: [], checks: [] };
    report.cases.push(item);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    page.on('pageerror', error => item.pageErrors.push(error.message));
    let releaseHanging;
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { item.externalRequestsBlocked++; return route.abort(); }
      if (url.pathname.startsWith('/api/')) {
        item.mockedRequests[url.pathname] = (item.mockedRequests[url.pathname] || 0) + 1;
        if (url.pathname === '/api/transcribe') {
          if (mode === 'stt-timeout') {
            await new Promise(resolve => { releaseHanging = resolve; });
            return route.abort().catch(() => {});
          }
          const failure = mode === 'stt-budget' ? [429, 'BUDGET_LIMIT_REACHED', false]
            : mode === 'stt-auth' ? [401, 'AUTH_REQUIRED', false]
            : mode === 'stt-provider-error' ? [502, 'TRANSCRIPTION_FAILED', true] : null;
          return route.fulfill({ status: failure ? failure[0] : 200, contentType: 'application/json', body: JSON.stringify(failure ? { error: failure[1], requestStarted: failure[2] } : { text: transcript, provider: 'mock' }) });
        }
        if (url.pathname === '/api/ai') {
          if (mode === 'evaluation-timeout') {
            await new Promise(resolve => { releaseHanging = resolve; });
            return route.abort().catch(() => {});
          }
          return route.fulfill({ status: mode === 'evaluation-budget' ? 429 : 200, contentType: 'application/json', body: mode === 'evaluation-budget' ? JSON.stringify({ error: 'BUDGET_LIMIT_REACHED', requestStarted: false }) : '{broken json' });
        }
        return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
      }
      return route.continue();
    });
    await context.addInitScript(mode => {
      localStorage.setItem('oral-ui-language', 'en');
      sessionStorage.setItem('oral-beta-access-code', 'local-storage-qa');
      window.__storageQA = { mode, sessionFull: false, audioFault: mode.startsWith('raw-'), raw: null, faultCount: 0 };
      const originalSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === 'oral.sessions.v1' && window.__storageQA.sessionFull) {
          window.__storageQA.faultCount++;
          throw new DOMException('Injected session quota failure', 'QuotaExceededError');
        }
        return originalSet.call(this, key, value);
      };
      const originalPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(value, key) {
        if (this.name === 'records' && value?.metadata?.kind === 'original' && window.__storageQA.audioFault) {
          window.__storageQA.faultCount++;
          if (mode === 'raw-put-quota') throw new DOMException('Injected audio quota failure', 'QuotaExceededError');
          const request = originalPut.call(this, value, key);
          const transaction = this.transaction;
          queueMicrotask(() => transaction.abort());
          return request;
        }
        return originalPut.call(this, value, key);
      };
      const Recorder = window.MediaRecorder;
      window.MediaRecorder = class extends Recorder {
        constructor(stream, options) {
          super(stream, options);
          const chunks = [];
          this.addEventListener('dataavailable', event => { if (event.data.size) chunks.push(event.data); });
          this.addEventListener('stop', () => { window.__storageQA.raw = new Blob(chunks, { type: this.mimeType }); });
        }
      };
      window.SpeechRecognition = undefined; window.webkitSpeechRecognition = undefined;
      if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
      navigator.mediaDevices.getUserMedia = async () => {
        const audio = new AudioContext(); const destination = audio.createMediaStreamDestination();
        const oscillator = audio.createOscillator(); oscillator.connect(destination); oscillator.start(); await audio.resume();
        return destination.stream;
      };
    }, mode);
    const sessions = () => page.evaluate(() => JSON.parse(localStorage.getItem('oral.sessions.v1') || '[]'));
    const capture = name => page.screenshot({ path: join(output, `${mode}-${name}.png`), fullPage: true });
    const download = async (locator, name) => {
      const event = page.waitForEvent('download'); await locator.click(); const file = await event;
      const target = join(output, `${mode}-${name}`); await file.saveAs(target); return readFile(target);
    };
    const readRaw = id => page.evaluate(async id => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('oral-audio-v1', 1);
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      const entry = await new Promise((resolve, reject) => {
        const tx = db.transaction('records'); const request = tx.objectStore('records').get(id);
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      db.close(); if (!entry) return null;
      const digest = await crypto.subtle.digest('SHA-256', await entry.blob.arrayBuffer());
      return { size: entry.blob.size, type: entry.blob.type, metadata: entry.metadata, hash: [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('') };
    }, id);
    try {
      await page.goto(origin);
      await page.locator('.language-card.en').click();
      await page.locator('.mode-card').filter({ hasText: 'Daily' }).click();
      await page.locator('.primary-button').click();
      await page.locator('#transcript').waitFor();
      await page.locator('.mic-button').click();
      await page.locator('.stop-button').waitFor();
      await page.waitForTimeout(1300);
      await page.locator('.stop-button').click();
      await page.waitForFunction(() => window.__storageQA.raw?.size > 0 && document.querySelector('.audio-player') && !document.querySelector('.mic-button').disabled && !document.querySelector('#transcript').disabled, undefined, { timeout: 75_000 });
      const before = (await sessions())[0]; const audioId = before.draft.audioId;
      assert.ok(audioId);
      const original = await page.evaluate(async () => {
        const blob = window.__storageQA.raw;
        const bytes = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
        return { size: blob.size, type: blob.type, hash: [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('') };
      });
      item.original = original;
      const noText = mode.startsWith('stt-');
      assert.equal(before.draft.audioStatus, 'verified');
      assert.equal((await readRaw(audioId)).hash, original.hash);
      assert.equal(await page.locator('#transcript').inputValue(), noText ? '' : transcript);
      assert.equal(item.mockedRequests['/api/transcribe'], 1);
      if (noText) {
        await page.locator('.notice[role=status]').filter({ hasText: /limit was reached|Sign in by email|Speech transcription failed|Processing was interrupted/i }).waitFor();
        assert.equal(before.draft.chunks.length, ['stt-budget', 'stt-auth'].includes(mode) ? 0 : 1);
        if (before.draft.chunks.length) assert.equal(before.draft.chunks[0].status, 'uncertain');
        await capture('speech-failed');
        await page.reload(); releaseHanging?.();
        await page.locator('.unfinished-entry').click(); await page.locator('.unfinished-card').first().click();
        await page.locator('#transcript').waitFor();
        assert.equal(item.mockedRequests['/api/transcribe'], 1);
        assert.equal((await readRaw(audioId)).hash, original.hash);
        item.checks.push('STT failure retains verified original and correct not-started/uncertain state', 'Reload does not automatically repeat STT');
      }
      await page.locator('.submit-button').click();
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('oral.sessions.v1') || '[]')[0]?.turns.length === 1);
      const finishStarted = Date.now();
      await page.getByRole('button', { name: 'Finish', exact: true }).click();
      await page.locator('.feedback-card').filter({ hasText: 'Unscored review' }).waitFor({ timeout: 35_000 });
      item.finishMilliseconds = Date.now() - finishStarted;
      assert.ok(item.finishMilliseconds < 32_000, 'Finishing must respect client deadline with rendering tolerance');
      assert.equal(await page.locator('.score-list').count(), 0);
      const saved = (await sessions())[0];
      assert.equal(saved.turns.length, 1); assert.equal(saved.turns[0].id, before.draft.turnId);
      assert.equal(saved.turns[0].audioId, audioId); assert.equal(saved.turns[0].transcript, noText ? '' : transcript);
      assert.equal(saved.evaluation.model, 'unavailable'); assert.deepEqual(saved.evaluation.scores, []);
      assert.equal(saved.evaluationRun.status, 'degraded'); assert.equal(saved.draft, undefined);
      assert.equal(item.mockedRequests['/api/ai'] || 0, noText ? 0 : 1);
      await capture('unscored');
      await page.reload(); releaseHanging?.(); await page.locator('.language-card.en').waitFor();
      const reloaded = (await sessions())[0];
      assert.equal(reloaded.turns.length, 1); assert.equal(reloaded.evaluation.model, 'unavailable');
      assert.equal((await readRaw(audioId)).hash, original.hash);
      await page.locator('.bottom-nav button').filter({ hasText: 'Progress' }).click();
      await page.locator('.recent-card').filter({ hasText: 'Daily' }).first().click();
      await page.locator('.feedback-card').filter({ hasText: 'Unscored review' }).waitFor();
      assert.equal(item.mockedRequests['/api/transcribe'], 1);
      assert.equal(item.mockedRequests['/api/ai'] || 0, noText ? 0 : 1);
      assert.deepEqual(item.pageErrors, []);
      item.checks.push('Finishes within deadline as an unscored review, without invented scores', 'Completed session and raw hash survive reopen, without repeated AI or STT');
      item.passed = true; console.log(`PASS ${mode}: ${item.checks.length} assertion groups`);
    } catch (error) {
      item.error = error.message; console.error(`FAIL ${mode}: ${error.message}`);
      await capture('unexpected').catch(() => {});
      await writeFile(join(output, `${mode}-failure.txt`), error.stack + '\n' + await page.locator('body').innerText().catch(() => '')).catch(() => {});
    } finally { releaseHanging?.(); await context.close(); }
  }
} finally {
  await browser.close(); report.finishedAt = new Date().toISOString();
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ passed: report.cases.filter(x => x.passed).length, total: report.cases.length, output }, null, 2));
if (report.cases.some(x => !x.passed)) process.exitCode = 1;
