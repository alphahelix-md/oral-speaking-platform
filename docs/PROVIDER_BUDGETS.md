# Provider attempt budgets — configuration and limits

This implementation uses the project's existing Upstash option. No new backend, credentials or account was created. No live budget settings have been changed.

## What is enforced when configured

Every external STT fetch, including GLM language correction, and every evaluation attempt reserves capacity before invocation. One Redis EVAL transaction checks account, site and Session totals for request count, PCM audio milliseconds and configured estimated cost. It also claims a stable operation ID. A concurrent/new request with that operation ID is rejected; an internal retry consumes another reservation. Maximum two attempts per operation.

Failed or uncertain requests are not automatically refunded. The provider may already have billed them. A budget-store failure stops new paid work. A final ledger-write failure is logged and does not discard an available provider response or retry the request.

Account/site counters use UTC dates, with two-day retention. Session counters and operation identities retain seven days. Within that window, duplicates return `REQUEST_ALREADY_STARTED`; response content is not stored in Redis. Account, Session and operation identifiers are hashed. Logs and ledger contain provider/model, duration, status and estimated reserve, not audio, transcript, credentials or complete prompts. A `response_received` STT entry means an HTTP response arrived, not that transcript parsing or language validation succeeded.

Without configured account auth, one access code shares one allowance. IP changes cannot reset that code's bucket. Session IDs are client supplied; account and global caps remain authoritative even if a client invents new Session IDs.

## Deadline and retry contract

The shared maximum is two actual provider attempts, including any future approved fallback. With no fallback configured, the primary can retry once. If an approved fallback is later configured, it takes the second slot; there is no third slot. No fallback is enabled by this change.

Evaluation has a 21-second server deadline starting before authentication/body parsing, with at most 10 seconds per attempt. Transcription has a 45-second overall server deadline. Budget reads/reservations and provider requests share cancellation; late auth or reservation responses cannot start a provider request. Client deadlines are 25 seconds for evaluation and 60 seconds for transcription, including auth headers and response bodies. A client timeout remains an unknown result; it is not proof that a provider did not bill.

The reservation is committed before the provider call. Final ledger updates are optional, bounded best-effort updates outside the response path: a stalled final write must never discard received output or cause another paid retry. Process termination can leave a `reserved` receipt without a final marker; reconciliation remains required and no refund is inferred.

## Manual configuration still required

- `RATE_LIMIT_PROVIDER=access-code-only` with `DEPLOYMENT_STAGE=test` remains explicitly unmetered test mode. It has no daily hard cap. Never describe it as Cost Governor enabled.
- Enforced production mode uses `RATE_LIMIT_PROVIDER=upstash`, existing Upstash credentials and every `BUDGET_*` setting in `.env.example`; `BETA_DAILY_REQUEST_LIMIT` is the per-account daily provider-attempt limit.
- `GLOBAL` and `ACCOUNT` limits are daily; `SESSION` limits apply to the session counter. Audio budgets count each actual chunk/retry again.
- Cost settings use integer micro-USD (1 USD = 1,000,000 micro-USD). Fill values from verified account pricing and request-size limits. Defaults are deliberately blank. These are estimate-based reserves, **not invoice-accurate financial caps**. Underestimated per-attempt prices can still allow actual spending above the configured estimate. Bill reconciliation and token-level cost calculation remain unfinished.
- Missing or invalid enforced-mode settings fail closed. This can make STT/AI unavailable until configured; local recording, typed input, raw download and scoreless review remain available.

No Supabase budget migration was applied. Migration to Supabase atomic counters is still a later ROADMAP item. TTS currently retains its existing access guard and device cache; the new paid-attempt budget covers STT and evaluation only.

## Validation status

Automated tests cover request ordering, rejection before provider calls, duplicate operation IDs, internal retries, failure/ambiguity propagation, estimated reservations and PCM-derived duration. Actual Redis Lua execution/concurrency is **not yet validated**: no local Redis/Lua runtime was available, and no new external service was provisioned.

Before enabling enforced mode, use a dedicated test namespace/database to verify concurrent duplicate requests, account/global/session limit boundaries, UTC rollover, Redis timeout, retries and ledger retention. Do not test against production user counters. No paid model is needed; mock provider responses.

Protocol references: [Upstash REST command body](https://upstash.com/docs/redis/features/restapi#post-command-in-body), [Redis EVAL](https://redis.io/docs/latest/commands/eval/). The implementation uses an atomic script rather than a non-atomic REST pipeline.

## Reproducible Redis check (manual, not run yet)

`scripts/test-budget-redis.mjs` extracts the actual production Lua from `lib/ai/budget.ts`.
It does not load `.env.local`, call models, or touch production key prefixes. The run
uses a random Redis hash-tag namespace and deletes only its own enumerated keys.
It makes approximately 150 Redis commands; use a dedicated test database. No new
Redis service or credential has been created for this task.

Offline, no network:

```powershell
node scripts/test-budget-redis.mjs --check
```

For the live check, manually supply `ORAL_REDIS_TEST_URL` and `ORAL_REDIS_TEST_TOKEN`
as environment variables from the dedicated database. Do not paste credentials into
logs or handoffs. Then:

```powershell
$env:ORAL_REDIS_TEST_ACK = 'isolated-test-database'
node scripts/test-budget-redis.mjs --run
```

Twelve scenarios check concurrent duplicate ownership, all nine scope/metric limits,
two-attempt accounting, and TTLs. Success here does not validate actual provider
billing, UI, route/network timeouts, or UTC rollover key construction. Cleanup failure
is a test failure; leftover reservation keys expire within seven days.
