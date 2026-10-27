import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../lib/types'
import { requirePlatformAdmin } from '../lib/auth'
import { parseBody, paging, notFound, bad, safeJson } from '../lib/http'
import { audit } from '../lib/services'
import { uuid } from '../lib/crypto'
import { aiConfigured } from '../lib/ai'

const r = new Hono<AppEnv>()
r.use('*', requirePlatformAdmin)

r.get('/stats', async (c) => {
  const s = await c.env.DB.prepare(`SELECT
    (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) AS users,
    (SELECT COUNT(*) FROM users WHERE created_at > datetime('now','-30 days')) AS new_users_30d,
    (SELECT COUNT(*) FROM organizations WHERE deleted_at IS NULL) AS organizations,
    (SELECT COUNT(*) FROM projects WHERE deleted_at IS NULL) AS projects,
    (SELECT COUNT(*) FROM feasibility_studies WHERE deleted_at IS NULL) AS studies,
    (SELECT COUNT(*) FROM reports) AS reports,
    (SELECT COUNT(*) FROM subscriptions WHERE status='active' AND plan_id!='free') AS paid_subscriptions,
    (SELECT COALESCE(SUM(amount),0) FROM payments WHERE status='succeeded') AS revenue,
    (SELECT COUNT(*) FROM ai_jobs) AS ai_jobs,
    (SELECT COUNT(*) FROM ai_jobs WHERE status='failed') AS ai_failed,
    (SELECT COALESCE(SUM(prompt_tokens+completion_tokens),0) FROM ai_usage_logs WHERE created_at > datetime('now','start of month')) AS ai_tokens_month,
    (SELECT COUNT(*) FROM contact_messages WHERE status='new') AS new_messages,
    (SELECT COUNT(*) FROM purchase_requests WHERE status='new') AS new_purchase_requests`).first()
  const plans = await c.env.DB.prepare(`SELECT plan_id, COUNT(*) AS n FROM subscriptions WHERE status='active' GROUP BY plan_id`).all()
  return c.json({ stats: s, plansDistribution: plans.results, aiConfigured: aiConfigured(c.env), paymentProvider: c.env.PAYMENT_PROVIDER || 'none', storage: !!c.env.FILES })
})

r.get('/users', async (c) => {
  const { page, pageSize, offset } = paging(c)
  const q = (c.req.query('q') || '').trim()
  const rows = await c.env.DB.prepare(`SELECT u.id,u.name,u.email,u.platform_role,u.status,u.email_verified_at,u.created_at,u.last_login_at,
     (SELECT o.name FROM organization_members m JOIN organizations o ON o.id=m.org_id WHERE m.user_id=u.id LIMIT 1) AS org_name
     FROM users u WHERE u.deleted_at IS NULL AND (?1='' OR u.email LIKE '%'||?1||'%' OR u.name LIKE '%'||?1||'%') ORDER BY u.created_at DESC LIMIT ?2 OFFSET ?3`).bind(q, pageSize, offset).all()
  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM users WHERE deleted_at IS NULL AND (?1='' OR email LIKE '%'||?1||'%' OR name LIKE '%'||?1||'%')`).bind(q).first<any>()
  return c.json({ items: rows.results, total: total.n, page, pageSize })
})

r.patch('/users/:id', async (c) => {
  const b = await parseBody(c, z.object({ status: z.enum(['active', 'suspended']).optional(), platform_role: z.enum(['USER', 'ADMIN', 'SUPER_ADMIN']).optional() }))
  const me = c.get('user')!
  if (b.platform_role && me.platform_role !== 'SUPER_ADMIN') throw bad('FORBIDDEN', 'تعديل الأدوار يتطلب SUPER_ADMIN')
  if (c.req.param('id') === me.id) throw bad('SELF', 'لا يمكنك تعديل حسابك من هنا')
  await c.env.DB.prepare(`UPDATE users SET status=COALESCE(?,status), platform_role=COALESCE(?,platform_role), updated_at=datetime('now') WHERE id=?`).bind(b.status ?? null, b.platform_role ?? null, c.req.param('id')).run()
  if (b.status === 'suspended') await c.env.DB.prepare(`UPDATE sessions SET revoked_at=datetime('now') WHERE user_id=? AND revoked_at IS NULL`).bind(c.req.param('id')).run()
  await audit(c, 'admin.user_update', 'user', c.req.param('id'), b)
  return c.json({ ok: true })
})

r.get('/organizations', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT o.*, (SELECT COUNT(*) FROM organization_members WHERE org_id=o.id) AS members, (SELECT COUNT(*) FROM feasibility_studies WHERE org_id=o.id AND deleted_at IS NULL) AS studies,
    (SELECT plan_id FROM subscriptions WHERE org_id=o.id AND status='active' ORDER BY created_at DESC LIMIT 1) AS plan FROM organizations o WHERE o.deleted_at IS NULL ORDER BY o.created_at DESC LIMIT 200`).all()
  return c.json({ items: rows.results })
})

