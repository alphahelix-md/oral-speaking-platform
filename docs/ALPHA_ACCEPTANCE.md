# V0 acceptance — pending manual evidence

This checklist is not a pass report. Automated tests cannot supply phone/device evidence or a 50-attempt retention rate.

| Scenario | Procedure | Required result | Status |
| --- | --- | --- | --- |
| Typed draft | Type and edit before submitting; refresh; open Unfinished practice and choose the saved draft | Same question, exact edited text and Turn ID | User confirmed same question and complete text on 2026-09-24; exact browser/device, internal Turn ID, and other devices pending |
| Original recording | Record 15–60 seconds; finish; refresh while transcription runs | Original readback verified; recoverable audio and text; no automatic repeated ambiguous request | User confirmed complete playback after refresh on vivo X100s Pro / Chrome with 50s and 104s recordings (872088f). Exact interrupted request stage and other devices pending |
| System recording interruption | End microphone input while the page stays alive; also navigate while microphone permission is pending | Received original bytes are saved; prompt to play/check; no automatic STT of interrupted audio | Event/handler tests pass; device pending |
| Long answer | Record 1–3 minutes; interrupt after an early successful chunk | Successful chunks remain; pending/uncertain state explicit; manual completion available | 104s original replay confirmed on vivo X100s Pro / Chrome; no text before/after interruption (872088f). Audio-only submission and replay passed on 480f7fe. Successful-chunk recovery remains device pending |
| Double submit | Tap Continue twice quickly; refresh during submission | One Turn; correct next question; editor cleared only after durable commit | User reported rapid double tap adds one answer and advances one question; subsequent refresh shows no duplicate (872088f). Refresh during commit and other devices pending |
| End with pending input | Type or record but do not submit; press Finish | Pending input is retained; finish requires submit/skip first | User confirmed pending text prevents Finish and remains intact (872088f); audio-only Finish protection, intact playback and one saved answer after skip confirmed on vivo X100s Pro / Chrome (e46edcf). Other devices pending |
| Storage full/blocked | Simulate localStorage/IndexedDB failure | Visible failure; raw download + separate draft/text export; no retained-success claim | Fault tests pass; device pending |
| Decoder failure | Force browser audio decode failure | Raw bytes already persisted; manual input/skip can continue | Handler tests pass; device pending |
| All AI unavailable | Reject STT, text AI and cloud TTS | Local question; type or preserve untranscribed audio; scoreless review; no invented score | User confirmed offline typed answer, unscored completion within about 30s and intact text after reconnect/reopen on vivo X100s Pro / Chrome (480f7fe). STT/TTS-specific failures and other devices pending |
| Interrupted evaluation | Refresh after sending evaluation; resume and finish | No automatic repeated evaluation; scoreless review if result unknown | User confirmed intact text and an unscored review after refresh/reopen on vivo X100s Pro / Chrome (e46edcf). The record was already completed; pending-session resume, exact interruption timing and actual request deduplication remain unverified |
| Cache quota | Fail question-audio cache read/write | Existing received audio stays usable; local TTS/text fallback remains | Cache test passes; device pending |
| Raw corruption | Change/delete stored original after initial save | Recovery/submission detects mismatch or missing audio; never claims verified | Storage/handler tests pass; device pending |
| Training upload failure | Opt in; fail upload | Local practice remains; upload failure is visible | Existing behavior; device pending |
| Stalled response body | Return headers then stall STT/evaluation JSON; delay auth/Redis beyond deadline | Locks release; raw/text remain; no late provider call after cancellation | Client, budget and route fault tests pass; device pending |
| Legacy recording retry | Resume old successful chunks; interrupt next request; refresh or open a second tab | Successful text retained; unknown requests blocked; play/download still available | Atomic metadata/recovery tests pass; device pending |
| Simultaneous windows | Open this build in two windows; save in the first, close it, then continue in the second | One writer; blocked window cannot overwrite/delete; ownership transfers and latest records survive | User reported second-tab wait and transfer after closing first, with draft intact (872088f). Device/browser unspecified for this trial; other target browsers pending |
| Recovery explanation | Resume a draft with an unknown transcription result, then play the question via cloud/local voice | Empty/partial recovery explanation stays visible; saved text/audio stay intact; no repeated STT | User screenshot confirms the 480f7fe recovery explanation appears. Cloud/local playback retention regressions pass; full phone playback sequence and other devices pending |
| Late question audio | Start recording, change question or leave while question audio/auth is pending | Old response cannot play or start local fallback; current question remains playable | User confirmed question playback did not interfere with recording and replay stayed complete on vivo X100s Pro / Chrome (e46edcf). Exact pending-response timing, navigation/question-change cases and other devices remain pending; handler tests cover delayed responses |
| Received transcript write failure | Return a successful STT chunk, then fail local storage before the response checkpoint | Received text remains editable/exportable in memory, failure stays visible, no next chunk is requested; saving can be retried | Production-handler fault tests pass; real-device quota scenario pending |
| Server budgets | Dedicated Redis test backend; mock Provider | Atomic concurrent limits; duplicate rejected; each retry counted; failure stops paid work | Mock concurrency/limits and new hashed Session correlation tests pass; real Redis, production hard cap and invoice reconciliation pending |

