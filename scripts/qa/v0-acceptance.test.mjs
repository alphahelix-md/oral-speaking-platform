import { describe, expect, it } from 'vitest';
import { assessV0Acceptance, deviceFamilies, faultScenarios } from './v0-acceptance.mjs';

const now = new Date('2026-09-24T06:00:00Z');
function fixture(total = 50) {
  return {
    schemaVersion: 1, targetBuild: '04f87b6',
    attempts: Array.from({ length: total }, (_, index) => ({
      id: 'synthetic-' + index, at: '2026-09-24T01:00:00Z', build: '04f87b6',
      source: 'device', device: deviceFamilies[index % 3], language: 'en', input: 'audio',
      outcome: 'completed', reopened: true, allOriginalsPlayable: true, exportOnly: false,
      silentLoss: false, manualFallback: false, durationSeconds: 30,
      stt: { chunksRequested: 2, chunksSucceeded: 2, providerAttempts: 2 },
      evaluation: 'ai', evaluationAttempts: 1, actualCostUsd: 0.01,
      errorCode: '', remedy: '', evidence: 'Synthetic fixture; never actual acceptance',
    })),
    stabilityWindow: { startedAt: '2026-09-21T06:00:00Z', endedAt: '2026-09-24T06:00:00Z', p0p1Events: 0, silentLosses: 0, evidence: 'Synthetic fixture' },
    openP0P1: [], faults: faultScenarios.map(id => ({ id, build: '04f87b6', status: 'passed', evidence: 'Synthetic fixture' })),
    budget: { hardCap: { status: 'passed', evidence: 'Synthetic fixture' }, invoiceReconciliation: { status: 'passed', evidence: 'Synthetic fixture' } },
  };
}
function fail(data, index = 0) { Object.assign(data.attempts[index], { outcome: 'failed', reopened: false, errorCode: 'FIXTURE_ERROR', remedy: 'Synthetic retry procedure' }); }

