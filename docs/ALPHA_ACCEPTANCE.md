# V0 acceptance — pending manual evidence

This checklist is not a pass report. Automated tests cannot supply phone/device evidence or a 50-attempt retention rate.

| Scenario | Procedure | Required result | Status |
| --- | --- | --- | --- |
| Typed draft | Type and edit before submitting; refresh; choose Resume unfinished practice | Same question, exact edited text and Turn ID | Logic tests pass; device pending |
| Original recording | Record 15–60 seconds; finish; refresh while transcription runs | Original readback verified; recoverable audio and text; no automatic repeated ambiguous request | Handler/storage tests pass; device pending |
| Long answer | Record 1–3 minutes; interrupt after an early successful chunk | Successful chunks remain; pending/uncertain state explicit; manual completion available | State tests pass; device pending |
| Double submit | Tap Continue twice quickly; refresh during submission | One Turn; correct next question; editor cleared only after durable commit | Handler tests pass; device pending |
| End with pending input | Type or record but do not submit; press Finish | Pending input is retained; finish requires submit/skip first | Handler tests pass; device pending |
| Storage full/blocked | Simulate localStorage/IndexedDB failure | Visible failure; raw download + separate draft/text export; no retained-success claim | Fault tests pass; device pending |
| Decoder failure | Force browser audio decode failure | Raw bytes already persisted; manual input/skip can continue | Handler tests pass; device pending |
| All AI unavailable | Reject STT, text AI and cloud TTS | Local question; type or preserve untranscribed audio; scoreless review; no invented score | Route/handler tests pass; device pending |
| Interrupted evaluation | Refresh after sending evaluation; resume and finish | No automatic repeated evaluation; scoreless review if result unknown | Handler tests pass; device pending |
| Cache quota | Fail question-audio cache read/write | Existing received audio stays usable; local TTS/text fallback remains | Cache test passes; device pending |
| Raw corruption | Change/delete stored original after initial save | Recovery/submission detects mismatch or missing audio; never claims verified | Storage/handler tests pass; device pending |
| Training upload failure | Opt in; fail upload | Local practice remains; upload failure is visible | Existing behavior; device pending |
| Server budgets | Dedicated Redis test backend; mock Provider | Atomic concurrent limits; duplicate rejected; each retry counted; failure stops paid work | Mock boundary tests pass; real Redis pending |

Run the mobile rows on Android Chrome, iPhone Safari and desktop Chrome. Start with English. Mark Japanese separately until real language samples are available.

Per attempt, record: date, build SHA, device/browser, language, session identifier (or anonymized alias), duration, number of submitted answers, whether original playback succeeds after refresh, transcript/manual/skip status, provider attempts/chunks/retries, failure code, export-only outcome and actual account charge if available. Do not put access codes, tokens, raw private text or audio in public logs.

Keep denominators: unsuccessful attempts and export-only outcomes remain in the attempt count. Export-only is not retained-by-platform success. Fifty mixed-device attempts and three days without unresolved P0/P1 remain required; no such dataset exists yet.

Browser automation issue: `scripts/test-reliability-browser.mjs` did not complete after two allowed retries. Its APIs are mocked; it must not be counted as full browser acceptance. Screenshots/errors are in `.codex/qa/reliability-1790214176581/`.
