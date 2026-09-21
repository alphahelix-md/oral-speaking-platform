# Current architecture

- Next.js 16 / React 19 PWA; UI and Node Route Handlers deploy together.
- Server endpoints: `/api/transcribe`, `/api/ai`, `/api/tts`.
- Browser persistence: localStorage, IndexedDB recording library, Cache Storage for question audio.
- Supabase: email-link auth, account metadata, consented training-audio storage.
- Upstash Redis REST: transcription daily quota.
- GLM: default STT. GLM, DeepSeek and OpenAI: text generation options.
- Microsoft Edge TTS: server question audio, with browser speech fallback.
- Vercel coupling is operational (environment, deploy, domain), not SDK-based. No `@vercel/*` runtime package or `vercel.json` exists.

The app is not a static export. China hosting must run the Next.js Node server because transcription, evaluation and TTS are server endpoints.
