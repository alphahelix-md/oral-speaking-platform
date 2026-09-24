// Browser audio integrity fault checks against an existing local production build.
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
const output = resolve(process.env.ORAL_AUDIO_OUTPUT || '.codex/qa/audio-faults/' + Date.now());
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.ORAL_TEST_BROWSER ? { executablePath: process.env.ORAL_TEST_BROWSER } : {}) });
const report = { startedAt: new Date().toISOString(), scope: 'Isolated Chromium; synthetic recordings and injected decode/corruption/removal; mocked APIs; not a physical-device result', origin, realProviderRequests: 0, cases: [] };
const transcript = 'Synthetic recording for audio integrity recovery.';
const allCases = ['decoder-failure', 'corrupt-submit', 'missing-submit', 'corrupt-resume', 'missing-resume'];
const selectedCases = process.env.ORAL_AUDIO_CASE ? [process.env.ORAL_AUDIO_CASE] : allCases;
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
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { item.externalRequestsBlocked++; return route.abort(); }
      if (url.pathname.startsWith('/api/')) {
        item.mockedRequests[url.pathname] = (item.mockedRequests[url.pathname] || 0) + 1;
        if (url.pathname === '/api/transcribe') {
          if (mode === 'response-quota') await page.evaluate(() => { window.__audioQA.sessionFull = true; });
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: transcript, provider: 'mock' }) });
        }
        return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
      }
      return route.continue();
    });
    await context.addInitScript(mode => {
      localStorage.setItem('oral-ui-language', 'en');
      sessionStorage.setItem('oral-beta-access-code', 'local-storage-qa');
      window.__audioQA = { mode, sessionFull: false, audioFault: mode.startsWith('raw-'), raw: null, faultCount: 0 };
      if (mode === 'decoder-failure') {
        AudioContext.prototype.decodeAudioData = async function() {
          window.__audioQA.faultCount++;
          throw new DOMException('Injected decode failure', 'EncodingError');
        };
      }
      const Recorder = window.MediaRecorder;
      window.MediaRecorder = class extends Recorder {
        constructor(stream, options) {
          super(stream, options);
          const chunks = [];
          this.addEventListener('dataavailable', event => { if (event.data.size) chunks.push(event.data); });
          this.addEventListener('stop', () => { window.__audioQA.raw = new Blob(chunks, { type: this.mimeType }); });
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
      await page.waitForFunction(() => window.__audioQA.raw?.size > 0 && document.querySelector('.audio-player') && !document.querySelector('.mic-button').disabled && !document.querySelector('#transcript').disabled);
      const before = (await sessions())[0]; const audioId = before.draft.audioId;
      assert.ok(audioId);
      const original = await page.evaluate(async () => {
        const blob = window.__audioQA.raw;
        const bytes = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
        return { size: blob.size, type: blob.type, hash: [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('') };
      });
      item.original = original;
      assert.equal(before.draft.audioStatus, 'verified');
      assert.equal((await readRaw(audioId)).hash, original.hash);
      if (mode === 'decoder-failure') {
        assert.ok(await page.evaluate(() => window.__audioQA.faultCount >= 2));
        assert.equal(item.mockedRequests['/api/transcribe'] || 0, 0);
        assert.equal(await page.locator('#transcript').inputValue(), '');
        await page.locator('.notice[role=status]').filter({ hasText: /transcription|interrupted/i }).waitFor();
        item.checks.push('Decode failures retain verified raw audio and release controls without sending STT');
      } else {
        assert.equal(await page.locator('#transcript').inputValue(), transcript);
        assert.equal(item.mockedRequests['/api/transcribe'], 1);
        await page.evaluate(async ({ id, missing }) => {
          const db = await new Promise((resolve, reject) => {
            const req = indexedDB.open('oral-audio-v1', 1);
            req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
          });
          // Read bytes outside a write transaction, then mutate only this synthetic fixture.
          const entry = await new Promise((resolve, reject) => {
            const req = db.transaction('records').objectStore('records').get(id);
            req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
          });
          const bytes = new Uint8Array(await entry.blob.arrayBuffer()); bytes[bytes.length - 1] ^= 1;
          await new Promise((resolve, reject) => {
            const tx = db.transaction('records', 'readwrite'); const store = tx.objectStore('records');
            if (missing) store.delete(id);
            else store.put({ ...entry, blob: new Blob([bytes], { type: entry.blob.type }) }, id);
            tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
          }); db.close();
        }, { id: audioId, missing: mode.startsWith('missing') });
        if (mode.endsWith('resume')) {
          await page.reload(); await page.locator('.language-card.en').waitFor();
          await page.getByRole('button', { name: /Unfinished practice/i }).click();
          await page.locator('.unfinished-list button').first().click();
          await page.locator('#transcript').waitFor();
        } else {
          await page.locator('.submit-button').click();
        }
        await page.locator('.notice[role=alert]').waitFor();
        assert.equal((await sessions())[0].turns.length, 0);
        assert.equal(await page.locator('#transcript').inputValue(), transcript);
        const backup = JSON.parse((await download(page.getByRole('button', { name: 'Export text and draft (download audio separately)', exact: true }), 'draft.json')).toString());
        assert.equal(backup.audioIncluded, false); assert.equal(backup.platformRetentionConfirmed, false);
        assert.equal(backup.session.draft.transcript, transcript);
        await capture('failure');
        item.checks.push('Missing or hash-mismatched raw audio blocks commit with visible failure', 'Transcript stays exportable without a retention claim');
        if (mode.endsWith('submit')) {
          assert.equal(hash(await download(page.locator('.unsaved-download'), 'original.bin')), original.hash);
          item.checks.push('In-memory original download still matches capture after stored corruption/removal');
        }
        // Recovery via another spoken answer; no writing-only exercise.
        await page.locator('.mic-button').click(); await page.locator('.stop-button').waitFor();
        await page.waitForTimeout(1300); await page.locator('.stop-button').click();
        await page.waitForFunction(oldId => {
          const current = JSON.parse(localStorage.getItem('oral.sessions.v1') || '[]')[0];
          return current?.draft.audioId !== oldId && current?.draft.audioStatus === 'verified' && !document.querySelector('.mic-button').disabled;
        }, audioId);
        item.checks.push('A new recording restores a usable answer without reusing the bad original');
      }
      const ready = (await sessions())[0];
      const readyRaw = await readRaw(ready.draft.audioId);
      assert.equal(readyRaw.hash, readyRaw.metadata.sha256);
      await page.locator('.submit-button').evaluate(button => { button.click(); button.click(); });
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('oral.sessions.v1') || '[]')[0]?.turns.length === 1);
      const saved = (await sessions())[0];
      assert.equal(saved.turns[0].id, before.draft.turnId);
      assert.equal(saved.turns[0].audioId, ready.draft.audioId);
      assert.equal(saved.turns[0].audioStatus, 'verified');
      assert.equal(saved.turns[0].transcript, mode === 'decoder-failure' ? '' : transcript);
      assert.equal(saved.turns[0].transcriptionStatus, mode === 'decoder-failure' ? 'skipped' : 'succeeded');
      assert.equal(item.mockedRequests['/api/transcribe'] || 0, mode === 'decoder-failure' ? 0 : 2);
      await page.reload(); await page.locator('.language-card.en').waitFor();
      const reloaded = (await sessions())[0];
      assert.equal(reloaded.turns.length, 1); assert.equal(reloaded.turns[0].id, saved.turns[0].id);
      assert.equal((await readRaw(ready.draft.audioId)).hash, readyRaw.hash);
      assert.deepEqual(item.pageErrors, []);
      item.checks.push('One stable answer after double click; transcript/raw survive reload; no repeated request for old audio');
      item.passed = true; console.log(`PASS ${mode}: ${item.checks.length} assertion groups`);
    } catch (error) {
      item.error = error.message; console.error(`FAIL ${mode}: ${error.message}`);
      await capture('unexpected').catch(() => {});
      await writeFile(join(output, `${mode}-failure.txt`), error.stack + '\n' + await page.locator('body').innerText().catch(() => '')).catch(() => {});
    } finally { await context.close(); }
  }
} finally {
  await browser.close(); report.finishedAt = new Date().toISOString();
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ passed: report.cases.filter(x => x.passed).length, total: report.cases.length, output }, null, 2));
if (report.cases.some(x => !x.passed)) process.exitCode = 1;
