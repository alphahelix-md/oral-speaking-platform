# V0 evidence collection and offline audit

This is an execution aid for ROADMAP §§2.1, 2.2 and 9, not a new release policy. Existing user feedback confirms typed-draft restoration and playback after processing/refresh on the previously deployed build. It does not supply a complete 50-attempt dataset, a three-day stability window or verified invoices. The template therefore contains no invented attempts.

## Collect one record per attempt

Copy the template to a private local file, replace the template placeholder `0000000` in `targetBuild` with the exact identifier used for the tested deployment, and keep all attempts including failures, explicit abandonment and export-only rescue. Do not overwrite older evidence files.

```powershell
Copy-Item docs/qa/v0-evidence.template.json .codex/qa/v0-device-evidence.json
node scripts/qa/v0-acceptance.mjs .codex/qa/v0-device-evidence.json
```

The command only reads the supplied file. It does not load environment files, call providers, write counters, change settings or deploy. Exit codes: `0` = supplied evidence meets numeric checks and is ready for human review; `1` = incomplete gates; `2` = invalid input. The empty template intentionally exits `1`.

Use an anonymous attempt ID and an evidence reference, such as a private test log filename. Never include account tokens, access codes, raw speech, transcript text or personal details. Do not commit real user evidence to the repository.

Each `attempts` item has this shape; replace every example with an observed value. This example is explicitly automation, so it cannot increase the real-device denominator:

```json
{
  "id": "synthetic-example-only",
  "at": "2026-09-24T13:00:00+08:00",
  "build": "04f87b6",
  "source": "automation",
  "device": "desktop-chrome",
  "language": "en",
  "input": "audio",
  "outcome": "failed",
  "reopened": false,
  "allOriginalsPlayable": false,
  "exportOnly": true,
  "silentLoss": false,
  "manualFallback": true,
  "durationSeconds": 60,
  "stt": { "chunksRequested": 3, "chunksSucceeded": 1, "providerAttempts": 4 },
  "evaluation": "not-requested",
  "evaluationAttempts": 0,
  "actualCostUsd": null,
  "errorCode": "SYNTHETIC_STORAGE_FAILURE",
  "remedy": "Download original and separate practice JSON; retry storage after resolving the error",
  "evidence": "Synthetic example, never a real device result"
}
```

- `source`: use `device` only for observed real-device trials. Supported required device families are `android-chrome`, `iphone-safari`, `desktop-chrome`.
- `input`: `text` means there was no recorded audio. Its `allOriginalsPlayable` must be `null` and STT counts zero. For `audio`, playback is a boolean covering **every** original in that attempt.
- `outcome`: `completed`, `failed` or `abandoned`. Completion is counted as retained only after reopening, complete original playback if applicable, no export-only rescue and no silent loss.
- `stt.chunksRequested` is the number of distinct chunks actually sent; `chunksSucceeded` is confirmed successful chunks. `providerAttempts` also includes retries/language correction. Do not infer this count from only browser requests; use server receipts.
- English STT gate uses attempts in which STT was requested: an attempt succeeds only when every requested chunk succeeds. Chunk success is separately reported. Skipped STT and manual fallback cannot be reported as STT success. Representative audio/device coverage still needs human review; the roadmap does not define a separate minimum English-STT sample count.
- `actualCostUsd`: observed/reconciled cost, or `null` if unknown. Unknown is never silently treated as confirmed zero cost. Invoice review and a verified hard cap require their own evidence.
- Every attempt that fails the retention definition needs both `errorCode` and actionable `remedy`, including abandonment and export-only outcomes.

## Stability, faults and costs

`stabilityWindow` must describe at least 72 elapsed hours, with zero P0/P1 events and zero silent losses, a non-future end, and an evidence reference. Keep `openP0P1` accurate; leave unresolved or unverified fixes listed until accepted. The tool cannot establish that a supplied stability claim is authentic.

`faults` must contain one record per scenario exported by `faultScenarios` in the script, with the target build, `passed` status and evidence. The checklist includes microphone denial, empty audio, storage full, decoding failure, STT timeout/quota/language, offline local questions, invalid evaluation JSON, TTS/upload failure, refresh and duplicate submission. Actual phone/browser fault evidence remains necessary.

Set `budget.hardCap` and `budget.invoiceReconciliation` to `passed` only after real verification. Explicit unmetered `access-code-only` test mode cannot pass the hard-cap gate. Use the dedicated Redis procedure in `docs/PROVIDER_BUDGETS.md`; do not touch production counters to test limits.

The tool filters out automation and other build identifiers, reports these exclusions, and rejects duplicate attempt IDs or impossible counts. Rates use exact ratios for thresholds before display rounding. It reports audio/text separately, STT attempts/chunks/retries, manual fallback, known/unknown costs, and Japanese sample count. It does not approve release, certify Japanese quality, prove the evidence is truthful, or replace the roadmap's human review.

## Isolated writer check

```powershell
node scripts/qa/test-session-writer-browser.mjs
```

This uses installed Edge (or `ORAL_TEST_BROWSER`), a temporary profile, a localhost-only server, the actual TypeScript writer/storage modules, and synthetic records. It does not open the production website. Reports include source hashes under `.codex/qa/session-writer-*/report.json`. It complements phone/UI testing; it does not count toward 50 real-device product attempts.
