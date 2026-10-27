import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../lib/types'
import { requireAuth, requirePerm, loadOwnedStudy, loadOwnedProject } from '../lib/auth'
import { parseBody, notFound, bad, safeJson, ApiError } from '../lib/http'
import { audit, enforceLimit, incUsage, getSetting, notify } from '../lib/services'
import { uuid } from '../lib/crypto'
import { compute, applyScenario, sensitivity, ENGINE_VERSION } from '../../packages/financial-engine/src'
import { buildModel, completeness, getScenarioAdjustments, deriveRevenue, STEPS } from '../lib/study-model'
import { runAi, AI_TASKS, aiConfigured, type AiTask } from '../lib/ai'

const r = new Hono<AppEnv>()
r.use('*', requireAuth)

export async function templateDef(db: D1Database, id: string, version: number) {
  const t = await db.prepare('SELECT definition_json FROM study_template_versions WHERE template_id=? AND version=?').bind(id, version).first<any>()
  return safeJson<any>(t?.definition_json, {})
}

/** Full computation bundle (base + approved scenarios). Pure function of inputs → deterministic. */
export function computeBundle(inputs: any, currency: string) {
  const model = buildModel(inputs, currency)
  const base = compute(model)
  const scen = getScenarioAdjustments(inputs)
  const scenarios: Record<string, any> = {}
  if (base.computable) {
    for (const [code, s] of Object.entries(scen)) {
      if (code === 'BASE') continue
      const res = compute(applyScenario(model, s.adj))
      scenarios[code] = { name: s.name, adjustments: s.adj, computable: res.computable, metrics: res.metrics, years: res.years.map(y => ({ year: y.year, netRevenue: y.netRevenue, netIncome: y.netIncome, projectCashFlow: y.projectCashFlow })) }
    }
  }
  return { model, base, scenarios, engineVersion: ENGINE_VERSION, computedAt: new Date().toISOString() }
}

const currencyOf = async (db: D1Database, s: any, inputs: any) => {
  if (inputs?.info?.currency) return inputs.info.currency
  const p = await db.prepare('SELECT currency FROM projects WHERE id=?').bind(s.project_id).first<any>()
  return p?.currency || 'EGP'
}

