import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../lib/types'
import { requireAuth, loadOwnedStudy, requirePerm } from '../lib/auth'
import { parseBody, notFound, bad, safeJson } from '../lib/http'
import { audit, enforceLimit, incUsage, getSetting } from '../lib/services'
import { uuid, sha256 } from '../lib/crypto'
import { sensitivity } from '../../packages/financial-engine/src'
import { renderReportHtml, buildReportSheets, type ReportCtx } from '../lib/report'
import { buildXlsx } from '../lib/xlsx'
import { templateDef, loadVersion } from './studies'

const r = new Hono<AppEnv>()
r.use('*', requireAuth)

async function buildCtx(c: any, study: any, versionNo: number, reportVersion: number, generatedAt: string): Promise<ReportCtx> {
  const db: D1Database = c.env.DB
  const v = await loadVersion(db, study.id, versionNo)
  const results = safeJson<any>(v.results_json, {})
  const model = safeJson<any>(v.model_json, {})
  const project = await db.prepare('SELECT * FROM projects WHERE id=?').bind(study.project_id).first<any>()
  const org = await db.prepare('SELECT id,name,logo_url FROM organizations WHERE id=?').bind(study.org_id).first<any>()
  const t = await db.prepare('SELECT name_ar FROM study_templates WHERE id=?').bind(v.template_id).first<any>()
  const platform = await getSetting(db, 'platform', { name_ar: 'اصنع مشروعك بنفسك', logo: '/static/img/logo.png' } as any)
  const checksum = await sha256(v.results_json)
  return {
    platform: { ...platform, logo: new URL(platform.logo, c.req.url).toString() }, org, project, study,
    version: { version: v.version, engine_version: v.engine_version, model, sensitivity: sensitivity(model) },
    inputs: safeJson(v.inputs_json, {}), results, sources: safeJson(v.sources_json, []), ai: safeJson(v.ai_outputs_json, {}),
    reportVersion, generatedAt, checksum, templateName: t?.name_ar || v.template_id, templateDef: await templateDef(db, v.template_id, v.template_version)
  }
}

/** Preview (no export counted, not persisted) */
r.get('/studies/:id/report/preview', async (c) => {
  const s = await loadOwnedStudy(c, c.req.param('id'))
  const v = Number(c.req.query('version') || s.latest_version)
  if (!v) throw bad('NO_VERSION', 'احفظ إصدارًا من الدراسة أولًا لمعاينة التقرير')
  const ctx = await buildCtx(c, s, v, 0, new Date().toISOString().slice(0, 16).replace('T', ' '))
  return c.html(renderReportHtml(ctx).replace('إصدار التقرير 0', 'معاينة (غير مُصدرة)'))
})

/** Export: records a report version tied to a study version + checksum. Re-export of same version/format returns existing record. */
r.post('/studies/:id/reports', async (c) => {
  const s = await loadOwnedStudy(c, c.req.param('id'), 'study.export')
  const b = await parseBody(c, z.object({ version: z.number().int().positive().optional(), format: z.enum(['html', 'pdf', 'xlsx']) }))
  const v = b.version || s.latest_version
  if (!v) throw bad('NO_VERSION', 'احفظ إصدارًا من الدراسة أولًا')
  const ver = await loadVersion(c.env.DB, s.id, v)
  const checksum = await sha256(ver.results_json)
  const existing = await c.env.DB.prepare('SELECT id, report_version FROM reports WHERE study_id=? AND study_version=? AND format=? AND checksum=?').bind(s.id, v, b.format, checksum).first<any>()
  if (existing) return c.json({ id: existing.id, reportVersion: existing.report_version, reused: true })
  const plan = await enforceLimit(c.env.DB, s.org_id, 'exports')
  const feats = safeJson<string[]>(plan.features_json, [])
  if (b.format === 'xlsx' && !feats.includes('excel')) throw bad('PLAN_FEATURE', 'تصدير Excel غير متاح في باقتك الحالية')
  if (b.format === 'pdf' && !feats.includes('pdf')) throw bad('PLAN_FEATURE', 'تصدير PDF غير متاح في باقتك الحالية. يمكنك استخدام تقرير HTML والطباعة من المتصفح.')
  const maxRv = await c.env.DB.prepare('SELECT COALESCE(MAX(report_version),0) AS m FROM reports WHERE study_id=?').bind(s.id).first<any>()
  const id = uuid(), rv = (maxRv?.m || 0) + 1
  await c.env.DB.prepare('INSERT INTO reports (id,study_id,org_id,study_version,report_version,language,format,checksum,created_by) VALUES (?,?,?,?,?,?,?,?,?)').bind(id, s.id, s.org_id, v, rv, s.language, b.format, checksum, c.get('user')!.id).run()
  await incUsage(c.env.DB, s.org_id, 'exports')
  await audit(c, 'report.export', 'report', id, { format: b.format, studyVersion: v })
  return c.json({ id, reportVersion: rv }, 201)
})

r.get('/studies/:id/reports', async (c) => {
  const s = await loadOwnedStudy(c, c.req.param('id'))
  const rows = await c.env.DB.prepare('SELECT r.id,r.study_version,r.report_version,r.format,r.checksum,r.created_at,u.name AS author FROM reports r JOIN users u ON u.id=r.created_by WHERE r.study_id=? ORDER BY r.created_at DESC').bind(s.id).all()
  return c.json({ items: rows.results })
})

/** Download a recorded report — always regenerated deterministically from the immutable version (checksum verified). */
r.get('/reports/:rid/download', async (c) => {
  const org = requirePerm(c, 'study.read')
  const rep = await c.env.DB.prepare('SELECT * FROM reports WHERE id=? AND org_id=?').bind(c.req.param('rid'), org.id).first<any>()
  if (!rep) throw notFound('التقرير غير موجود')
  const s = await c.env.DB.prepare('SELECT * FROM feasibility_studies WHERE id=?').bind(rep.study_id).first<any>()
  const ctx = await buildCtx(c, s, rep.study_version, rep.report_version, rep.created_at)
  if (ctx.checksum !== rep.checksum) throw bad('CHECKSUM_MISMATCH', 'بيانات الإصدار لا تطابق بصمة التقرير المسجل')
  const fname = `feasibility-${(ctx.project.name || 'study').replace(/[^\p{L}\p{N}]+/gu, '-')}-v${rep.study_version}-r${rep.report_version}`
  if (rep.format === 'xlsx') {
    const bytes = buildXlsx(buildReportSheets(ctx))
    return new Response(bytes as unknown as BodyInit, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fname)}.xlsx` } })
  }
  let html = renderReportHtml(ctx)
  if (rep.format === 'pdf') html = html.replace('</body>', '<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),600))</script></body>')
  return c.html(html)
})

export default r
