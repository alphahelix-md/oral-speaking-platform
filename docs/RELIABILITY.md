# Reliability implementation — 2026-09-24

Scope: ROADMAP V0 recording protection and unfinished practice recovery.

- Raw MediaRecorder bytes are stored before decoding/STT, with SHA-256 readback. WAV is an optional separate playback cache. Save failure retains the raw download; an unverified recording cannot be committed as retained.
- Sessions store the current question, stable draft Turn ID, edited text, original audio reference, metrics, IELTS part and stage. Home and the recording library offer recovery. Submission persists the answer and next question in one localStorage snapshot before clearing the editor.
- Each STT chunk is checkpointed before and after its request. Succeeded chunks are reused. Requests interrupted before their result was durably stored remain uncertain; use edited text or keep the untranscribed recording. Evaluation similarly records a claim before sending and falls back to a scoreless review after an interrupted request.
- No new provider, dependency, credential or paid benchmark. Existing recording metadata and saved-session formats remain readable. Stale revisions are rejected to reduce accidental overwrites; this is not distributed, server-side exactly-once processing.

Validation at the first checkpoint: 90 automated tests (17 files), TypeScript, production build. The unattended follow-up added export/manual-fallback and provider-budget tests; see the dated log for the latest totals. Tests include real production-handler execution with mocked browser/service boundaries. Headless Edge acceptance did not complete after two retries because page automation was unstable; evidence lives in `.codex/qa/`. Do not count this as real-device acceptance or V0 exit.

Manual deployment/acceptance still required:
1. Deploy the pushed `codex/cloudbase-run-test` commit through the existing CloudBase workflow.
2. Android Chrome, iPhone Safari, desktop Chrome: edit text then refresh; record then refresh during STT; resume, play, edit and submit twice; inspect exactly one answer.
3. Finish during a mocked/failed evaluation, refresh and finish again: no repeated evaluation and a scoreless review.
4. Fill local storage / deny audio storage / interrupt network / make decoder fail: no false saved indication; raw export or manual fallback remains available.

Limits: active recording killed by the OS is not guaranteed recoverable; clearing browser data removes local drafts; server-side budget/idempotency code is prepared but not enabled or live-validated (see PROVIDER_BUDGETS.md); durable training-upload jobs remain unfinished. No fallback model is enabled.

Rollback reference: deployed baseline `8eb03ab`. The old UI cannot recover the new draft fields, so export outstanding drafts before intentionally deploying the baseline. No database migration is needed for this batch.


Follow-up changes: save failures expose a JSON text/draft backup (audio is downloaded separately); manual text edits survive remaining STT chunks; pure-text, skipped/partial transcription and removed recordings have explicit states. Full or blocked preference/cache storage no longer prevents manual recovery. Production-enforced budget configuration is documented separately and is not needed to keep the existing explicitly unmetered test mode unchanged.
