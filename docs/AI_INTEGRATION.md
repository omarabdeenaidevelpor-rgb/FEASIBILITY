# AI Integration
- Provider-agnostic OpenAI-compatible Chat Completions (`src/lib/ai.ts`). Configure `OPENAI_API_KEY`, `OPENAI_BASE_URL`; model from admin settings.
- Tasks: analyze_idea, suggest_assumptions, market_analysis, risks, explain_results, review_consistency, report_narrative.
- Each task has a strict JSON Schema (`response_format: json_schema`) and a zod validator; invalid output is retried (max 3) then failed.
- User data wrapped in `<untrusted_user_data>`; system prompt forbids following embedded instructions, inventing sources/prices, or changing engine numbers.
- Engine results passed as `engine_results_READ_ONLY` (toggle `send_financials_to_ai`).
- Jobs: `ai_jobs` (queued/running/succeeded/failed/canceled), dedupe within 5 min, cancel endpoint, admin "mark failed", per-plan monthly request limits, platform monthly token cap, `ai_usage_logs`.
- Failure of the provider never blocks editing or computing (engine is independent).
- Status in this sandbox: the configured proxy returns `free_plan_block` → jobs fail with `AI_PROVIDER_BLOCKED` and a clear message. Supply a working key to enable.
