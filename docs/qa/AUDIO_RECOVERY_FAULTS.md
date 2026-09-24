# Browser audio and long-recording fault checks

These checks use the c12a196 local production build, isolated Chromium profiles, synthetic oscillator audio captured by real MediaRecorder, and mocked APIs. External requests are blocked. No user recordings, real microphones, provider calls or production counters are used.

## Audio integrity: five cases passed

- Decoder failure: original audio is already verified before two decode failures; no STT request is sent. Audio-only submission and refresh retain identical original bytes.
- Corrupt or remove the raw record before submit: same-size byte corruption and missing originals block submission with a visible failure. Transcript export remains available; the in-memory original download matches its original hash. A new recording permits a single stable answer.
- Corrupt or remove the raw record before reload/resume: recovery detects the invalid original, keeps the transcript exportable and does not claim verified audio. A new recording restores a usable answer without repeating the old STT request.
- All five verify one answer after rapid double click, stable Turn ID, original metadata/hash, reload persistence and no unhandled page errors.

Initial run `audio-faults/1790261545697` passed four cases. Decoder failure initially used the wrong notification role in the harness; the visible product message uses status, not alert. The selector was corrected and only that case was rerun successfully in `1790261654542`. No application code was changed.

## Long recordings: two cases passed

Each records a real 65-second synthetic fixture in Chromium, enough for three 25-second chunks. The first mocked STT response succeeds, then:

- Refresh while the second response is in flight: the first segment remains; the second is uncertain; the third is never requested. Resume and submit retain the entire original plus the partial transcript, with only two mocked STT requests total.
- Receive the second response while localStorage writes fail: both received segments remain editable/exportable in memory; the persisted second chunk remains running until Retry save succeeds. The third is never requested. Retry save, double submit and reload retain both received segments and the full original, without resending either successful chunk.

Initial run `long-recovery/1790261776659` passed the checkpoint case. The refresh case had an inaccurate text selector; actual recovery content was correct. Only that case was rerun in `1790262026819` and passed. Failure evidence remains intact.

## Reproduction and limits

Scripts: `scripts/qa/audio-faults.mjs`, `scripts/qa/long-recovery.mjs`. Set existing `ORAL_PLAYWRIGHT_MODULES` and `ORAL_TEST_BROWSER`; `ORAL_TEST_ORIGIN` must be localhost/127.0.0.1 with a port. Optional single-case selectors: `ORAL_AUDIO_CASE`, `ORAL_LONG_CASE`. Each script writes its own timestamped evidence directory; no dependency installation is required.

Evidence: `.codex/qa/unattended-2026-09-24/verified-cases.json`, with case-level report paths, screenshots and fixture downloads. These are browser fault-injection results, not phone storage faults, real speech recognition quality, production billing, cross-device acceptance or a 50-attempt release sample. Previous unit/handler evidence is not recounted as new manual acceptance.