Latest deployment evidence on 2026-09-24: the user reported deploying bf7feac. All seven public frontend scripts matched the local production build by SHA256, and the complete application CSS matched exactly; generated Tailwind utility rules and supporting defaults differ in the full CSS file. Backend commit/configuration were not independently verified. Documentation-only follow-up commits do not require a new application deployment.

Device adaptation now precedes further device acceptance at the user’s request. See [DEVICE_ADAPTATION.md](DEVICE_ADAPTATION.md): responsive desktop/mobile layouts, keyboard-aware dialogs, and 12 Chromium configurations / 168 page-state checks. These are isolated layout checks, not physical iPhone/Safari or desktop-microphone acceptance. The user skipped microphone-denial/manual-text testing; do not mark it passed.

Latest manual feedback: the user confirmed the interface, then reported failed desktop English transcription despite speaking English and hearing clear playback. They later suspected microphone permission but could not confirm the cause. At their explicit request, desktop STT is deferred for this stage, **not passed**; see [QA-001](QA_BACKLOG.md#qa-001电脑英语录音无法转写). No code fix has been made. The interface confirmation is not independent evidence that every iPhone rotation/keyboard case was exercised.

The user has no iPhone and explicitly skipped physical iPhone/Safari testing for this stage; see [QA-002](QA_BACKLOG.md#qa-002iphone-safari-真机验收无设备). This is unavailable hardware, not a passed compatibility result.

Next independent manual case: use the existing vivo X100s Pro / Chrome for an English pause/resume recording. Speak about 10 seconds, pause for 5 seconds, resume and speak about 10 more seconds, then stop. Both spoken parts must play completely and in order; the pause must not count as recorded speech time. Check that transcription covers both parts. Submit once, finish and reopen from Progress after refresh; text and complete audio must remain. This manual case is pending.

Target coverage remains Android Chrome, iPhone Safari and desktop Chrome, subject to the explicit deferrals above. Start with English. Mark Japanese separately until real language samples are available.

Per attempt, record: date, build SHA, device/browser, language, session identifier (or anonymized alias), duration, number of submitted answers, whether original playback succeeds after refresh, transcript/manual/skip status, provider attempts/chunks/retries, failure code, export-only outcome and actual account charge if available. Do not put access codes, tokens, raw private text or audio in public logs.

Keep denominators: unsuccessful attempts and export-only outcomes remain in the attempt count. Export-only is not retained-by-platform success. Fifty mixed-device attempts and three days without unresolved P0/P1 remain required; no such dataset exists yet.

Browser automation issue: `scripts/test-reliability-browser.mjs` did not complete after two allowed retries. Its APIs are mocked; it must not be counted as full browser acceptance. Screenshots/errors are in `.codex/qa/reliability-1790214176581/`.

## Single-writer rollout

New clients use one origin-wide [Web Locks lease](https://w3c.github.io/web-locks/#termination-of-locks) for Session history writes. A second window waits until the first closes. Existing recordings remain available for playback/download while editing is blocked. Unsupported or denied locks fail closed; no best-effort concurrent history writes are permitted.

After deployment, close older Oral tabs/PWA windows and open the new version. Old clients do not participate in this lock. Browser storage remains local; this does not add cross-device sync. Check refresh, closing the active window, closing a waiting window, and returning from browser back/forward on each target device. No phone compatibility claim is made from desktop API tests.

Offline evidence collection and calculation: see `docs/qa/V0_EVIDENCE.md`. An empty template is intentionally not a passing report.
