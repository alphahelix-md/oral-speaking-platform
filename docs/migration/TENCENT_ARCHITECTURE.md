# Tencent target architecture

## Test

```text
Tester -> CloudBase Run default HTTPS domain
       -> one Next.js standalone container
       -> GLM STT
       -> DeepSeek/GLM evaluation
       -> optional Edge TTS
       -> local browser persistence
```

## Production target

```text
Filed China domain -> CloudBase Run versions/grey release
                   -> mainland model providers
                   -> mainland quota store
                   -> regional auth + object storage
                   -> CLS logs

Vercel -> unchanged global preview/rollback
```

CloudBase Run is the minimum-change target: current Tencent documentation supports Dockerfile builds, environment variables, default test domains, custom filed domains, version traffic and rollback. Static hosting alone is insufficient.

Official references:

- [CloudBase Run service settings](https://cloud.tencent.com/document/product/1243/77197)
- [CloudBase Run product capabilities](https://cloud.tencent.com/document/product/1243/46250)
- [CloudBase Run deployment overview](https://cloud.tencent.com/document/product/1243/49235)
