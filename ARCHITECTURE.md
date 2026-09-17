# Architecture

`core/speaking/engine.ts` is a language-neutral reducer: session lifecycle, questions, answers, attempt count, retry and evaluation state. `core/audio` handles MediaRecorder and local audio storage. `core/session` stores histories and computes progress. `languages/{en,ja}` define speech locale, levels, prompts, question banks, rubrics, and weaknesses. `training/config.ts` composes generic modes; `exams/ielts/bank.ts` holds reviewed practice sets and `exams/ielts/plan.ts` orders Parts 1–3, while TOEFL is a disabled placeholder. `lib/ai/server.ts` builds server-side prompt/rubric requests. Both languages render through `components/oral-app.tsx`.

Flow: language + mode + level + topic => session => record/stop => `/api/transcribe` => editable transcript => `/api/ai` follow-up => `/api/ai` evaluation => result/retry/progress. With no AI key, deterministic question bank and an explicitly unscored demo review take over. Audio never enters localStorage. Speech turns include language at session level, question, transcript, optional audio ID, timestamp and attempt number.

The planned realtime adapter can emit the same `QUESTION`, `ANSWER`, and `STATUS` actions from WebRTC/VAD events. It should not change the language module or shared UI. Database SQL is designed for authenticated storage, but is intentionally not connected until user auth and row policies exist.
