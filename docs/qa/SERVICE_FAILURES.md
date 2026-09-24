# Browser service failure checks

Seven cases passed against the c12a196 local production build using isolated Chromium, actual MediaRecorder synthetic tone, mocked APIs and blocked external requests. No production model, Redis, account or microphone is used.

| Case | Result | Finish action to unscored review (ms, this local run only) |
| --- | --- | ---: |
| stt-budget | passed | 91 |
| stt-auth | passed | 80 |
| stt-provider-error | passed | 81 |
| stt-timeout | passed | 79 |
| evaluation-budget | passed | 100 |
| evaluation-invalid-json | passed | 103 |
| evaluation-timeout | passed | 25590 |

STT cases include platform budget rejection before dispatch, account authentication rejection, provider failure after dispatch, and a response held until the real 60-second client timeout. Each retains the verified original, permits audio-only submission, finishes without evaluation calls, and survives reopening from Progress. Refresh never repeats the failed/uncertain request automatically.

Evaluation cases include a budget rejection, malformed JSON and a response held until the real 25-second client timeout. Text and original audio remain; the result is explicitly unscored with empty scores. Reopening Progress does not send another STT or evaluation request. Every case checks saved original SHA256, stable Turn ID and no unhandled page error. Timing above is one local mocked run, not provider latency or P50/P95.

Evidence: `.codex/qa/service-faults/1790262370842/report.json` and screenshots; summary `.codex/qa/unattended-2026-09-24/verified-cases.json`.

Initial run `1790262128197` had two inaccurate notice selectors and five wrong navigation assumptions: completed records are in Progress, not the home unfinished list. Separate first retries for budget/auth (`1790262239332`, `1790262258174`) also reached the navigation issue. After correcting the harness, the final run passed all seven; this was the second/final retry for budget/auth and first retry for the other cases. All failure records are retained. No product code was changed to make these tests pass.

Reproduce with `node scripts/qa/service-faults.mjs` and the existing `ORAL_PLAYWRIGHT_MODULES`, `ORAL_TEST_BROWSER`, local-only `ORAL_TEST_ORIGIN`. Optional `ORAL_SERVICE_CASE` selects one case. A full run includes real timeout waits. This verifies client behavior under mocked server replies, not real Redis enforcement, cloud provider behavior, phone acceptance or billing.
