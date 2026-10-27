# API
All endpoints under `/api`, JSON. Writes require header `X-Requested-With: fetch` and same-origin. Errors: `{ error: { code, message, details? } }`.
Codes: VALIDATION 400, UNAUTHORIZED 401, PLAN_LIMIT 402, FORBIDDEN/CSRF 403, NOT_FOUND 404, CONFLICT 409, RATE_LIMITED 429, PAYMENT_NOT_CONFIGURED 503.
See the route table in README.md and source in `src/routes/*.ts` (each route validates with zod — the schema is the contract).
