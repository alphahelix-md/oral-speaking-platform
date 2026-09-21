# Regional provider configuration

| Setting | China | Global |
|---|---|---|
| `APP_REGION` | `china` | `global` |
| STT | forced `glm` | configured `glm/basic` |
| Text allowlist | `deepseek,glm` | `openai,deepseek,glm` |
| Quota | test-only access-code mode, then mainland store | Upstash currently |

Server policy overrides browser preference. China never silently falls back to OpenAI.

Degradation: STT failure permits manual transcript; evaluation failure preserves transcript and local metrics; TTS falls back to cache/device/manual replay; upload stays queued locally.