describe('V0 evidence gate calculations (synthetic only)', () => {
  it('calculates a complete evidence fixture but never claims a release approval', () => {
    const result = assessV0Acceptance(fixture(), now);
    expect(result.readyForReview).toBe(true); expect(result.metrics.retainedPercent).toBe(100);
    expect(result.note).toContain('does not verify evidence authenticity');
  });
  it('accepts exactly 49/50 while keeping the failed attempt in the denominator', () => {
    const data = fixture(); fail(data);
    const result = assessV0Acceptance(data, now);
    expect(result.metrics).toMatchObject({ attempts: 50, retained: 49, retainedPercent: 98 });
    expect(result.checks.retentionAtLeast98Percent).toBe(true);
  });
  it('rejects sub-threshold retention without rounding it up', () => {
    const data = fixture(99); fail(data, 0); fail(data, 1);
    expect(assessV0Acceptance(data, now).checks.retentionAtLeast98Percent).toBe(false);
  });
  it('does not count export-only or abandoned outcomes as platform retention', () => {
    const data = fixture(); data.attempts[0].exportOnly = true; data.attempts[1].outcome = 'abandoned';
    const result = assessV0Acceptance(data, now);
    expect(result.metrics).toMatchObject({ attempts: 50, retained: 48, exportOnly: 1, abandoned: 1 });
    expect(result.checks.failureRecordsComplete).toBe(false);
  });
  it('rejects an audio attempt with one unplayable original even if the session opens', () => {
    const data = fixture(); data.attempts[0].allOriginalsPlayable = false;
    expect(assessV0Acceptance(data, now).metrics.retained).toBe(49);
  });
  it('reports text-only retention separately without counting text as successful STT', () => {
    const data = fixture();
    for (const item of data.attempts) { item.input = 'text'; item.allOriginalsPlayable = null; item.stt = { chunksRequested: 0, chunksSucceeded: 0, providerAttempts: 0 }; }
    const result = assessV0Acceptance(data, now);
    expect(result.metrics.text).toEqual({ attempts: 50, retained: 50 });
    expect(result.metrics.englishStt.percent).toBeNull(); expect(result.checks.englishSttAtLeast95Percent).toBe(false);
  });
  it('keeps English STT attempt success separate from chunk success and retries', () => {
    const data = fixture(); data.attempts[0].stt.chunksSucceeded = 1; data.attempts[0].stt.providerAttempts = 3;
    const result = assessV0Acceptance(data, now);
    expect(result.metrics.englishStt).toMatchObject({ attempts: 50, succeeded: 49, percent: 98, requestedChunks: 100, succeededChunks: 99 });
    expect(result.metrics.sttExtraAttempts).toBe(1);
  });
  it('requires STT >= 95% independently from successful manual recovery', () => {
    const data = fixture(); for (let i = 0; i < 3; i++) { data.attempts[i].stt.chunksSucceeded = 0; data.attempts[i].manualFallback = true; }
    const result = assessV0Acceptance(data, now);
    expect(result.metrics.retainedPercent).toBe(100); expect(result.checks.englishSttAtLeast95Percent).toBe(false);
  });
  it('excludes automation and old builds from the device acceptance count', () => {
    const data = fixture(); data.attempts[0].source = 'automation'; data.attempts[1].build = '2aeac3e';
    const result = assessV0Acceptance(data, now);
    expect(result.metrics.attempts).toBe(48); expect(result.metrics.excludedAutomationOrOtherBuilds).toBe(2);
    expect(result.checks.atLeast50DeviceAttempts).toBe(false);
  });
  it('requires each specified device family', () => {
    const data = fixture(); data.attempts.forEach(item => { item.device = 'desktop-chrome'; });
    expect(assessV0Acceptance(data, now).checks.threeDeviceFamilies).toBe(false);
  });
  it.each(['p0p1', 'silent-loss', 'short-window', 'future-window', 'missing-evidence'])('blocks a %s stability claim', reason => {
    const data = fixture();
    if (reason === 'p0p1') data.stabilityWindow.p0p1Events = 1;
    if (reason === 'silent-loss') data.attempts[0].silentLoss = true;
    if (reason === 'short-window') data.stabilityWindow.startedAt = '2026-09-22T06:00:00Z';
    if (reason === 'future-window') data.stabilityWindow.endedAt = '2026-09-25T06:00:00Z';
    if (reason === 'missing-evidence') data.stabilityWindow.evidence = '';
    expect(assessV0Acceptance(data, now).readyForReview).toBe(false);
  });
  it('blocks open P0/P1 even if three clean historical days are supplied', () => {
    const data = fixture(); data.openP0P1.push({ id: 'issue', remedy: 'Fix and verify' });
    expect(assessV0Acceptance(data, now).checks.noOpenP0P1).toBe(false);
  });
  it('requires all fault scenarios on the target build', () => {
    const data = fixture(); data.faults[0].build = '2aeac3e';
    expect(assessV0Acceptance(data, now).missingFaults).toEqual(['microphone-denied']);
  });
  it('never interprets unknown costs or unverified budgets as zero spend with a hard cap', () => {
    const data = fixture(); data.attempts[0].actualCostUsd = null; data.budget.hardCap.status = 'pending';
    const result = assessV0Acceptance(data, now);
    expect(result.metrics.unknownCostAttempts).toBe(1); expect(result.checks.billingReconciled).toBe(false); expect(result.checks.dailyHardCapVerified).toBe(false);
  });
  it.each(['duplicate', 'impossible-counts', 'future-attempt', 'private-field'])('rejects %s evidence input', reason => {
    const data = fixture();
    if (reason === 'duplicate') data.attempts[1].id = data.attempts[0].id;
    if (reason === 'impossible-counts') data.attempts[0].stt.chunksSucceeded = 3;
    if (reason === 'future-attempt') data.attempts[0].at = '2026-09-25T00:00:00Z';
    if (reason === 'private-field') data.attempts[0].transcript = 'PRIVATE_FIXTURE_TEXT';
    const result = assessV0Acceptance(data, now);
    expect(result.valid).toBe(false); expect(JSON.stringify(result)).not.toContain('PRIVATE_FIXTURE_TEXT');
  });
});
