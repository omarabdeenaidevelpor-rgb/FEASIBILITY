-- FEASIBILITY AI — initial schema (Cloudflare D1 / SQLite)
-- Money amounts inside versions are stored as decimal strings/numbers in JSON snapshots that are immutable.
PRAGMA foreign_keys = ON;

-- ============ Identity ============
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  locale TEXT NOT NULL DEFAULT 'ar' CHECK (locale IN ('ar','en')),
  platform_role TEXT NOT NULL DEFAULT 'USER' CHECK (platform_role IN ('SUPER_ADMIN','ADMIN','USER')),
  email_verified_at TEXT,
  mfa_enabled INTEGER NOT NULL DEFAULT 0,
  mfa_secret TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,               -- sha256(token)
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip TEXT, user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS auth_tokens (
  id TEXT PRIMARY KEY,               -- sha256(token)
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify_email','reset_password')),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,                 -- ip or email
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_key ON login_attempts(key, created_at);

-- ============ Organizations & RBAC ============
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'personal' CHECK (type IN ('personal','company','consultancy')),
  logo_url TEXT,
  country TEXT NOT NULL DEFAULT 'EG',
  owner_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS organization_members (
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('ORGANIZATION_OWNER','ORGANIZATION_ADMIN','CONSULTANT','ANALYST','MEMBER','VIEWER','INDIVIDUAL_USER')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (org_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_members_user ON organization_members(user_id);

CREATE TABLE IF NOT EXISTS role_permissions (
  role TEXT NOT NULL,
  permission TEXT NOT NULL,
  PRIMARY KEY (role, permission)
);

-- ============ Plans & subscriptions ============
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,               -- free, pro, consultant, business
  name_ar TEXT NOT NULL, name_en TEXT NOT NULL,
  description_ar TEXT, description_en TEXT,
  price_monthly REAL,                -- NULL = price not set by admin yet
  price_yearly REAL,
  price_single_study REAL,
  currency TEXT NOT NULL DEFAULT 'EGP',
  max_projects INTEGER NOT NULL,
  max_studies INTEGER NOT NULL,
  max_ai_requests_month INTEGER NOT NULL,
  max_exports_month INTEGER NOT NULL,
  max_members INTEGER NOT NULL DEFAULT 1,
  features_json TEXT NOT NULL DEFAULT '[]',
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  status TEXT NOT NULL CHECK (status IN ('active','pending','canceled','expired','past_due')),
  billing_cycle TEXT NOT NULL DEFAULT 'none' CHECK (billing_cycle IN ('none','monthly','yearly')),
  current_period_start TEXT NOT NULL DEFAULT (datetime('now')),
  current_period_end TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  extra_study_credits INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_subs_org ON subscriptions(org_id, status);

CREATE TABLE IF NOT EXISTS subscription_usage (
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period TEXT NOT NULL,              -- YYYY-MM
  metric TEXT NOT NULL CHECK (metric IN ('ai_requests','exports','ai_tokens')),
  value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, period, metric)
);

CREATE TABLE IF NOT EXISTS coupons (
  code TEXT PRIMARY KEY COLLATE NOCASE,
  percent_off REAL CHECK (percent_off BETWEEN 0 AND 100),
  amount_off REAL,
  max_redemptions INTEGER,
  redemptions INTEGER NOT NULL DEFAULT 0,
  valid_until TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL,
  provider_ref TEXT,
  purpose TEXT NOT NULL CHECK (purpose IN ('subscription','single_study','credits')),
  plan_id TEXT, billing_cycle TEXT,
  amount REAL NOT NULL, currency TEXT NOT NULL,
  coupon_code TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending','succeeded','failed','refunded','canceled')),
  idempotency_key TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payments_org ON payments(org_id);

CREATE TABLE IF NOT EXISTS payment_events (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  payload TEXT,
  processed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (provider, event_id)   -- idempotency for webhooks
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  payment_id TEXT NOT NULL UNIQUE REFERENCES payments(id),
  amount REAL NOT NULL, currency TEXT NOT NULL,
  issued_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============ Templates ============
CREATE TABLE IF NOT EXISTS study_templates (
  id TEXT PRIMARY KEY,               -- e.g. restaurant
  sector TEXT NOT NULL,
  name_ar TEXT NOT NULL, name_en TEXT NOT NULL,
  icon TEXT, image TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  current_version INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS study_template_versions (
  template_id TEXT NOT NULL REFERENCES study_templates(id),
  version INTEGER NOT NULL,
  definition_json TEXT NOT NULL,     -- fields, units, cost/revenue elements, KPIs, risks, report structure, validations, sources
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (template_id, version)
);

-- ============ Projects & studies ============
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  sector TEXT,
  activity TEXT,
  country TEXT NOT NULL DEFAULT 'EG',
  governorate TEXT, city TEXT,
  currency TEXT NOT NULL DEFAULT 'EGP',
  legal_entity TEXT,
  size TEXT CHECK (size IN ('micro','small','medium','large') OR size IS NULL),
  initial_capital REAL CHECK (initial_capital IS NULL OR initial_capital >= 0),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(org_id, deleted_at, updated_at);

CREATE TABLE IF NOT EXISTS feasibility_studies (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  org_id TEXT NOT NULL REFERENCES organizations(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  template_id TEXT NOT NULL REFERENCES study_templates(id),
  template_version INTEGER NOT NULL,
  language TEXT NOT NULL DEFAULT 'ar',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_progress','computed','completed','archived')),
  current_step INTEGER NOT NULL DEFAULT 1,
  completion_pct INTEGER NOT NULL DEFAULT 0,
  inputs_json TEXT NOT NULL DEFAULT '{}',     -- working draft (autosaved)
  last_result_json TEXT,                      -- last computed (draft) result cache
  latest_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_studies_org ON feasibility_studies(org_id, deleted_at, updated_at);
CREATE INDEX IF NOT EXISTS idx_studies_project ON feasibility_studies(project_id);

-- Immutable snapshots
CREATE TABLE IF NOT EXISTS study_versions (
  id TEXT PRIMARY KEY,
  study_id TEXT NOT NULL REFERENCES feasibility_studies(id),
  version INTEGER NOT NULL,
  inputs_json TEXT NOT NULL,
  model_json TEXT NOT NULL,          -- normalized engine input
  results_json TEXT NOT NULL,        -- engine output incl. scenarios
  sources_json TEXT NOT NULL DEFAULT '[]',
  ai_outputs_json TEXT NOT NULL DEFAULT '{}',
  template_id TEXT NOT NULL, template_version INTEGER NOT NULL,
  engine_version TEXT NOT NULL,
  changelog TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (study_id, version)
);

CREATE TABLE IF NOT EXISTS scenarios (
  id TEXT PRIMARY KEY,
  study_id TEXT NOT NULL REFERENCES feasibility_studies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,                -- BASE, OPTIMISTIC, PESSIMISTIC, CUSTOM_x
  name TEXT NOT NULL,
  adjustments_json TEXT NOT NULL DEFAULT '{}',
  approved_by_user INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (study_id, code)
);

-- ============ Sources & evidence ============
CREATE TABLE IF NOT EXISTS market_sources (
  id TEXT PRIMARY KEY,
  org_id TEXT REFERENCES organizations(id),   -- NULL = global (admin curated)
  name TEXT NOT NULL,
  publisher TEXT,
  url TEXT,
  country TEXT,
  data_type TEXT,
  published_at TEXT,
  observed_at TEXT,
  updated_at TEXT,
  unit TEXT, currency TEXT,
  collection_method TEXT,
  reuse_terms TEXT,
  confidence TEXT NOT NULL DEFAULT 'medium' CHECK (confidence IN ('low','medium','high')),
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS study_source_links (
  id TEXT PRIMARY KEY,
  study_id TEXT NOT NULL REFERENCES feasibility_studies(id) ON DELETE CASCADE,
  source_id TEXT REFERENCES market_sources(id),
  section TEXT NOT NULL,             -- market, costs, revenue, ...
  claim TEXT NOT NULL,
  value TEXT,
  classification TEXT NOT NULL CHECK (classification IN ('VERIFIED','USER_PROVIDED','ESTIMATED','UNAVAILABLE','NEEDS_REVIEW')),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_links_study ON study_source_links(study_id);

-- ============ Country rules ============
CREATE TABLE IF NOT EXISTS tax_profiles (
  id TEXT PRIMARY KEY,
  country TEXT NOT NULL,
  name_ar TEXT NOT NULL, name_en TEXT NOT NULL,
  income_tax_pct REAL NOT NULL,
  vat_pct REAL,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  source_name TEXT, source_url TEXT,
  status TEXT NOT NULL DEFAULT 'NEEDS_REVIEW' CHECK (status IN ('VERIFIED','NEEDS_REVIEW')),
  notes TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS exchange_rates (
  id TEXT PRIMARY KEY,
  base TEXT NOT NULL, quote TEXT NOT NULL,
  rate REAL NOT NULL CHECK (rate > 0),
  as_of TEXT NOT NULL,
  source_name TEXT NOT NULL, source_url TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============ Reports ============
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  study_id TEXT NOT NULL REFERENCES feasibility_studies(id),
  org_id TEXT NOT NULL REFERENCES organizations(id),
  study_version INTEGER NOT NULL,
  report_version INTEGER NOT NULL,
  language TEXT NOT NULL DEFAULT 'ar',
  format TEXT NOT NULL CHECK (format IN ('html','pdf','xlsx')),
  checksum TEXT NOT NULL,            -- sha256 of results snapshot used
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (study_id, report_version, format)
);

CREATE TABLE IF NOT EXISTS uploaded_files (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  project_id TEXT REFERENCES projects(id),
  name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL,
  storage_key TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- ============ AI ============
CREATE TABLE IF NOT EXISTS ai_jobs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  study_id TEXT REFERENCES feasibility_studies(id),
  task TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','running','succeeded','failed','canceled')),
  input_json TEXT,
  output_json TEXT,
  error TEXT,
  model TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_study ON ai_jobs(study_id, task, created_at);

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT REFERENCES ai_jobs(id),
  org_id TEXT NOT NULL,
  model TEXT, prompt_tokens INTEGER, completion_tokens INTEGER,
  latency_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============ System ============
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL, body TEXT,
  link TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT,
  org_id TEXT,
  action TEXT NOT NULL,
  entity TEXT, entity_id TEXT,
  meta_json TEXT,
  ip TEXT,
  request_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT,
  body TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'ar',
  published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL, email TEXT NOT NULL, subject TEXT, message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
