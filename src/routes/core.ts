/** Me, organizations, dashboard, projects, notifications, files */
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../lib/types'
import { requireAuth, requirePerm, loadOwnedProject } from '../lib/auth'
import { parseBody, paging, notFound, bad, forbidden, safeJson } from '../lib/http'
import { audit, enforceLimit, getActivePlan, getUsage } from '../lib/services'
import { uuid } from '../lib/crypto'

const r = new Hono<AppEnv>()
r.use('*', requireAuth)

/* ---------------- Me ---------------- */
r.get('/me', async (c) => {
  const u = c.get('user')!, org = c.get('org')
  const orgs = await c.env.DB.prepare(`SELECT o.id,o.name,o.type,m.role FROM organization_members m JOIN organizations o ON o.id=m.org_id WHERE m.user_id=? AND o.deleted_at IS NULL`).bind(u.id).all()
  const unread = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').bind(u.id).first<{ n: number }>()
  return c.json({ user: u, org: org ? { id: org.id, name: org.name, role: org.role, type: org.type, permissions: [...org.permissions] } : null, organizations: orgs.results, unreadNotifications: unread?.n ?? 0 })
})

r.patch('/me', async (c) => {
  const b = await parseBody(c, z.object({ name: z.string().trim().min(2).max(100).optional(), phone: z.string().max(30).optional(), locale: z.enum(['ar', 'en']).optional() }))
  const u = c.get('user')!
  await c.env.DB.prepare(`UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone), locale = COALESCE(?, locale), updated_at = datetime('now') WHERE id = ?`).bind(b.name ?? null, b.phone ?? null, b.locale ?? null, u.id).run()
  return c.json({ ok: true })
})

/* ---------------- Organization members ---------------- */
r.get('/org/members', async (c) => {
  const org = requirePerm(c, 'project.read')
  const rows = await c.env.DB.prepare(`SELECT u.id,u.name,u.email,m.role,m.created_at FROM organization_members m JOIN users u ON u.id=m.user_id WHERE m.org_id = ?`).bind(org.id).all()
  return c.json({ members: rows.results })
})

r.post('/org/members', async (c) => {
  const org = requirePerm(c, 'org.manage')
  const b = await parseBody(c, z.object({ email: z.string().trim().toLowerCase().email(), role: z.enum(['ORGANIZATION_ADMIN', 'CONSULTANT', 'ANALYST', 'MEMBER', 'VIEWER']) }))
  if (org.type === 'personal') throw bad('PERSONAL_ORG', 'الحساب الفردي لا يدعم أعضاء فريق. أنشئ حساب شركة/مكتب استشارات.')
  const plan = await getActivePlan(c.env.DB, org.id)
  const cnt = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM organization_members WHERE org_id = ?').bind(org.id).first<{ n: number }>()
  if ((cnt?.n ?? 0) >= plan.max_members) throw bad('PLAN_LIMIT', `باقتك تسمح بـ ${plan.max_members} عضو فقط`)
  const u = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(b.email).first<any>()
  if (!u) throw notFound('لا يوجد مستخدم مسجل بهذا البريد. اطلب منه إنشاء حساب أولًا.')
  await c.env.DB.prepare('INSERT OR REPLACE INTO organization_members (org_id,user_id,role) VALUES (?,?,?)').bind(org.id, u.id, b.role).run()
  await audit(c, 'org.member_added', 'user', u.id, { role: b.role })
  return c.json({ ok: true })
})

r.delete('/org/members/:userId', async (c) => {
  const org = requirePerm(c, 'org.manage')
  const uid = c.req.param('userId')
  const m = await c.env.DB.prepare('SELECT role FROM organization_members WHERE org_id=? AND user_id=?').bind(org.id, uid).first<any>()
  if (!m) throw notFound()
  if (m.role === 'ORGANIZATION_OWNER') throw forbidden('لا يمكن إزالة مالك المؤسسة')
  await c.env.DB.prepare('DELETE FROM organization_members WHERE org_id=? AND user_id=?').bind(org.id, uid).run()
  await audit(c, 'org.member_removed', 'user', uid)
  return c.json({ ok: true })
})