r.post('/organizations/:id/subscription', async (c) => {
  const b = await parseBody(c, z.object({ planId: z.string(), months: z.number().int().min(1).max(36), reason: z.string().min(3).max(300) }))
  const p = await c.env.DB.prepare('SELECT id FROM plans WHERE id=?').bind(b.planId).first()
  if (!p) throw notFound('الباقة غير موجودة')
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE subscriptions SET status='canceled' WHERE org_id=? AND status='active'`).bind(c.req.param('id')),
    c.env.DB.prepare(`INSERT INTO subscriptions (id,org_id,plan_id,status,billing_cycle,current_period_end) VALUES (?,?,?,'active','none',datetime('now',?))`).bind(uuid(), c.req.param('id'), b.planId, `+${b.months} months`)
  ])
  await audit(c, 'admin.subscription_grant', 'org', c.req.param('id'), b)
  return c.json({ ok: true })
})

/* Plans */
r.get('/plans', async (c) => c.json({ items: (await c.env.DB.prepare('SELECT * FROM plans ORDER BY sort_order').all()).results }))
r.put('/plans/:id', async (c) => {
  const num = z.number().nonnegative().nullable()
  const b = await parseBody(c, z.object({ name_ar: z.string().min(2).max(60), name_en: z.string().min(2).max(60), description_ar: z.string().max(300).nullable().optional(),
    price_monthly: num, price_yearly: num, price_single_study: num, currency: z.string().length(3),
    max_projects: z.number().int().min(0), max_studies: z.number().int().min(0), max_ai_requests_month: z.number().int().min(0), max_exports_month: z.number().int().min(0), max_members: z.number().int().min(1),
    features: z.array(z.string().max(40)).max(30), is_active: z.boolean() }))
  const before = await c.env.DB.prepare('SELECT * FROM plans WHERE id=?').bind(c.req.param('id')).first()
  if (!before) throw notFound()
  await c.env.DB.prepare(`UPDATE plans SET name_ar=?,name_en=?,description_ar=?,price_monthly=?,price_yearly=?,price_single_study=?,currency=?,max_projects=?,max_studies=?,max_ai_requests_month=?,max_exports_month=?,max_members=?,features_json=?,is_active=?,updated_at=datetime('now') WHERE id=?`)
    .bind(b.name_ar, b.name_en, b.description_ar ?? null, b.price_monthly, b.price_yearly, b.price_single_study, b.currency, b.max_projects, b.max_studies, b.max_ai_requests_month, b.max_exports_month, b.max_members, JSON.stringify(b.features), b.is_active ? 1 : 0, c.req.param('id')).run()
  await audit(c, 'admin.plan_update', 'plan', c.req.param('id'), { before, after: b })
  return c.json({ ok: true })
})

/* Coupons */
r.get('/coupons', async (c) => c.json({ items: (await c.env.DB.prepare('SELECT * FROM coupons ORDER BY created_at DESC').all()).results }))
r.post('/coupons', async (c) => {
  const b = await parseBody(c, z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{3,30}$/), percent_off: z.number().min(0).max(100).nullable().optional(), amount_off: z.number().min(0).nullable().optional(), max_redemptions: z.number().int().min(1).nullable().optional(), valid_until: z.string().max(20).nullable().optional() }))
  if (!b.percent_off && !b.amount_off) throw bad('COUPON', 'حدد نسبة خصم أو مبلغ خصم')
  await c.env.DB.prepare('INSERT INTO coupons (code,percent_off,amount_off,max_redemptions,valid_until) VALUES (?,?,?,?,?)').bind(b.code, b.percent_off ?? null, b.amount_off ?? null, b.max_redemptions ?? null, b.valid_until || null).run()
  await audit(c, 'admin.coupon_create', 'coupon', b.code)
  return c.json({ ok: true }, 201)
})
r.post('/coupons/:code/toggle', async (c) => {
  await c.env.DB.prepare('UPDATE coupons SET is_active = 1 - is_active WHERE code=?').bind(c.req.param('code')).run()
  await audit(c, 'admin.coupon_toggle', 'coupon', c.req.param('code'))
  return c.json({ ok: true })
})

/* Templates — versioned: editing creates a new version, old studies keep theirs */
r.get('/templates', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT t.*, (SELECT COUNT(*) FROM feasibility_studies s WHERE s.template_id=t.id) AS studies FROM study_templates t ORDER BY sort_order`).all()
  return c.json({ items: rows.results })
})
r.get('/templates/:id', async (c) => {
  const t = await c.env.DB.prepare('SELECT * FROM study_templates WHERE id=?').bind(c.req.param('id')).first<any>()
  if (!t) throw notFound()
  const versions = await c.env.DB.prepare('SELECT version, created_at, created_by, definition_json FROM study_template_versions WHERE template_id=? ORDER BY version DESC').bind(t.id).all<any>()
  return c.json({ template: t, versions: versions.results.map(v => ({ ...v, definition: safeJson(v.definition_json, {}), definition_json: undefined })) })
})
r.post('/templates/:id/toggle', async (c) => {
  await c.env.DB.prepare('UPDATE study_templates SET is_active = 1 - is_active WHERE id=?').bind(c.req.param('id')).run()
  await audit(c, 'admin.template_toggle', 'template', c.req.param('id'))
  return c.json({ ok: true })
})
r.post('/templates/:id/versions', async (c) => {
  const b = await parseBody(c, z.object({ definition: z.object({ fields: z.array(z.any()), suggested: z.any(), kpis: z.array(z.string()), risks: z.array(z.string()), reportSections: z.array(z.string()) }).passthrough() }))
  const t = await c.env.DB.prepare('SELECT * FROM study_templates WHERE id=?').bind(c.req.param('id')).first<any>()
  if (!t) throw notFound()
  const nv = t.current_version + 1
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO study_template_versions (template_id,version,definition_json,created_by) VALUES (?,?,?,?)').bind(t.id, nv, JSON.stringify(b.definition), c.get('user')!.id),
    c.env.DB.prepare('UPDATE study_templates SET current_version=? WHERE id=?').bind(nv, t.id)
  ])
  await audit(c, 'admin.template_version', 'template', t.id, { version: nv })
  return c.json({ version: nv }, 201)
})

