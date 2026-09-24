// Local responsive UI checks. Uses an existing Playwright installation; never installs one.
// ORAL_PLAYWRIGHT_MODULES may point to a bundled node_modules directory.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const origin = process.env.ORAL_TEST_ORIGIN || 'http://127.0.0.1:3420';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) throw new Error('Local test origin required');
const require = createRequire(process.env.ORAL_PLAYWRIGHT_MODULES ? join(resolve(process.env.ORAL_PLAYWRIGHT_MODULES), '_oral_loader.cjs') : import.meta.url);
const { chromium } = require('playwright');
const output = resolve(process.env.ORAL_LAYOUT_OUTPUT || '.codex/qa/device-adaptation/after');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.ORAL_TEST_BROWSER ? { executablePath: process.env.ORAL_TEST_BROWSER } : {}) });
const cases = [
  ['phone-320', 320, 568, 'zh-CN', 'light'], ['iphone-se', 375, 667, 'zh-CN', 'light'],
  ['iphone-390', 390, 844, 'zh-CN', 'light'], ['iphone-wide', 430, 932, 'zh-CN', 'light'],
  ['tablet', 768, 1024, 'zh-CN', 'light'], ['phone-landscape', 844, 390, 'zh-CN', 'light'],
  ['desktop-1024', 1024, 768, 'zh-CN', 'light'], ['desktop-1440', 1440, 1000, 'zh-CN', 'light'],
  ['iphone-english', 390, 844, 'en', 'light'], ['desktop-dark', 1440, 1000, 'zh-CN', 'dark'],
  ['iphone-japanese', 390, 844, 'ja', 'light'], ['tablet-traditional', 768, 1024, 'zh-HK', 'dark'],
];
const report = { startedAt: new Date().toISOString(), scope: 'Chromium viewport emulation and synthetic local audio; not physical iPhone/Safari acceptance', networkPolicy: 'Local assets only; APIs mocked, external requests aborted', cases: [], failures: [] };
try {
  for (const [name, width, height, language, theme] of cases) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 900, hasTouch: width < 900, serviceWorkers: 'block' });
    const current = { name, width, height, language, theme, mockedRequests: {}, externalRequestsBlocked: 0, snapshots: [] }; report.cases.push(current);
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { current.externalRequestsBlocked++; return route.abort(); }
      if (url.pathname.startsWith('/api/')) {
        current.mockedRequests[url.pathname] = (current.mockedRequests[url.pathname] || 0) + 1;
        return route.fulfill({ status: url.pathname === '/api/transcribe' ? 200 : 503, contentType: 'application/json', body: JSON.stringify(url.pathname === '/api/transcribe' ? { text: 'Synthetic layout recording. This is isolated test data.', provider: 'mock' } : {}) });
      }
      return route.continue();
    });
    await context.addInitScript(({ language, theme }) => {
      localStorage.setItem('oral-ui-language', language); localStorage.setItem('oral-theme', theme);
      sessionStorage.setItem('oral-beta-access-code', 'layout-local-only');
      if (!localStorage.getItem('oral.sessions.v1')) localStorage.setItem('oral.sessions.v1', JSON.stringify([{
        id: 'layout-draft', revision: 1, language: 'en', mode: 'daily', level: 'Intermediate', topic: 'Everyday life', status: 'listening',
        question: 'A long question for layout checks: describe a memorable conversation and explain what you learned from it.', turns: [], startedAt: '2026-09-24T00:00:00Z',
        draft: { turnId: 'layout-turn', transcript: 'Saved synthetic draft', durationSeconds: 0, stage: 'editing', chunks: [] },
      }]));
      if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
      window.SpeechRecognition = undefined; window.webkitSpeechRecognition = undefined;
      navigator.mediaDevices.getUserMedia = async () => {
        const context = new AudioContext(); const destination = context.createMediaStreamDestination();
        const oscillator = context.createOscillator(); oscillator.connect(destination); oscillator.start(); await context.resume();
        return destination.stream;
      };
    }, { language, theme });
    const page = await context.newPage(); page.setDefaultTimeout(12000);
    const capture = async (stage, options = {}) => {
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const metrics = await page.evaluate(() => {
        const visible = element => { const r = element.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const rect = element => { if (!element) return null; const r = element.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height, right:r.right, bottom:r.bottom }; };
        return { viewport: innerWidth, document: document.documentElement.scrollWidth, frame: rect(document.querySelector('.app-frame')),
          smallButtons: [...document.querySelectorAll('.app-frame button')].filter(visible).filter(e => e.getBoundingClientRect().height < 43.5 || e.getBoundingClientRect().width < 43.5).map(e => ({ label:e.textContent.trim().slice(0,35), height:e.getBoundingClientRect().height, width:e.getBoundingClientRect().width })),
          smallInputs: [...document.querySelectorAll('input:not([type=checkbox]),select,textarea')].filter(visible).filter(e => parseFloat(getComputedStyle(e).fontSize) < 16).map(e => e.tagName),
          question: rect(document.querySelector('.question-card')), answer: rect(document.querySelector('.answer-zone')), modal: rect(document.querySelector('[role=dialog]')),
          audio: [...document.querySelectorAll('audio')].filter(visible).map(e => ({ width:e.getBoundingClientRect().width, parent:e.parentElement.getBoundingClientRect().width })),
        };
      });
      const problems = [];
      if (metrics.document > metrics.viewport + 1) problems.push('Horizontal page overflow');
      if (metrics.smallButtons.length) problems.push('Touch target below 44px');
      if (metrics.smallInputs.length) problems.push('Input font below 16px');
      if (width >= 1024 && metrics.frame.width < 900) problems.push('Desktop remains phone-width');
      if (width >= 1024 && metrics.question && metrics.answer && metrics.question.right > metrics.answer.x + 1) problems.push('Desktop question and recording columns overlap');
      if (metrics.audio.some(a => a.width > a.parent + 1)) problems.push('Native audio control overflows');
      if (metrics.modal) {
        const top = options.keyboard ? 60 : 0; const bottom = options.keyboard ? 360 : height;
        if (metrics.modal.y < top - 1 || metrics.modal.bottom > bottom + 1) problems.push('Dialog outside visible viewport');
      }
      current.snapshots.push({ stage, metrics, problems });
      report.failures.push(...problems.map(problem => ({ name, stage, problem })));
      if (['home','speaking','recording','audio','settings','keyboard','auth','result'].includes(stage)) await page.screenshot({ path: join(output, `${name}-${stage}.png`), fullPage: !options.keyboard });
    };
    try {
      await page.goto(origin); await page.locator('.language-card.en').waitFor(); await capture('home');
      await page.locator('.unfinished-entry').click(); await page.locator('.unfinished-card').waitFor(); await capture('unfinished');
      await page.locator('.bottom-nav button').nth(0).click(); await page.locator('.language-card.en').click(); await capture('practice');
      await page.locator('.mode-card').filter({ hasText: language === 'en' ? 'Daily' : '日常' }).click(); await capture('setup');
      await page.locator('.primary-button').click(); await page.locator('#transcript').waitFor();
      await page.waitForFunction(() => !document.querySelector('.mic-button').disabled); await capture('speaking');
      await page.locator('.mic-button').click(); await page.locator('.stop-button').waitFor(); await capture('recording');
      await page.waitForTimeout(1100); await page.locator('.stop-button').click();
      await page.waitForFunction(() => document.querySelector('.audio-player') && !document.querySelector('.submit-button').disabled); await capture('audio');
      await page.locator('.submit-button').click(); await page.waitForFunction(() => !document.querySelector('.finish-link').disabled);
      await page.locator('.finish-link').click(); await page.locator('.result-intro').waitFor(); await capture('result');
      await page.locator('.primary-button').click(); await page.locator('.bottom-nav button').nth(2).click(); await capture('progress');
      await page.locator('.bottom-nav button').nth(3).click(); await capture('profile');
      await page.locator('.profile-control-list .profile-control').nth(1).click(); await page.locator('.settings-sheet').waitFor(); await capture('settings');
      await page.evaluate(() => {
        Object.defineProperty(visualViewport, 'height', { configurable:true, value:300 }); Object.defineProperty(visualViewport, 'offsetTop', { configurable:true, value:60 });
        visualViewport.dispatchEvent(new Event('resize'));
      }); await capture('keyboard', { keyboard: true });
      await page.evaluate(() => { delete visualViewport.height; delete visualViewport.offsetTop; visualViewport.dispatchEvent(new Event('resize')); });
      await page.locator('.settings-close').click(); await page.locator('.profile-control-list .profile-control').nth(0).click(); await page.locator('.auth-sheet').waitFor(); await capture('auth');
      await page.locator('.auth-close').click(); await page.locator('.recording-entry').click(); await page.locator('.recording-library').waitFor(); await capture('recordings');
      console.log(`${name}: ${current.snapshots.length} screens checked`);
    } catch (error) {
      report.failures.push({ name, problem: error.message }); console.error(`${name}: ${error.message}`);
      await page.screenshot({ path: join(output, `${name}-error.png`), fullPage:true }).catch(() => {});
    } finally { await context.close(); }
  }
} finally {
  await browser.close(); report.finishedAt = new Date().toISOString();
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ cases: report.cases.length, snapshots: report.cases.reduce((n,c)=>n+c.snapshots.length,0), failures: report.failures, output }, null, 2));
if (report.failures.length) process.exitCode = 1;