/* ---------------- Reference data ---------------- */
r.get('/templates', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT t.id,t.sector,t.name_ar,t.name_en,t.icon,t.image,t.current_version,v.definition_json FROM study_templates t JOIN study_template_versions v ON v.template_id=t.id AND v.version=t.current_version WHERE t.is_active=1 ORDER BY t.sort_order`).all<any>()
  return c.json({ items: rows.results.map(t => ({ ...t, definition: safeJson(t.definition_json, {}), definition_json: undefined })) })
})
r.get('/tax-profiles', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT * FROM tax_profiles WHERE (effective_to IS NULL OR effective_to > date('now')) ORDER BY country`).all()
  return c.json({ items: rows.results })
})
r.get('/exchange-rates', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT * FROM exchange_rates ORDER BY as_of DESC LIMIT 50`).all()
  return c.json({ items: rows.results })
})

/* ---------------- Studies CRUD ---------------- */
r.get('/studies', async (c) => {
  const org = requirePerm(c, 'study.read')
  const q = (c.req.query('q') || '').trim(), status = c.req.query('status') || ''
  const rows = await c.env.DB.prepare(`SELECT s.id,s.title,s.status,s.completion_pct,s.template_id,s.latest_version,s.updated_at,p.name AS project_name,p.id AS project_id FROM feasibility_studies s JOIN projects p ON p.id=s.project_id
    WHERE s.org_id=?1 AND s.deleted_at IS NULL AND (?2='' OR s.title LIKE '%'||?2||'%') AND (?3='' OR s.status=?3) ORDER BY s.updated_at DESC LIMIT 200`).bind(org.id, q, status).all()
  return c.json({ items: rows.results })
})

r.post('/studies', async (c) => {
  const org = requirePerm(c, 'study.write')
  const b = await parseBody(c, z.object({ projectId: z.string().uuid(), title: z.string().trim().min(2).max(200), templateId: z.string().max(50), language: z.enum(['ar', 'en']).default('ar') }))
  const p = await loadOwnedProject(c, b.projectId, 'project.read')
  const t = await c.env.DB.prepare('SELECT id,current_version FROM study_templates WHERE id=? AND is_active=1').bind(b.templateId).first<any>()
  if (!t) throw bad('TEMPLATE', 'القالب غير متاح')
  await enforceLimit(c.env.DB, org.id, 'studies')
  const def = await templateDef(c.env.DB, t.id, t.current_version)
  const tax = await c.env.DB.prepare(`SELECT income_tax_pct,status FROM tax_profiles WHERE country=? ORDER BY effective_from DESC LIMIT 1`).bind(p.country).first<any>()
  // Pre-fill only STRUCTURE (names, categories, useful life) — amounts stay empty for the user.
  const inputs = {
    info: { title: b.title, horizonYears: 5, operationStartOffset: 0, currency: p.currency },
    idea: { summary: p.description || '' }, market: { competitors: [] }, templateFields: {},
    investment: (def.suggested?.investment || []).map((x: any) => ({ ...x, amount: '', classification: 'USER_PROVIDED' })),
    opex: (def.suggested?.opex || []).map((x: any) => ({ ...x, amount: '', pctOfRevenue: '', classification: 'USER_PROVIDED' })),
    staff: (def.suggested?.staff || []).map((x: any) => ({ role: x.role, count: '', monthlySalary: '', insurancePct: '' })),
    revenue: [], funding: { equity: '', loans: [] },
    tax: { incomeTaxPct: '', taxProfileHint: tax ? { pct: tax.income_tax_pct, status: tax.status } : null, lossCarryForwardYears: 5, cashReserveMonths: '' },
    macro: { discountRatePct: '', fxRate: 1 }, scenarios: {}
  }
  const id = uuid()
  const comp = completeness(inputs, def)
  await c.env.DB.prepare(`INSERT INTO feasibility_studies (id,project_id,org_id,created_by,title,template_id,template_version,language,inputs_json,completion_pct) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, p.id, org.id, c.get('user')!.id, b.title, t.id, t.current_version, b.language, JSON.stringify(inputs), comp.pct).run()
  await c.env.DB.prepare(`UPDATE projects SET updated_at=datetime('now') WHERE id=?`).bind(p.id).run()
  await audit(c, 'study.create', 'study', id, { template: t.id })
  return c.json({ id }, 201)
})

r.get('/studies/:id', async (c) => {
  const s = await loadOwnedStudy(c, c.req.param('id'))
  const def = await templateDef(c.env.DB, s.template_id, s.template_version)
  const project = await c.env.DB.prepare('SELECT id,name,currency,country,governorate,city,sector,activity FROM projects WHERE id=?').bind(s.project_id).first()
  const inputs = safeJson(s.inputs_json, {})
  const versions = await c.env.DB.prepare('SELECT version,engine_version,changelog,created_at,(SELECT name FROM users WHERE id=created_by) AS author FROM study_versions WHERE study_id=? ORDER BY version DESC').bind(s.id).all()
  const ai = await c.env.DB.prepare(`SELECT task, output_json, status, error, created_at, model FROM ai_jobs WHERE study_id=? ORDER BY created_at DESC LIMIT 60`).bind(s.id).all<any>()
  const aiLatest: Record<string, any> = {}
  for (const a of ai.results) if (!aiLatest[a.task]) aiLatest[a.task] = { status: a.status, output: safeJson(a.output_json, null), error: a.error, created_at: a.created_at, model: a.model }
  const tmeta = await c.env.DB.prepare('SELECT name_ar,icon,image FROM study_templates WHERE id=?').bind(s.template_id).first<any>()
  return c.json({
    study: { ...s, inputs_json: undefined, last_result_json: undefined },
    inputs, template: { id: s.template_id, version: s.template_version, ...tmeta, definition: def }, project,
    completeness: completeness(inputs, def), steps: STEPS,
    lastResult: safeJson(s.last_result_json, null),
    versions: versions.results, ai: aiLatest, aiConfigured: aiConfigured(c.env),
    canWrite: c.get('org')!.permissions.has('study.write'), canExport: c.get('org')!.permissions.has('study.export')
  })
})

