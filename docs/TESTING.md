# Testing — actual results (2026-10-22)
| Suite | Command | Result |
|---|---|---|
| Financial engine reference tests | `npm test` | **31/31 passed** |
| Typecheck | `npm run typecheck` | 0 errors |
| API E2E journey + security | `npm run test:e2e` | **36/36 passed** |
| Browser (Playwright, headless Chromium) | ad-hoc script | 13 pages rendered with 0 JS errors; register → project → template → wizard → autosave → reload persisted |

E2E covers: register/duplicate/weak password, 401/403, CSRF, project & plan limits, study creation, not-computable guard, autosave, 409 conflict,
template revenue derivation, compute, scenarios, balance-sheet balance, what-if, sensitivity, versions v1/v2, compare, reproducibility,
report export and figure match, feature gating, 5 cross-tenant isolation checks, admin API protection, checkout without admin price, retention.