/* Global sources, tax profiles, exchange rates */
r.post('/sources', async (c) => {
  const b = await parseBody(c, z.object({ name: z.string().min(2).max(200), publisher: z.string().max(200).optional(), url: z.string().url().optional(), country: z.string().max(10).optional(), data_type: z.string().max(100).optional(), confidence: z.enum(['low', 'medium', 'high']).default('high'), notes: z.string().max(1000).optional() }))
  const id = uuid()
  await c.env.DB.prepare(`INSERT INTO market_sources (id,org_id,name,publisher,url,country,data_type,confidence,notes,observed_at,created_by) VALUES (?,NULL,?,?,?,?,?,?,?,date('now'),?)`).bind(id, b.name, b.publisher ?? null, b.url ?? null, b.country ?? null, b.data_type ?? null, b.confidence, b.notes ?? null, c.get('user')!.id).run()
  await audit(c, 'admin.source_create', 'source', id)
  return c.json({ id }, 201)
})
r.get('/tax-profiles', async (c) => c.json({ items: (await c.env.DB.prepare('SELECT * FROM tax_profiles ORDER BY country, effective_from DESC').all()).results }))
r.put('/tax-profiles/:id', async (c) => {
  const b = await parseBody(c, z.object({ income_tax_pct: z.number().min(0).max(100), vat_pct: z.number().min(0).max(100).nullable(), effective_from: z.string(), effective_to: z.string().nullable().optional(), source_name: z.string().max(200), source_url: z.string().max(300).nullable().optional(), status: z.enum(['VERIFIED', 'NEEDS_REVIEW']), notes: z.string().max(1000).nullable().optional() }))
  await c.env.DB.prepare(`UPDATE tax_profiles SET income_tax_pct=?,vat_pct=?,effective_from=?,effective_to=?,source_name=?,source_url=?,status=?,notes=?,updated_at=datetime('now') WHERE id=?`)
    .bind(b.income_tax_pct, b.vat_pct, b.effective_from, b.effective_to ?? null, b.source_name, b.source_url ?? null, b.status, b.notes ?? null, c.req.param('id')).run()
  await audit(c, 'admin.tax_profile_update', 'tax_profile', c.req.param('id'), b)
  return c.json({ ok: true })
})
r.post('/exchange-rates', async (c) => {
  const b = await parseBody(c, z.object({ base: z.string().length(3), quote: z.string().length(3), rate: z.number().positive(), as_of: z.string().min(8).max(20), source_name: z.string().min(2).max(200), source_url: z.string().max(300).optional() }))
  const id = uuid()
  await c.env.DB.prepare('INSERT INTO exchange_rates (id,base,quote,rate,as_of,source_name,source_url,created_by) VALUES (?,?,?,?,?,?,?,?)').bind(id, b.base.toUpperCase(), b.quote.toUpperCase(), b.rate, b.as_of, b.source_name, b.source_url ?? null, c.get('user')!.id).run()
  await audit(c, 'admin.fx_create', 'exchange_rate', id, b)
  return c.json({ id }, 201)
})