/** Autosave with optimistic concurrency (baseUpdatedAt). */
r.put('/studies/:id/inputs', async (c) => {
  const s = await loadOwnedStudy(c, c.req.param('id'), 'study.write')
  const b = await parseBody(c, z.object({ inputs: z.record(z.string(), z.any()), currentStep: z.number().int().min(1).max(13).optional(), baseUpdatedAt: z.string().optional() }))
  const raw = JSON.stringify(b.inputs)
  if (raw.length > 400000) throw bad('TOO_LARGE', 'حجم بيانات الدراسة كبير جدًا')
  if (b.baseUpdatedAt && b.baseUpdatedAt !== s.updated_at) throw new ApiError(409, 'CONFLICT', 'تم تعديل الدراسة من جلسة أخرى. أعد تحميل الصفحة لتجنب فقد البيانات.')
  const def = await templateDef(c.env.DB, s.template_id, s.template_version)
  const comp = completeness(b.inputs, def)
  const title = String(b.inputs?.info?.title || s.title).slice(0, 200)
  const status = ['draft', 'computed', 'completed'].includes(s.status) ? 'in_progress' : s.status
  await c.env.DB.prepare(`UPDATE feasibility_studies SET inputs_json=?, title=?, completion_pct=?, current_step=COALESCE(?, current_step), status=?, updated_at=datetime('now') WHERE id=?`)
    .bind(raw, title, comp.pct, b.currentStep ?? null, status, s.id).run()
  const fresh = await c.env.DB.prepare('SELECT updated_at FROM feasibility_studies WHERE id=?').bind(s.id).first<any>()
  return c.json({ ok: true, updatedAt: fresh.updated_at, completeness: comp })
})

r.post('/studies/:id/derive-revenue', async (c) => {
  const s = await loadOwnedStudy(c, c.req.param('id'), 'study.write')
  const def = await templateDef(c.env.DB, s.template_id, s.template_version)
  const inputs = safeJson<any>(s.inputs_json, {})
  const d = deriveRevenue(def, inputs.templateFields || {})
  if (!d) throw bad('NO_HELPER', 'هذا القالب لا يحتوي على مساعد اشتقاق الإيرادات')
  return c.json(d)
})

/** Compute (draft) — no version created. */
r.post('/studies/:id/compute', async (c) => {
  const s = await loadOwnedStudy(c, c.req.param('id'), 'study.read')
  const inputs = safeJson<any>(s.inputs_json, {})
  const bundle = computeBundle(inputs, await currencyOf(c.env.DB, s, inputs))
  if (c.get('org')!.permissions.has('study.write')) {
    await c.env.DB.prepare(`UPDATE feasibility_studies SET last_result_json=?, status=CASE WHEN ? AND status IN ('draft','in_progress') THEN 'computed' ELSE status END WHERE id=?`)
      .bind(JSON.stringify({ base: bundle.base, scenarios: bundle.scenarios, engineVersion: bundle.engineVersion, computedAt: bundle.computedAt }), bundle.base.computable ? 1 : 0, s.id).run()
  }
  return c.json({ base: bundle.base, scenarios: bundle.scenarios, engineVersion: bundle.engineVersion, computedAt: bundle.computedAt })
})

