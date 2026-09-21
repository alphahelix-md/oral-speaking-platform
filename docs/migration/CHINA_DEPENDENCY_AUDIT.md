# China dependency audit

| Dependency | Purpose | Critical | Finding | Decision |
|---|---|---:|---|---|
| Vercel | Hosting | Yes | Overseas host | Retain as preview/rollback |
| GLM | STT/text | Yes | Mainland provider | China primary |
| DeepSeek | Text | Yes | Mainland provider | China primary/fallback |
| OpenAI | Optional STT/text | No | Overseas | Server-block in China |
| Supabase | Auth/audio storage | Yes when configured | Overseas hop | Omit from first smoke test; replace later |
| Upstash | STT quota | Yes | Overseas hop before STT | Replace before public launch |
| Edge TTS | Question voice | No | Must measure | Degradable auxiliary path |
| jsDelivr in `vad-check.html` | Diagnostic page | No | Overseas CDN | Not part of production path; vendor or remove later |

## Blockers

1. Supabase validation can block every protected API when configured.
2. Upstash failure can block GLM transcription.
3. The client could request OpenAI; China policy must be server-enforced.
4. Static hosting cannot execute the Route Handlers.

## Minimum safe test

CloudBase Run, `APP_REGION=china`, GLM STT, GLM/DeepSeek text, no Supabase variables, access-code protection, explicit test-only quota bypass, and no production DNS change.