/* AI jobs monitoring */
r.get('/ai-jobs', async (c) => {
  const status = c.req.query('status') || ''
  const rows = await c.env.DB.prepare(`SELECT j.id,j.task,j.status,j.error,j.model,j.attempts,j.created_at,j.finished_at,o.name AS org_name FROM ai_jobs j JOIN organizations o ON o.id=j.org_id WHERE (?1='' OR j.status=?1) ORDER BY j.created_at DESC LIMIT 100`).bind(status).all()
  const usage = await c.env.DB.prepare(`SELECT model, COUNT(*) AS calls, SUM(prompt_tokens) AS prompt, SUM(completion_tokens) AS completion, AVG(latency_ms) AS avg_latency FROM ai_usage_logs WHERE created_at > datetime('now','-30 days') GROUP BY model`).all()
  return c.json({ items: rows.results, usage: usage.results })
})
r.post('/ai-jobs/:id/mark-failed', async (c) => {
  await c.env.DB.prepare(`UPDATE ai_jobs SET status='failed', error=COALESCE(error,'stuck: marked failed by admin'), finished_at=datetime('now') WHERE id=? AND status IN ('queued','running')`).bind(c.req.param('id')).run()
  await audit(c, 'admin.ai_job_fail', 'ai_job', c.req.param('id'))
  return c.json({ ok: true })
})