/** What-if: never saved; base untouched. */
r.post('/studies/:id/what-if', async (c) => {
  const s = await loadOwnedStudy(c, c.req.param('id'), 'study.read')
  const p = (lo: number, hi: number) => z.number().min(lo).max(hi).optional()
  const adj = await parseBody(c, z.object({
    volumePct: p(-100, 500), pricePct: p(-100, 500), variableCostPct: p(-100, 500), salaryPct: p(-100, 500), fixedCostPct: p(-100, 500), capexPct: p(-100, 500),
    utilizationPct: p(-100, 500), interestRateDeltaPts: p(-50, 50), discountRateDeltaPts: p(-50, 50), fxPct: p(-100, 1000),
    startDelayYears: z.number().int().min(0).max(10).optional(), horizonYears: z.number().int().min(1).max(30).optional()
  }))
  const inputs = safeJson<any>(s.inputs_json, {})
  const model = buildModel(inputs, await currencyOf(c.env.DB, s, inputs))
  const base = compute(model), alt = compute(applyScenario(model, adj))
  return c.json({ base: base.metrics, alt: alt.metrics, altYears: alt.years.map(y => ({ year: y.year, netRevenue: y.netRevenue, netIncome: y.netIncome, projectCashFlow: y.projectCashFlow })), issues: alt.issues, computable: alt.computable })
})

r.post('/studies/:id/sensitivity', async (c) => {
  const s = await loadOwnedStudy(c, c.req.param('id'), 'study.read')
  const inputs = safeJson<any>(s.inputs_json, {})
  return c.json(sensitivity(buildModel(inputs, await currencyOf(c.env.DB, s, inputs))))
})

/* ---------------- Versions ---------------- */
r.post('/studies/:id/versions', async (c) => {
  const s = await loadOwnedStudy(c, c.req.param('id'), 'study.write')
  const { changelog } = await parseBody(c, z.object({ changelog: z.string().max(1000).optional() }))
  const inputs = safeJson<any>(s.inputs_json, {})
  const bundle = computeBundle(inputs, await currencyOf(c.env.DB, s, inputs))
  if (!bundle.base.computable) throw bad('NOT_COMPUTABLE', 'لا يمكن حفظ إصدار قبل استكمال البيانات المطلوبة للحساب', bundle.base.issues.filter(i => i.severity === 'error'))
  const sources = await c.env.DB.prepare(`SELECT l.*, m.name AS source_name, m.publisher, m.url, m.published_at, m.observed_at FROM study_source_links l LEFT JOIN market_sources m ON m.id=l.source_id WHERE l.study_id=?`).bind(s.id).all()
  const ai = await c.env.DB.prepare(`SELECT task, output_json, model, created_at FROM ai_jobs WHERE study_id=? AND status='succeeded' ORDER BY created_at DESC`).bind(s.id).all<any>()
  const aiLatest: Record<string, any> = {}
  for (const a of ai.results) if (!aiLatest[a.task]) aiLatest[a.task] = { output: safeJson(a.output_json, null), model: a.model, created_at: a.created_at }
  const version = (s.latest_version || 0) + 1
  const results = { base: bundle.base, scenarios: bundle.scenarios }
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO study_versions (id,study_id,version,inputs_json,model_json,results_json,sources_json,ai_outputs_json,template_id,template_version,engine_version,changelog,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(uuid(), s.id, version, s.inputs_json, JSON.stringify(bundle.model), JSON.stringify(results), JSON.stringify(sources.results), JSON.stringify(aiLatest), s.template_id, s.template_version, ENGINE_VERSION, changelog || null, c.get('user')!.id),
    c.env.DB.prepare(`UPDATE feasibility_studies SET latest_version=?, status='completed', last_result_json=?, updated_at=datetime('now') WHERE id=?`).bind(version, JSON.stringify({ ...results, engineVersion: ENGINE_VERSION, computedAt: bundle.computedAt }), s.id)
  ])
  await audit(c, 'study.version_create', 'study', s.id, { version })
  return c.json({ version }, 201)
})

export async function loadVersion(db: D1Database, studyId: string, v: number) {
  const row = await db.prepare('SELECT * FROM study_versions WHERE study_id=? AND version=?').bind(studyId, v).first<any>()
  if (!row) throw notFound('الإصدار غير موجود')
  return row
}