/* ---------------- Dashboard ---------------- */
r.get('/dashboard', async (c) => {
  const org = requirePerm(c, 'study.read')
  const db = c.env.DB
  const stats = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM projects WHERE org_id=?1 AND deleted_at IS NULL) AS projects,
      (SELECT COUNT(*) FROM feasibility_studies WHERE org_id=?1 AND deleted_at IS NULL) AS studies,
      (SELECT COUNT(*) FROM feasibility_studies WHERE org_id=?1 AND deleted_at IS NULL AND status IN ('draft','in_progress')) AS in_progress,
      (SELECT COUNT(*) FROM feasibility_studies WHERE org_id=?1 AND deleted_at IS NULL AND status IN ('computed','completed')) AS completed,
      (SELECT COUNT(*) FROM reports WHERE org_id=?1) AS reports`).bind(org.id).first()
  const recentProjects = await db.prepare(`SELECT p.id,p.name,p.sector,p.updated_at,(SELECT COUNT(*) FROM feasibility_studies s WHERE s.project_id=p.id AND s.deleted_at IS NULL) AS studies FROM projects p WHERE p.org_id=? AND p.deleted_at IS NULL ORDER BY p.updated_at DESC LIMIT 5`).bind(org.id).all()
  const recentStudies = await db.prepare(`SELECT s.id,s.title,s.status,s.completion_pct,s.updated_at,s.latest_version,s.template_id,p.name AS project_name, s.last_result_json FROM feasibility_studies s JOIN projects p ON p.id=s.project_id WHERE s.org_id=? AND s.deleted_at IS NULL ORDER BY s.updated_at DESC LIMIT 8`).bind(org.id).all<any>()
  const plan = await getActivePlan(db, org.id)
  const usage = await getUsage(db, org.id)
  const notifs = await db.prepare('SELECT id,title,body,link,read_at,created_at FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 5').bind(c.get('user')!.id).all()
  return c.json({
    stats,
    recentProjects: recentProjects.results,
    recentStudies: recentStudies.results.map(s => {
      const res = safeJson<any>(s.last_result_json, null)
      // Only expose metrics when the engine considered the inputs computable
      const m = res?.base?.computable ? res.base.metrics : null
      return { id: s.id, title: s.title, status: s.status, completion_pct: s.completion_pct, updated_at: s.updated_at, latest_version: s.latest_version, project_name: s.project_name, template_id: s.template_id,
        metrics: m ? { npv: m.npv, irrPct: m.irrPct, paybackYears: m.paybackYears, currency: res.base.currency } : null }
    }),
    plan: { id: plan.id, name_ar: plan.name_ar, max_projects: plan.max_projects, max_studies: plan.max_studies, max_ai_requests_month: plan.max_ai_requests_month, max_exports_month: plan.max_exports_month, current_period_end: plan.current_period_end ?? null },
    usage, notifications: notifs.results
  })
})

/* ---------------- Projects ---------------- */
const projectSchema = z.object({
  name: z.string().trim().min(2, 'اسم المشروع مطلوب').max(150),
  description: z.string().max(5000).optional().nullable(),
  sector: z.string().max(50).optional().nullable(),
  activity: z.string().max(150).optional().nullable(),
  country: z.string().length(2).default('EG'),
  governorate: z.string().max(80).optional().nullable(),
  city: z.string().max(80).optional().nullable(),
  currency: z.string().length(3).default('EGP'),
  legal_entity: z.string().max(80).optional().nullable(),
  size: z.enum(['micro', 'small', 'medium', 'large']).optional().nullable(),
  initial_capital: z.number().nonnegative().optional().nullable(),
  notes: z.string().max(5000).optional().nullable()
})

r.get('/projects', async (c) => {
  const org = requirePerm(c, 'project.read')
  const { page, pageSize, offset } = paging(c)
  const q = (c.req.query('q') || '').trim()
  const status = c.req.query('status') || 'active'
  const sortMap: Record<string, string> = { updated: 'p.updated_at DESC', name: 'p.name COLLATE NOCASE ASC', created: 'p.created_at DESC' }
  const sort = sortMap[c.req.query('sort') || 'updated'] || sortMap.updated
  const where = `p.org_id = ?1 AND p.deleted_at IS NULL AND p.status = ?2 AND (?3 = '' OR p.name LIKE '%' || ?3 || '%' OR p.activity LIKE '%' || ?3 || '%')`
  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM projects p WHERE ${where}`).bind(org.id, status, q).first<{ n: number }>()
  const rows = await c.env.DB.prepare(`SELECT p.*, (SELECT COUNT(*) FROM feasibility_studies s WHERE s.project_id=p.id AND s.deleted_at IS NULL) AS studies_count FROM projects p WHERE ${where} ORDER BY ${sort} LIMIT ?4 OFFSET ?5`).bind(org.id, status, q, pageSize, offset).all()
  return c.json({ items: rows.results, page, pageSize, total: total?.n ?? 0 })
})

