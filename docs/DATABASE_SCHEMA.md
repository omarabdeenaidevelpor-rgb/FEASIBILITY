# Database schema
See `migrations/0001_initial_schema.sql` (authoritative). Highlights:
- Identity: users, sessions (hashed tokens), auth_tokens, login_attempts
- Tenancy: organizations, organization_members(role), role_permissions
- Billing: plans, subscriptions, subscription_usage(org, period, metric), coupons, payments(idempotency_key), payment_events(PK provider+event_id), invoices
- Templates: study_templates, study_template_versions(definition_json)
- Work: projects, feasibility_studies(inputs_json draft, last_result_json cache), study_versions (immutable snapshot incl. model/results/sources/ai, engine & template version)
- Evidence: market_sources (global or org), study_source_links(classification CHECK)
- Country rules: tax_profiles (effective dates, source, status), exchange_rates (source + as_of)
- Output: reports(study_version, report_version, format, checksum), uploaded_files
- AI: ai_jobs, ai_usage_logs · System: notifications, audit_logs, system_settings, articles, contact_messages
Soft delete: projects, studies, users, organizations, files (`deleted_at`). Studies with exported reports are archived, never deleted.
JSON columns are used for wizard drafts and immutable snapshots only; relational tables hold identity, billing, versions, sources and reports.