r.get('/studies/:id/versions/:v', async (c) => {
  const s = await loadOwnedStudy(c, c.req.param('id'))
  const row = await loadVersion(c.env.DB, s.id, Number(c.req.param('v')))
  return c.json({ version: row.version, created_at: row.created_at, changelog: row.changelog, engine_version: row.engine_version, template: { id: row.template_id, version: row.template_version },
    inputs: safeJson(row.inputs_json, {}), results: safeJson(row.results_json, {}), sources: safeJson(row.sources_json, []), ai: safeJson(row.ai_outputs_json, {}) })
})

r.get('/studies/:id/versions/:v/verify', async (c) => {
  const s = await loadOwnedStudy(c, c.req.param('id'))
  const row = await loadVersion(c.env.DB, s.id, Number(c.req.param('v')))
  const stored = safeJson<any>(row.results_json, {})
  const re = compute(safeJson<any>(row.model_json, {}))
  return c.json({ reproducible: JSON.stringify(re.metrics) === JSON.stringify(stored.base?.metrics), storedEngine: row.engine_version, currentEngine: ENGINE_VERSION })
})

r.get('/studies/:id/compare', async (c) => {
  const s = await loadOwnedStudy(c, c.req.param('id'))
  const a = await loadVersion(c.env.DB, s.id, Number(c.req.query('a'))), b = await loadVersion(c.env.DB, s.id, Number(c.req.query('b')))
  const ra = safeJson<any>(a.results_json, {}).base?.metrics || {}, rb = safeJson<any>(b.results_json, {}).base?.metrics || {}
  const metrics = Object.keys({ ...ra, ...rb }).map(k => ({ key: k, a: ra[k] ?? null, b: rb[k] ?? null, diff: typeof ra[k] === 'number' && typeof rb[k] === 'number' ? Math.round((rb[k] - ra[k]) * 100) / 100 : null }))
  const flat = (o: any, p = ''): Record<string, string> => Object.entries(o || {}).reduce((acc: any, [k, v]) => {
    const key = p ? `${p}.${k}` : k
    if (v && typeof v === 'object') Object.assign(acc, flat(v, key)); else acc[key] = String(v ?? '')
    return acc
  }, {})
  const fa = flat(safeJson(a.inputs_json, {})), fb = flat(safeJson(b.inputs_json, {}))
  const inputChanges = [...new Set([...Object.keys(fa), ...Object.keys(fb)])].filter(k => fa[k] !== fb[k]).slice(0, 300).map(k => ({ field: k, a: fa[k] ?? '', b: fb[k] ?? '' }))
  return c.json({ a: a.version, b: b.version, metrics, inputChanges })
})

r.post('/studies/:id/versions/:v/restore', async (c) => {
  const s = await loadOwnedStudy(c, c.req.param('id'), 'study.write')
  const row = await loadVersion(c.env.DB, s.id, Number(c.req.param('v')))
  await c.env.DB.prepare(`UPDATE feasibility_studies SET inputs_json=?, status='in_progress', updated_at=datetime('now') WHERE id=?`).bind(row.inputs_json, s.id).run()
  await audit(c, 'study.version_restore', 'study', s.id, { from: row.version })
  return c.json({ ok: true })
})

r.post('/studies/:id/duplicate', async (c) => {
  const s = await loadOwnedStudy(c, c.req.param('id'), 'study.write')
  await enforceLimit(c.env.DB, s.org_id, 'studies')
  const id = uuid()
  await c.env.DB.prepare(`INSERT INTO feasibility_studies (id,project_id,org_id,created_by,title,template_id,template_version,language,inputs_json,completion_pct,status) VALUES (?,?,?,?,?,?,?,?,?,?, 'in_progress')`)
    .bind(id, s.project_id, s.org_id, c.get('user')!.id, s.title + ' (نسخة)', s.template_id, s.template_version, s.language, s.inputs_json, s.completion_pct).run()
  await audit(c, 'study.duplicate', 'study', id, { from: s.id })
  return c.json({ id }, 201)
})