/* Settings */
r.get('/settings', async (c) => {
  const rows = await c.env.DB.prepare('SELECT key,value,updated_at FROM system_settings').all<any>()
  return c.json({ items: Object.fromEntries(rows.results.map(r => [r.key, safeJson(r.value, {})])) })
})
r.put('/settings/:key', async (c) => {
  const key = c.req.param('key')
  if (!['platform', 'ai', 'payments', 'catalog'].includes(key)) throw bad('KEY', 'مفتاح إعداد غير معروف')
  const body = await parseBody(c, z.record(z.string(), z.any()))
  if (key === 'platform') {
    for (const k of ['primary', 'accent']) if (body[k] && !/^#[0-9a-fA-F]{6}$/.test(body[k])) throw bad('COLOR', 'لون غير صالح')
    if (body.logo && !/^(\/static\/|https:\/\/)/.test(body.logo)) throw bad('LOGO', 'رابط الشعار يجب أن يبدأ بـ /static/ أو https://')
  }
  if (key === 'catalog') {
    if (body.whatsapp !== undefined && !/^[1-9][0-9]{7,14}$/.test(String(body.whatsapp))) throw bad('WHATSAPP', 'رقم واتساب بصيغة دولية بدون + أو أصفار بادئة (مثال: 201008338490)')
    if (body.intro !== undefined && String(body.intro).length > 500) throw bad('INTRO', 'النص التعريفي طويل جدًا')
  }
  if (key === 'ai' && body.model && !['gpt-5', 'gpt-5.1', 'gpt-5.2', 'gpt-5-mini', 'gpt-5-nano'].includes(body.model)) throw bad('MODEL', 'نموذج غير مدعوم')
  const before = await c.env.DB.prepare('SELECT value FROM system_settings WHERE key=?').bind(key).first<any>()
  const merged = { ...safeJson(before?.value, {}), ...body }
  await c.env.DB.prepare(`INSERT INTO system_settings (key,value,updated_by,updated_at) VALUES (?,?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_by=excluded.updated_by, updated_at=excluded.updated_at`).bind(key, JSON.stringify(merged), c.get('user')!.id).run()
  await audit(c, 'admin.settings_update', 'setting', key, { before: safeJson(before?.value, {}), after: merged })
  return c.json({ ok: true })
})

/* Content: articles */
r.get('/articles', async (c) => c.json({ items: (await c.env.DB.prepare('SELECT id,slug,title,published,updated_at FROM articles ORDER BY updated_at DESC').all()).results }))
r.post('/articles', async (c) => {
  const b = await parseBody(c, z.object({ id: z.string().optional(), slug: z.string().regex(/^[a-z0-9-]{3,80}$/), title: z.string().min(3).max(200), excerpt: z.string().max(400).optional(), body: z.string().min(10).max(50000), published: z.boolean() }))
  const id = b.id || uuid()
  await c.env.DB.prepare(`INSERT INTO articles (id,slug,title,excerpt,body,published) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET slug=excluded.slug,title=excluded.title,excerpt=excluded.excerpt,body=excluded.body,published=excluded.published,updated_at=datetime('now')`)
    .bind(id, b.slug, b.title, b.excerpt ?? null, b.body, b.published ? 1 : 0).run()
  await audit(c, 'admin.article_save', 'article', id)
  return c.json({ id })
})
r.delete('/articles/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM articles WHERE id=?').bind(c.req.param('id')).run()
  await audit(c, 'admin.article_delete', 'article', c.req.param('id'))
  return c.json({ ok: true })
})

r.get('/messages', async (c) => c.json({ items: (await c.env.DB.prepare('SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 100').all()).results }))
r.get('/payments', async (c) => c.json({ items: (await c.env.DB.prepare('SELECT p.*, o.name AS org_name FROM payments p JOIN organizations o ON o.id=p.org_id ORDER BY p.created_at DESC LIMIT 200').all()).results }))
r.get('/reports', async (c) => c.json({ items: (await c.env.DB.prepare('SELECT r.id,r.format,r.study_version,r.report_version,r.created_at,s.title,o.name AS org_name FROM reports r JOIN feasibility_studies s ON s.id=r.study_id JOIN organizations o ON o.id=r.org_id ORDER BY r.created_at DESC LIMIT 200').all()).results }))

r.get('/audit', async (c) => {
  const { pageSize, offset } = paging(c)
  const action = c.req.query('action') || ''
  const rows = await c.env.DB.prepare(`SELECT a.*, u.email AS actor_email FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id WHERE (?1='' OR a.action LIKE ?1||'%') ORDER BY a.id DESC LIMIT ?2 OFFSET ?3`).bind(action, pageSize, offset).all()
  return c.json({ items: rows.results })
})

export default r
