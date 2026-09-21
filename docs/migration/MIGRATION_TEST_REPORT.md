# Migration test report

Status: local Phase 1 preparation; not deployed to Tencent.

| Gate | Status |
|---|---|
| Dependency audit | Passed |
| Regional provider boundary | Passed: dedicated policy tests |
| Typecheck | Passed |
| Unit tests | Passed: 11 files, 36 tests |
| Global production build | Passed |
| China production build | Passed |
| Standalone server artifact | Passed: `.next/standalone/server.js` exists |
| Docker image build | Not run: Docker is not installed on this workstation |
| Tencent smoke test | Requires owner cloud action |
| Mainland mobile test | Requires Tencent test URL |

Acceptance: Vercel remains unchanged; China container serves the PWA; China cannot route to OpenAI; auxiliary failures do not discard the session; rollback uses a retained version.
