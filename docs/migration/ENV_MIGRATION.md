# Environment migration

- Copy names, not values, into Tencent secret settings.
- Public-prefixed variables are browser-visible; never store secrets in them.
- Use `.env.china.example` for Tencent test and `.env.global.example` for Vercel/global.
- Leave Vercel Production variables unchanged.
- Do not set Supabase, Upstash or OpenAI in the first Tencent smoke test.
- `RATE_LIMIT_PROVIDER=access-code-only` is accepted only with `DEPLOYMENT_STAGE=test`; public launch requires a real mainland counter.
