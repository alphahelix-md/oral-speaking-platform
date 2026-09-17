# Speech MVP

Flow: browser MediaRecorder and Web Audio sampling; local metrics; server-only `/api/transcribe`; editable transcript; existing text evaluation; separated content, delivery and pronunciation sections. Audio and history remain local to device. Supabase schema is future sync design, not active storage.

`SPEECH_PROVIDER=glm` selects GLM-ASR-2512, using the server-only `GLM_API_KEY`. The existing `basic` provider uses OpenAI. The text evaluator independently selects OpenAI, DeepSeek or GLM. Unsupported speech provider values fail explicitly. GLM-ASR may consume account credits; check the account's current price and quota before public testing.

On supported browsers, Web Speech recognition runs alongside MediaRecorder. If it yields no text, the recorded audio is decoded locally, converted to 16 kHz mono WAV, divided into 25-second chunks, and sent sequentially to GLM. GLM's documented limit is WAV/MP3, at most 25 MB and 30 seconds per request. This is a network service, not an offline recognizer. The recording remains on the user's device; each chunk is sent to GLM for transcription. If browser decoding or GLM fails, the user can replay and type the answer.

English/Japanese thresholds live in `languages/*/speech-config.ts`. Browser RMS sampling estimates speaking/silence and internal pauses; it does not identify phonemes, accent, intelligibility or a pronunciation score. A quiet microphone or noisy room can skew estimates. If Web Audio is unavailable, metrics explicitly show unavailable. Recordings shorter than 0.8 seconds are not sent to STT. A failed transcription can be retried on the same local Blob; manual text remains possible.

Future professional pronunciation and realtime providers have interfaces only. Do not show professional metrics until a genuine audio assessment provider is integrated. The result's AI text scores are practice indicators, not official IELTS/JLPT scores. Demo evaluation carries no numerical score.

For device QA: open HTTPS site on iOS Safari and Android Chrome; allow and deny microphone; record short and normal answers; pause/resume; stop twice; replay; retry analysis after simulated API failure; edit transcript; complete session; retry same question and compare attempts. Verify API key and beta access code server-side before public tests.
