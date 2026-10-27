# Security
- Passwords: PBKDF2-SHA256 100k iterations, random salt; timing-safe compare; dummy hash on unknown email.
- Sessions: random 256-bit token in HttpOnly/SameSite=Lax/Secure(https) cookie; only SHA-256 stored; 14-day expiry; revoke all; revoked on password reset/suspension.
- Lockout after 5 failed logins (15 min); rate limits on login/register/forgot/contact.
- MFA: TOTP (RFC 6238) optional.
- CSRF: non-GET `/api/*` require same Origin + `X-Requested-With: fetch` (webhook exempt, signature-verified).
- Headers: CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy (hono/secure-headers).
- Authorization: server-side permission check per action (`role_permissions`), every resource query scoped by `org_id` → 404 for foreign IDs. Admin API restricted to platform roles.
- Input validation with zod on every write; parameterised SQL only.
- Uploads: MIME allow-list, 10MB cap, org-scoped keys, attachment disposition + nosniff.
- Webhooks: HMAC signature + idempotency table `payment_events`; payments never marked paid without verified event.
- Audit log for auth events, admin changes (before/after), exports, versions.
- Secrets only via `.dev.vars` / `wrangler secret put`; `.dev.vars` git-ignored.

## Checklist (verified by tests/e2e/api-flow.sh)
- [x] anonymous → 401 · [x] CSRF header → 403 · [x] cross-org read/write/delete/report download → 404 · [x] non-admin → admin API 403
- [x] stale write → 409 · [x] plan limits → 402 · [x] feature gates · [x] retention (archive instead of delete)
