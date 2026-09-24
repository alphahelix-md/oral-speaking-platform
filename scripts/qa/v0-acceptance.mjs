import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

export const deviceFamilies = ['android-chrome', 'iphone-safari', 'desktop-chrome'];
export const faultScenarios = ['microphone-denied', 'zero-byte-audio', 'storage-full', 'decode-failure', 'stt-timeout', 'stt-quota', 'stt-language', 'offline-local-question', 'evaluation-invalid-json', 'tts-failure', 'upload-failure', 'refresh-recovery', 'duplicate-submit'];
const count = z.number().int().nonnegative();
const evidence = z.string().trim().min(1).max(500);
const build = z.string().regex(/^[a-f0-9]{7,40}$/);
const timestamp = z.string().datetime({ offset: true });
const attempt = z.object({
  id: z.string().min(1).max(80), at: timestamp, build,
  source: z.enum(['device', 'automation']), device: z.enum(deviceFamilies),
  language: z.enum(['en', 'ja']), input: z.enum(['audio', 'text']),
  outcome: z.enum(['completed', 'failed', 'abandoned']), reopened: z.boolean(),
  allOriginalsPlayable: z.boolean().nullable(), exportOnly: z.boolean(), silentLoss: z.boolean(),
  manualFallback: z.boolean(), durationSeconds: z.number().nonnegative(),
  stt: z.object({ chunksRequested: count, chunksSucceeded: count, providerAttempts: count }).strict(),
  evaluation: z.enum(['ai', 'unavailable', 'not-requested']),
  evaluationAttempts: count, actualCostUsd: z.number().nonnegative().nullable(),
  errorCode: z.string().max(100), remedy: z.string().max(500), evidence,
}).strict().superRefine((value, ctx) => {
  const fail = (message) => ctx.addIssue({ code: 'custom', message });
  if (value.stt.chunksSucceeded > value.stt.chunksRequested || value.stt.providerAttempts < value.stt.chunksRequested) fail('STT counts are inconsistent');
  if (value.input === 'text' && (value.allOriginalsPlayable !== null || value.stt.chunksRequested || value.stt.providerAttempts)) fail('Text-only attempts must have no audio/STT evidence');
  if (value.input === 'audio' && value.allOriginalsPlayable === null) fail('Audio attempts require an explicit playback result');
  if (value.evaluation === 'ai' && !value.evaluationAttempts) fail('AI evaluation requires a recorded provider attempt');
});
const check = z.object({ status: z.enum(['passed', 'pending', 'failed']), evidence: z.string().max(500) }).strict();
const schema = z.object({
  schemaVersion: z.literal(1), targetBuild: build,
  attempts: z.array(attempt),
  stabilityWindow: z.object({ startedAt: timestamp.nullable(), endedAt: timestamp.nullable(), p0p1Events: count.nullable(), silentLosses: count.nullable(), evidence: z.string().max(500) }).strict(),
  openP0P1: z.array(z.object({ id: evidence, remedy: evidence }).strict()),
  faults: z.array(z.object({ id: z.enum(faultScenarios), build, ...check.shape }).strict()),
  budget: z.object({ hardCap: check, invoiceReconciliation: check }).strict(),
}).strict();

