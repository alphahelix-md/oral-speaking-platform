# Oral — AI Speaking Trainer

Mobile-first PWA for English IELTS/Daily Conversation and Japanese Daily/Scenario Practice. Shared speaking engine; language and exam rules live in configuration modules.

## Run

Node 20.9+ required. `npm install`, then `npm run dev`; open http://localhost:3000. Run `npm run typecheck`, `npm test`, `npm run build` before deployment. On a phone, use an HTTPS deployment; microphone access usually requires a secure context.

Copy `.env.example` to `.env.local` and set `OPENAI_API_KEY` for server-side speech transcription, adaptive follow-ups, and evaluation. No key: explicitly labelled demo mode, with local recording, editable manual transcript, deterministic questions, and no fabricated scores. API calls originate from server routes; the key never goes to the browser.

## Data and deployment

Sessions persist in browser localStorage; audio blobs persist in IndexedDB on the same device. No sign-in or cross-device sync yet. Clearing site data deletes them. `supabase/schema.sql` is a future authenticated sync schema, not a live integration. Set the optional Supabase environment variables only after implementing auth and owner-scoped policies. Never expose a service-role key in browser code.

Deploy as a Next.js app on Vercel with `OPENAI_API_KEY` set as a server environment variable. Use HTTPS. Open in Safari/Chrome and choose Add to Home Screen/Install App. The service worker caches the shell for limited offline use; AI calls need network. The SVG app icon is a placeholder.

## Current boundaries

AI questions are text displayed on screen; optional browser speech synthesis reads them aloud. The first question comes from a curated local bank. Audio is sent to OpenAI only if a key is configured. Evaluation is transcript-based and does not score pronunciation. AI endpoints have input limits but need auth/rate limiting before public launch. IELTS is practice, never official band scoring. Japanese levels are informal difficulty guides, not JLPT oral scores. TOEFL, topic/free-talk/interview/weakness drills, realtime WebRTC, account sync, and reliable streaks remain roadmap items.