r.delete('/studies/:id', async (c) => {
  const s = await loadOwnedStudy(c, c.req.param('id'), 'study.delete')
  const rep = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM reports WHERE study_id=?').bind(s.id).first<{ n: number }>()
  if ((rep?.n ?? 0) > 0) {
    await c.env.DB.prepare(`UPDATE feasibility_studies SET status='archived' WHERE id=?`).bind(s.id).run()
    return c.json({ ok: true, archivedInstead: true, message: 'للدراسة تقارير مصدّرة، لذا تمت أرشفتها بدل حذفها.' })
  }
  await c.env.DB.prepare(`UPDATE feasibility_studies SET deleted_at=datetime('now') WHERE id=?`).bind(s.id).run()
  await audit(c, 'study.delete', 'study', s.id)
  return c.json({ ok: true })
})

/* ---------------- Sources & evidence ---------------- */
r.get('/sources', async (c) => {
  const org = requirePerm(c, 'study.read')
  const rows = await c.env.DB.prepare('SELECT * FROM market_sources WHERE org_id IS NULL OR org_id = ? ORDER BY org_id IS NULL, name').bind(org.id).all()
  return c.json({ items: rows.results })
})
const opt = (n: number) => z.string().max(n).optional().nullable()
r.post('/sources', async (c) => {
  const org = requirePerm(c, 'source.write')
  const b = await parseBody(c, z.object({
    name: z.string().trim().min(2).max(200), publisher: opt(200), url: z.string().url().max(500).optional().nullable().or(z.literal('')),
    country: opt(10), data_type: opt(100), published_at: opt(20), observed_at: opt(20), unit: opt(50), currency: opt(3),
    collection_method: opt(200), reuse_terms: opt(300), confidence: z.enum(['low', 'medium', 'high']).default('medium'), notes: opt(2000)
  }))
  if (b.url && !/^https?:\/\//i.test(b.url)) throw bad('URL', 'رابط غير صالح')
  const id = uuid()
  await c.env.DB.prepare(`INSERT INTO market_sources (id,org_id,name,publisher,url,country,data_type,published_at,observed_at,updated_at,unit,currency,collection_method,reuse_terms,confidence,notes,created_by) VALUES (?,?,?,?,?,?,?,?,?,datetime('now'),?,?,?,?,?,?,?)`)
    .bind(id, org.id, b.name, b.publisher ?? null, b.url || null, b.country ?? null, b.data_type ?? null, b.published_at || null, b.observed_at || new Date().toISOString().slice(0, 10), b.unit ?? null, b.currency ?? null, b.collection_method ?? null, b.reuse_terms ?? null, b.confidence, b.notes ?? null, c.get('user')!.id).run()
  await audit(c, 'source.create', 'source', id)
  return c.json({ id }, 201)
})

r.get('/studies/:id/evidence', async (c) => {
  const s = await loadOwnedStudy(c, c.req.param('id'))
  const rows = await c.env.DB.prepare(`SELECT l.*, m.name AS source_name, m.publisher, m.url, m.published_at, m.observed_at, m.confidence FROM study_source_links l LEFT JOIN market_sources m ON m.id=l.source_id WHERE l.study_id=? ORDER BY l.section, l.created_at`).bind(s.id).all<any>()
  const today = Date.now()
  return c.json({ items: rows.results.map(x => ({ ...x, stale: x.observed_at ? (today - new Date(x.observed_at).getTime()) > 365 * 864e5 : null })) })
})
r.post('/studies/:id/evidence', async (c) => {
  const s = await loadOwnedStudy(c, c.req.param('id'), 'study.write')
  const b = await parseBody(c, z.object({ sourceId: z.string().max(60).optional().nullable(), section: z.string().max(50), claim: z.string().trim().min(2).max(1000), value: opt(200),
    classification: z.enum(['VERIFIED', 'USER_PROVIDED', 'ESTIMATED', 'UNAVAILABLE', 'NEEDS_REVIEW']) }))
  if (b.classification === 'VERIFIED' && !b.sourceId) throw bad('SOURCE_REQUIRED', 'لا يمكن تصنيف معلومة كـ "موثقة" دون ربطها بمصدر')
  if (b.sourceId) {
    const src = await c.env.DB.prepare('SELECT id FROM market_sources WHERE id=? AND (org_id IS NULL OR org_id=?)').bind(b.sourceId, s.org_id).first()
    if (!src) throw notFound('المصدر غير موجود')
  }
  const id = uuid()
  await c.env.DB.prepare('INSERT INTO study_source_links (id,study_id,source_id,section,claim,value,classification,created_by) VALUES (?,?,?,?,?,?,?,?)').bind(id, s.id, b.sourceId || null, b.section, b.claim, b.value ?? null, b.classification, c.get('user')!.id).run()
  return c.json({ id }, 201)
})
r.delete('/studies/:id/evidence/:eid', async (c) => {
  const s = await loadOwnedStudy(c, c.req.param('id'), 'study.write')
  await c.env.DB.prepare('DELETE FROM study_source_links WHERE id=? AND study_id=?').bind(c.req.param('eid'), s.id).run()
  return c.json({ ok: true })
})

/* ---------------- AI jobs ---------------- */
r.post('/studies/:id/ai/:task', async (c) => {
  const s = await loadOwnedStudy(c, c.req.param('id'), 'study.write')
  requirePerm(c, 'ai.use')
  const task = c.req.param('task') as AiTask
  if (!AI_TASKS.includes(task)) throw bad('TASK', 'مهمة غير معروفة')
  const settings = await getSetting(c.env.DB, 'ai', { enabled: true, model: 'gpt-5-mini', max_output_tokens: 4000, monthly_cost_cap_tokens: 5000000, send_financials_to_ai: true } as any)
  if (!settings.enabled) throw bad('AI_DISABLED', 'تم تعطيل الذكاء الاصطناعي من الإدارة')
  if (!aiConfigured(c.env)) throw bad('AI_NOT_CONFIGURED', 'مزود الذكاء الاصطناعي غير مُعدّ في هذه البيئة')
  const running = await c.env.DB.prepare(`SELECT id FROM ai_jobs WHERE study_id=? AND task=? AND status IN ('queued','running') AND created_at > datetime('now','-5 minutes')`).bind(s.id, task).first<any>()
  if (running) return c.json({ jobId: running.id, deduped: true }, 202)
  await enforceLimit(c.env.DB, s.org_id, 'ai_requests')
  const tok = await c.env.DB.prepare(`SELECT COALESCE(SUM(prompt_tokens+completion_tokens),0) AS t FROM ai_usage_logs WHERE created_at > datetime('now','start of month')`).first<{ t: number }>()
  if ((tok?.t ?? 0) > settings.monthly_cost_cap_tokens) throw bad('AI_COST_CAP', 'تم بلوغ سقف تكلفة الذكاء الاصطناعي الشهري للمنصة')

  const inputs = safeJson<any>(s.inputs_json, {})
  const project = await c.env.DB.prepare('SELECT name,sector,activity,country,governorate,city,currency FROM projects WHERE id=?').bind(s.project_id).first<any>()
  const evidence = await c.env.DB.prepare(`SELECT l.section,l.claim,l.value,l.classification,m.name AS source,m.observed_at FROM study_source_links l LEFT JOIN market_sources m ON m.id=l.source_id WHERE l.study_id=?`).bind(s.id).all()
  const ctx: any = { project, template: s.template_id, inputs: { info: inputs.info, idea: inputs.idea, market: inputs.market, templateFields: inputs.templateFields }, evidence: evidence.results }
  if (settings.send_financials_to_ai && task !== 'analyze_idea' && task !== 'market_analysis') {
    const bundle = computeBundle(inputs, inputs.info?.currency || project.currency)
    ctx.inputs = inputs
    ctx.engine_results_READ_ONLY = bundle.base.computable ? { metrics: bundle.base.metrics, issues: bundle.base.issues, years: bundle.base.years.map(y => ({ year: y.year, netRevenue: y.netRevenue, ebitda: y.ebitda, netIncome: y.netIncome, projectCashFlow: y.projectCashFlow })), scenarios: Object.fromEntries(Object.entries(bundle.scenarios).map(([k, v]: any) => [k, v.metrics])) } : { computable: false, issues: bundle.base.issues }
    if (task === 'risks' && bundle.base.computable) ctx.sensitivity = sensitivity(bundle.model).rows.map((r: any) => ({ variable: r.ar, swing: r.swing }))
  }
  const jobId = uuid()
  await c.env.DB.prepare(`INSERT INTO ai_jobs (id,org_id,user_id,study_id,task,status,model) VALUES (?,?,?,?,?,'queued',?)`).bind(jobId, s.org_id, c.get('user')!.id, s.id, task, settings.model).run()
  await incUsage(c.env.DB, s.org_id, 'ai_requests')
  const env = c.env, db = c.env.DB, userId = c.get('user')!.id
  const work = (async () => {
    await db.prepare(`UPDATE ai_jobs SET status='running', attempts=attempts+1 WHERE id=?`).bind(jobId).run()
    const res = await runAi(env, task, ctx, { model: settings.model, maxTokens: settings.max_output_tokens })
    const cur = await db.prepare(`SELECT status FROM ai_jobs WHERE id=?`).bind(jobId).first<any>()
    if (cur?.status === 'canceled') return
    await db.prepare(`UPDATE ai_jobs SET status=?, output_json=?, error=?, model=?, finished_at=datetime('now') WHERE id=?`)
      .bind(res.ok ? 'succeeded' : 'failed', res.ok ? JSON.stringify(res.output) : null, res.ok ? null : `${res.errorCode}: ${res.error}`, res.model, jobId).run()
    await db.prepare('INSERT INTO ai_usage_logs (job_id,org_id,model,prompt_tokens,completion_tokens,latency_ms) VALUES (?,?,?,?,?,?)').bind(jobId, s.org_id, res.model, res.usage?.prompt_tokens ?? 0, res.usage?.completion_tokens ?? 0, res.latencyMs).run()
    if (res.usage) await incUsage(db, s.org_id, 'ai_tokens', (res.usage.prompt_tokens || 0) + (res.usage.completion_tokens || 0))
    if (!res.ok) await notify(db, userId, 'تعذر تنفيذ مهمة الذكاء الاصطناعي', res.error, `/app/studies/${s.id}`)
  })().catch(async (e) => { await db.prepare(`UPDATE ai_jobs SET status='failed', error=? WHERE id=?`).bind(String(e).slice(0, 500), jobId).run() })
  try { c.executionCtx.waitUntil(work) } catch { await work }
  return c.json({ jobId }, 202)
})

r.get('/ai-jobs/:jobId', async (c) => {
  const org = requirePerm(c, 'study.read')
  const j = await c.env.DB.prepare('SELECT id,task,status,output_json,error,model,created_at,finished_at FROM ai_jobs WHERE id=? AND org_id=?').bind(c.req.param('jobId'), org.id).first<any>()
  if (!j) throw notFound()
  return c.json({ ...j, output: safeJson(j.output_json, null), output_json: undefined })
})
r.post('/ai-jobs/:jobId/cancel', async (c) => {
  const org = requirePerm(c, 'ai.use')
  await c.env.DB.prepare(`UPDATE ai_jobs SET status='canceled', finished_at=datetime('now') WHERE id=? AND org_id=? AND status IN ('queued','running')`).bind(c.req.param('jobId'), org.id).run()
  return c.json({ ok: true })
})

export default r