const percentage = (successes, total) => total ? Math.round(successes / total * 10000) / 100 : null;
const retained = item => item.outcome === 'completed' && item.reopened && !item.exportOnly && !item.silentLoss && (item.input === 'text' || item.allOriginalsPlayable);
export function assessV0Acceptance(input, now = new Date()) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { valid: false, readyForReview: false, errors: parsed.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })) };
  const data = parsed.data;
  const errors = [];
  if (new Set(data.attempts.map(item => item.id)).size !== data.attempts.length) errors.push('Duplicate attempt IDs');
  if (new Set(data.faults.map(item => item.id)).size !== data.faults.length) errors.push('Duplicate fault scenario IDs');
  if (data.attempts.some(item => Date.parse(item.at) > now.getTime())) errors.push('Attempt dates are in the future');
  if (errors.length) return { valid: false, readyForReview: false, errors };
  // Failed, abandoned and export-only attempts remain in the denominator.
  const attempts = data.attempts.filter(item => item.source === 'device' && item.build === data.targetBuild);
  const audio = attempts.filter(item => item.input === 'audio');
  const text = attempts.filter(item => item.input === 'text');
  const kept = attempts.filter(retained).length;
  const stt = attempts.filter(item => item.language === 'en' && item.stt.chunksRequested > 0);
  const transcribed = stt.filter(item => item.stt.chunksSucceeded === item.stt.chunksRequested).length;
  const succeededChunks = stt.reduce((total, item) => total + item.stt.chunksSucceeded, 0);
  const requestedChunks = stt.reduce((total, item) => total + item.stt.chunksRequested, 0);
  const from = Date.parse(data.stabilityWindow.startedAt || '');
  const to = Date.parse(data.stabilityWindow.endedAt || '');
  const faultFailures = faultScenarios.filter(id => !data.faults.some(item => item.id === id && item.build === data.targetBuild && item.status === 'passed' && item.evidence.trim()));
  const checks = {
    atLeast50DeviceAttempts: attempts.length >= 50,
    threeDeviceFamilies: deviceFamilies.every(device => attempts.some(item => item.device === device)),
    retentionAtLeast98Percent: attempts.length > 0 && kept * 100 >= attempts.length * 98,
    failureRecordsComplete: attempts.filter(item => !retained(item)).every(item => item.errorCode.trim() && item.remedy.trim()),
    noSilentLoss: attempts.every(item => !item.silentLoss),
    noOpenP0P1: data.openP0P1.length === 0,
    threeCleanDays: Number.isFinite(from) && Number.isFinite(to) && to - from >= 72 * 60 * 60 * 1000 && to <= now.getTime() && data.stabilityWindow.p0p1Events === 0 && data.stabilityWindow.silentLosses === 0 && Boolean(data.stabilityWindow.evidence.trim()),
    allFaultScenarios: faultFailures.length === 0,
    englishSttAtLeast95Percent: stt.length > 0 && transcribed * 100 >= stt.length * 95,
    dailyHardCapVerified: data.budget.hardCap.status === 'passed' && Boolean(data.budget.hardCap.evidence.trim()),
    billingReconciled: attempts.length > 0 && attempts.every(item => item.actualCostUsd !== null) && data.budget.invoiceReconciliation.status === 'passed' && Boolean(data.budget.invoiceReconciliation.evidence.trim()),
  };
  return {
    valid: true, readyForReview: Object.values(checks).every(Boolean), targetBuild: data.targetBuild,
    checks, unmet: Object.keys(checks).filter(key => !checks[key]), missingFaults: faultFailures,
    metrics: {
      attempts: attempts.length, excludedAutomationOrOtherBuilds: data.attempts.length - attempts.length,
      retained: kept, retainedPercent: percentage(kept, attempts.length),
      audio: { attempts: audio.length, retained: audio.filter(retained).length },
      text: { attempts: text.length, retained: text.filter(retained).length },
      exportOnly: attempts.filter(item => item.exportOnly).length,
      abandoned: attempts.filter(item => item.outcome === 'abandoned').length,
      silentLosses: attempts.filter(item => item.silentLoss).length,
      manualFallbacks: attempts.filter(item => item.manualFallback).length,
      englishStt: { attempts: stt.length, succeeded: transcribed, percent: percentage(transcribed, stt.length), requestedChunks, succeededChunks, chunkPercent: percentage(succeededChunks, requestedChunks) },
      sttProviderAttempts: attempts.reduce((n, item) => n + item.stt.providerAttempts, 0),
      sttExtraAttempts: attempts.reduce((n, item) => n + item.stt.providerAttempts - item.stt.chunksRequested, 0),
      evaluationAttempts: attempts.reduce((n, item) => n + item.evaluationAttempts, 0),
      evaluationSucceeded: attempts.filter(item => item.evaluation === 'ai').length,
      knownCostUsd: Math.round(attempts.reduce((n, item) => n + (item.actualCostUsd || 0), 0) * 1_000_000) / 1_000_000,
      unknownCostAttempts: attempts.filter(item => item.actualCostUsd === null).length,
      japaneseAttempts: attempts.filter(item => item.language === 'ja').length,
    },
    note: 'Offline evidence audit only. It does not verify evidence authenticity, authorize a release, or establish Japanese readiness.',
  };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    if (!process.argv[2]) throw new Error('usage');
    const data = JSON.parse(await readFile(process.argv[2], 'utf8'));
    const result = assessV0Acceptance(data);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = !result.valid ? 2 : result.readyForReview ? 0 : 1;
  } catch {
    console.error('Could not read a valid evidence file. Usage: node scripts/qa/v0-acceptance.mjs <evidence.json>');
    process.exitCode = 2;
  }
}
