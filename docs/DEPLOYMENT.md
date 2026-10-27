# Deployment (Cloudflare Pages)
1. `npx wrangler d1 create webapp-production` → put `database_id` in `wrangler.jsonc`.
2. `npm run db:migrate:prod`
3. Optional R2: `npx wrangler r2 bucket create webapp-files`, uncomment `r2_buckets` (binding `FILES`).
4. Secrets: `wrangler pages secret put OPENAI_API_KEY` (and OPENAI_BASE_URL, ADMIN_EMAILS, RESEND_API_KEY, MAIL_FROM, PAYMENT_PROVIDER, PAYMENT_WEBHOOK_SECRET). Set `APP_ENV=production`, `APP_URL=https://your-domain`.
5. `npm run deploy` (project name from meta).
6. Register with an email listed in ADMIN_EMAILS → SUPER_ADMIN. Set plan prices, review the tax profile (marked NEEDS_REVIEW) and add exchange rates with sources.
7. Smoke: `bash tests/e2e/api-flow.sh https://your-domain` (creates test users — run on staging).

Hosted (Genspark) deploy supports D1 + R2 only (no KV / cron), which matches this app.
In production the dev payment simulator and dev verification links are disabled automatically.
