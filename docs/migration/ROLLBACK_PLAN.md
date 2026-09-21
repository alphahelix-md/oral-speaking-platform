# Rollback plan

Before DNS cutover, Vercel remains production; stop the failed Tencent version after preserving logs.

After a future cutover:

1. Retain the last known-good CloudBase Run version.
2. Route 100% traffic back to it on regression.
3. Restore the prior DNS target only after TLS and health checks.
4. Never delete recordings or migrate databases during app rollback.
5. Preserve sanitized request IDs/logs.

Triggers: lost audio, major completion-rate drop, sustained STT/evaluation latency, widespread auth/provider failure, or secret exposure.
