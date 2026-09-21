# Deploy to Tencent CloudBase Run

## Owner actions required

1. Sign in to Tencent Cloud and create an isolated CloudBase Run test environment in mainland China.
2. Create a service from this repository/Dockerfile; container port `3000`.
3. Add variables from `.env.china.example` in the console. Never send secret values in chat.
4. Enable public access and stdout/CLS logs. Use the default domain for tests only.
5. Start with minimum instances `0`; change to `1` only if cold-start latency is unacceptable.

## Smoke test

1. Load, refresh and install/open the PWA.
2. English: auto question audio, manual replay, 10–30 s recording, duration, playback, transcript, report.
3. Japanese: kana playback, Japanese-only transcript, report.
4. Break TTS/upload separately; a recorded practice must remain recoverable.
5. Confirm logs contain request ID/provider/duration but no keys, access codes or audio.

Production additionally requires mainland quota storage, regional auth/storage decision, filed custom domain, HTTPS, cost alarms and rollback rehearsal. Do not change DNS during this test.

Official references:

- [CloudBase Run service settings](https://cloud.tencent.com/document/product/1243/77197)
- [CloudBase Run CLI](https://cloud.tencent.com/document/product/1243/76108)
- [CloudBase ICP filing FAQ](https://cloud.tencent.com/document/faq/876/128405)