r.post('/projects', async (c) => {
  const org = requirePerm(c, 'project.write')
  const b = await parseBody(c, projectSchema)
  await enforceLimit(c.env.DB, org.id, 'projects')
  const id = uuid()
  await c.env.DB.prepare(`INSERT INTO projects (id,org_id,created_by,name,description,sector,activity,country,governorate,city,currency,legal_entity,size,initial_capital,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, org.id, c.get('user')!.id, b.name, b.description ?? null, b.sector ?? null, b.activity ?? null, b.country, b.governorate ?? null, b.city ?? null, b.currency.toUpperCase(), b.legal_entity ?? null, b.size ?? null, b.initial_capital ?? null, b.notes ?? null).run()
  await audit(c, 'project.create', 'project', id)
  return c.json({ id }, 201)
})

r.get('/projects/:id', async (c) => {
  const p = await loadOwnedProject(c, c.req.param('id'))
  const studies = await c.env.DB.prepare(`SELECT id,title,status,completion_pct,template_id,latest_version,updated_at FROM feasibility_studies WHERE project_id=? AND deleted_at IS NULL ORDER BY updated_at DESC`).bind(p.id).all()
  const files = await c.env.DB.prepare(`SELECT id,name,mime,size,created_at FROM uploaded_files WHERE project_id=? AND deleted_at IS NULL ORDER BY created_at DESC`).bind(p.id).all()
  return c.json({ project: p, studies: studies.results, files: files.results })
})

r.put('/projects/:id', async (c) => {
  const p = await loadOwnedProject(c, c.req.param('id'), 'project.write')
  const b = await parseBody(c, projectSchema)
  await c.env.DB.prepare(`UPDATE projects SET name=?,description=?,sector=?,activity=?,country=?,governorate=?,city=?,currency=?,legal_entity=?,size=?,initial_capital=?,notes=?,updated_at=datetime('now') WHERE id=?`)
    .bind(b.name, b.description ?? null, b.sector ?? null, b.activity ?? null, b.country, b.governorate ?? null, b.city ?? null, b.currency.toUpperCase(), b.legal_entity ?? null, b.size ?? null, b.initial_capital ?? null, b.notes ?? null, p.id).run()
  await audit(c, 'project.update', 'project', p.id)
  return c.json({ ok: true })
})

r.post('/projects/:id/archive', async (c) => {
  const p = await loadOwnedProject(c, c.req.param('id'), 'project.write')
  const { archived } = await parseBody(c, z.object({ archived: z.boolean() }))
  await c.env.DB.prepare(`UPDATE projects SET status=?, updated_at=datetime('now') WHERE id=?`).bind(archived ? 'archived' : 'active', p.id).run()
  await audit(c, archived ? 'project.archive' : 'project.unarchive', 'project', p.id)
  return c.json({ ok: true })
})

/** Soft delete. Projects with exported reports are retained (archived) instead of deleted — retention policy. */
r.delete('/projects/:id', async (c) => {
  const p = await loadOwnedProject(c, c.req.param('id'), 'project.delete')
  const rep = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM reports r JOIN feasibility_studies s ON s.id=r.study_id WHERE s.project_id = ?`).bind(p.id).first<{ n: number }>()
  if ((rep?.n ?? 0) > 0) {
    await c.env.DB.prepare(`UPDATE projects SET status='archived', updated_at=datetime('now') WHERE id=?`).bind(p.id).run()
    await audit(c, 'project.delete_blocked_archived', 'project', p.id)
    return c.json({ ok: true, archivedInstead: true, message: 'يحتوي المشروع على تقارير مصدّرة، لذا تمت أرشفته بدل حذفه وفق سياسة الاحتفاظ بالبيانات.' })
  }
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE projects SET deleted_at=datetime('now') WHERE id=?`).bind(p.id),
    c.env.DB.prepare(`UPDATE feasibility_studies SET deleted_at=datetime('now') WHERE project_id=?`).bind(p.id)
  ])
  await audit(c, 'project.delete', 'project', p.id)
  return c.json({ ok: true })
})

/* ---------------- Files (R2 when bound) ---------------- */
const ALLOWED_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
r.post('/projects/:id/files', async (c) => {
  const p = await loadOwnedProject(c, c.req.param('id'), 'project.write')
  if (!c.env.FILES) throw bad('STORAGE_NOT_CONFIGURED', 'تخزين الملفات (R2) غير مُفعّل في هذه البيئة. راجع DEPLOYMENT.md لإعداده.')
  const form = await c.req.formData()
  const f = form.get('file')
  if (!(f instanceof File)) throw bad('NO_FILE', 'لم يتم إرفاق ملف')
  if (f.size > 10 * 1024 * 1024) throw bad('FILE_TOO_LARGE', 'الحد الأقصى لحجم الملف 10 ميجابايت')
  if (!ALLOWED_MIME.includes(f.type)) throw bad('FILE_TYPE', 'نوع الملف غير مسموح')
  const id = uuid(), key = `orgs/${p.org_id}/projects/${p.id}/${id}`
  await c.env.FILES.put(key, f.stream(), { httpMetadata: { contentType: f.type } })
  await c.env.DB.prepare('INSERT INTO uploaded_files (id,org_id,project_id,name,mime,size,storage_key,created_by) VALUES (?,?,?,?,?,?,?,?)').bind(id, p.org_id, p.id, f.name.slice(0, 200), f.type, f.size, key, c.get('user')!.id).run()
  await audit(c, 'file.upload', 'file', id)
  return c.json({ id }, 201)
})
r.get('/files/:id', async (c) => {
  const org = requirePerm(c, 'project.read')
  const f = await c.env.DB.prepare('SELECT * FROM uploaded_files WHERE id=? AND org_id=? AND deleted_at IS NULL').bind(c.req.param('id'), org.id).first<any>()
  if (!f || !c.env.FILES) throw notFound()
  const obj = await c.env.FILES.get(f.storage_key)
  if (!obj) throw notFound()
  return new Response(obj.body, { headers: { 'Content-Type': f.mime, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`, 'X-Content-Type-Options': 'nosniff' } })
})

/* ---------------- Notifications ---------------- */
r.get('/notifications', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50').bind(c.get('user')!.id).all()
  return c.json({ items: rows.results })
})
r.post('/notifications/read-all', async (c) => {
  await c.env.DB.prepare(`UPDATE notifications SET read_at=datetime('now') WHERE user_id=? AND read_at IS NULL`).bind(c.get('user')!.id).run()
  return c.json({ ok: true })
})

export default r
