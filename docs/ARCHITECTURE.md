# Architecture

## Stack decision
The master prompt suggested Next.js + NestJS + PostgreSQL + Redis + BullMQ. The execution environment targets
**Cloudflare Pages/Workers**, which cannot host long-running Node servers, PostgreSQL, or Redis. We therefore use the
closest coherent edge-native equivalents rather than mixing incompatible stacks:

| Prompt suggestion | Implemented | Notes |
|---|---|---|
| Next.js + React | Vanilla JS SPA + Tailwind + Chart.js served by Hono | No heavy build; RTL native |
| NestJS REST + Swagger | Hono REST (`src/routes/*`), documented in API_DOCUMENTATION.md | zod validation server-side |
| PostgreSQL + Prisma | Cloudflare D1 (SQLite) + SQL migrations | FKs, CHECKs, UNIQUE, indexes |
| Redis/BullMQ | `ai_jobs` table + `executionCtx.waitUntil` + polling, dedupe & cancel | Swap to Cloudflare Queues later |
| S3 | Cloudflare R2 binding `FILES` (optional) | Upload disabled with clear message if unbound |
| PDF engine | Print-optimised HTML (@page, page counters) → browser "Save as PDF" | Full Arabic shaping; no headless browser on Workers |
| XLSX library | Minimal OOXML writer (`src/lib/xlsx.ts`) + fflate | Valid Excel 2007+ files, RTL sheets |

## Layout
```
packages/financial-engine/   pure TS engine (no UI/AI/DB) + validation + definitions
packages/templates/          template definitions generator (build.py → templates.json)
migrations/                  0001 schema, 0002 templates seed, 0003 config seed
src/index.tsx                app, security headers, CSRF, errors, health, public API, SPA shell
src/lib/                     auth, crypto (PBKDF2, TOTP), services (limits/audit/mail), ai, report, xlsx, study-model
src/routes/                  auth, core (projects/dashboard/org), studies, reports, billing, admin
public/static/js/            core, public, app, wizard, steps, results, admin, main
tests/financial/             vitest reference tests (31)
tests/e2e/api-flow.sh        API journey + isolation (36 checks)
```

## Data flow
Wizard inputs → `PUT /studies/:id/inputs` (draft JSON, optimistic concurrency) → `buildModel()` normalises →
`compute()` (engine) → results cached in `last_result_json`. "Save version" freezes inputs + model + results + sources +
AI outputs + template/engine versions in `study_versions`. Reports are regenerated deterministically from a version and
verified against the stored SHA-256 checksum.

AI receives engine results as READ-ONLY context; its outputs are stored separately and labelled in the UI/report.
