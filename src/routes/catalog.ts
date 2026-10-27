/* Feasibility-study catalog: public browsing + purchase requests (WhatsApp hand-off), and admin management. */
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../lib/types'
import { requirePlatformAdmin } from '../lib/auth'
import { parseBody, bad, notFound, safeJson } from '../lib/http'
import { audit, getSetting } from '../lib/services'
import { uuid, sha256 } from '../lib/crypto'

const DEFAULT_WA = '201008338490'
const J = (s: string | null | undefined) => safeJson<any[]>(s, [])

async function catalogSettings(db: D1Database) {
  const s = await getSetting<any>(db, 'catalog', {})
  return { whatsapp: String(s.whatsapp || DEFAULT_WA).replace(/\D/g, '') || DEFAULT_WA, show_prices: s.show_prices !== false, intro: s.intro || '' }
}
const mapSector = (r: any) => ({ id: r.id, name_ar: r.name_ar, tagline: r.tagline, description: r.description, icon: r.icon, image: r.image, color: r.color, items: J(r.items_json), studies_count: r.studies_count ?? undefined, sort_order: r.sort_order, is_active: !!r.is_active })
const mapStudy = (r: any, showPrice = true, full = false) => {
  const o: any = { id: r.id, sector_id: r.sector_id, slug: r.slug, title: r.title, icon: r.icon, image: r.image, summary: r.summary, price: showPrice ? r.price : null, currency: r.currency, sort_order: r.sort_order, is_active: !!r.is_active }
  if (full) Object.assign(o, { description: r.description, contents: J(r.contents_json), requirements: J(r.requirements_json), cost_items: J(r.cost_items_json), revenue: J(r.revenue_json), risks: J(r.risks_json), deliverables: r.deliverables })
  return o
}

/* ---------------- Public ---------------- */
export const publicCatalog = new Hono<AppEnv>()

publicCatalog.get('/catalog/settings', async (c) => c.json(await catalogSettings(c.env.DB)))

publicCatalog.get('/sectors', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT s.*, (SELECT COUNT(*) FROM catalog_studies t WHERE t.sector_id=s.id AND t.is_active=1) AS studies_count FROM catalog_sectors s WHERE s.is_active=1 ORDER BY s.sort_order, s.name_ar`).all<any>()
  return c.json({ items: rows.results.map(mapSector) })
})

publicCatalog.get('/sectors/:id', async (c) => {
  const s = await c.env.DB.prepare('SELECT * FROM catalog_sectors WHERE id=? AND is_active=1').bind(c.req.param('id')).first<any>()
  if (!s) throw notFound('القطاع غير موجود')
  const cfg = await catalogSettings(c.env.DB)
  const rows = await c.env.DB.prepare('SELECT * FROM catalog_studies WHERE sector_id=? AND is_active=1 ORDER BY sort_order, title').bind(s.id).all<any>()
  return c.json({ sector: mapSector(s), studies: rows.results.map(r => mapStudy(r, cfg.show_prices)) })
})

publicCatalog.get('/catalog/search', async (c) => {
  const q = (c.req.query('q') || '').trim().slice(0, 60)
  if (q.length < 2) return c.json({ items: [] })
  const cfg = await catalogSettings(c.env.DB)
  const rows = await c.env.DB.prepare(`SELECT t.* FROM catalog_studies t JOIN catalog_sectors s ON s.id=t.sector_id AND s.is_active=1 WHERE t.is_active=1 AND (t.title LIKE '%'||?1||'%' OR t.summary LIKE '%'||?1||'%') ORDER BY t.title LIMIT 20`).bind(q).all<any>()
  return c.json({ items: rows.results.map(r => mapStudy(r, cfg.show_prices)) })
})

publicCatalog.get('/catalog/:slug', async (c) => {
  const r = await c.env.DB.prepare(`SELECT t.*, s.name_ar AS sector_name, s.color AS sector_color FROM catalog_studies t JOIN catalog_sectors s ON s.id=t.sector_id WHERE t.slug=? AND t.is_active=1 AND s.is_active=1`).bind(c.req.param('slug')).first<any>()
  if (!r) throw notFound('الدراسة غير موجودة')
  const cfg = await catalogSettings(c.env.DB)
  const related = await c.env.DB.prepare('SELECT * FROM catalog_studies WHERE sector_id=? AND id!=? AND is_active=1 ORDER BY sort_order LIMIT 4').bind(r.sector_id, r.id).all<any>()
  return c.json({ study: { ...mapStudy(r, cfg.show_prices, true), sector_name: r.sector_name, sector_color: r.sector_color }, related: related.results.map(x => mapStudy(x, cfg.show_prices)), whatsapp: cfg.whatsapp })
})

const purchaseSchema = z.object({
  studyId: z.string().min(1).max(80),
  name: z.string().trim().min(3, 'الاسم قصير جدًا').max(100),
  phone: z.string().trim().regex(/^\+?[0-9\s-]{8,20}$/, 'رقم هاتف غير صالح'),
  email: z.union([z.string().trim().email('بريد غير صالح').max(150), z.literal('')]).optional(),
  governorate: z.string().trim().max(60).optional(),
  budget: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(1000).optional(),
  website: z.string().max(0).optional() // honeypot
})

publicCatalog.post('/purchase-requests', async (c) => {
  const b = await parseBody(c, purchaseSchema)
  const st = await c.env.DB.prepare('SELECT id,title FROM catalog_studies WHERE id=? AND is_active=1').bind(b.studyId).first<any>()
  if (!st) throw notFound('الدراسة غير موجودة')
  const ip = c.req.header('cf-connecting-ip') || 'local'
  const key = 'purchase:' + ip
  const n = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM login_attempts WHERE key=? AND created_at > datetime('now','-60 minutes')`).bind(key).first<any>()
  if (n.n >= 10) throw bad('RATE_LIMITED', 'تم إرسال طلبات كثيرة، حاول لاحقًا')
  const id = uuid()
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO login_attempts (key) VALUES (?)').bind(key),
    c.env.DB.prepare('INSERT INTO purchase_requests (id,study_id,study_title,name,phone,email,governorate,budget,notes,ip_hash) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(id, st.id, st.title, b.name, b.phone, b.email || null, b.governorate || null, b.budget || null, b.notes || null, (await sha256(ip)).slice(0, 16))
  ])
  const cfg = await catalogSettings(c.env.DB)
  return c.json({ ok: true, id, ref: id.slice(0, 8).toUpperCase(), whatsapp: cfg.whatsapp })
})

/* ---------------- Admin ---------------- */
export const adminCatalog = new Hono<AppEnv>()
adminCatalog.use('*', requirePlatformAdmin)

const strList = z.array(z.string().trim().min(1).max(300)).max(40)
const sectorSchema = z.object({
  name_ar: z.string().trim().min(2).max(120), tagline: z.string().max(200).optional().nullable(), description: z.string().max(2000).optional().nullable(),
  icon: z.string().max(60).optional().nullable(), image: z.string().max(300).regex(/^(\/static\/|https:\/\/)/, 'رابط الصورة يجب أن يبدأ بـ /static/ أو https://').optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(), items: strList.optional(), sort_order: z.number().int().optional(), is_active: z.boolean().optional()
})
const studySchema = z.object({
  sector_id: z.string().min(1).max(60), slug: z.string().trim().regex(/^[a-z0-9-]{3,80}$/, 'الـ slug بحروف لاتينية صغيرة وأرقام وشرطات'), title: z.string().trim().min(3).max(200),
  icon: z.string().max(60).optional().nullable(), image: z.string().max(300).regex(/^(\/static\/|https:\/\/)/).optional().nullable(),
  summary: z.string().max(600).optional().nullable(), description: z.string().max(5000).optional().nullable(),
  contents: strList.optional(), requirements: strList.optional(), cost_items: strList.optional(), revenue: strList.optional(), risks: strList.optional(),
  deliverables: z.string().max(1000).optional().nullable(), price: z.number().nonnegative().max(1e9).nullable().optional(), currency: z.string().length(3).optional(),
  sort_order: z.number().int().optional(), is_active: z.boolean().optional()
})

adminCatalog.get('/sectors', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT s.*, (SELECT COUNT(*) FROM catalog_studies t WHERE t.sector_id=s.id) AS studies_count FROM catalog_sectors s ORDER BY s.sort_order`).all<any>()
  return c.json({ items: rows.results.map(mapSector) })
})
adminCatalog.post('/sectors', async (c) => {
  const b = await parseBody(c, sectorSchema.extend({ id: z.string().regex(/^[a-z0-9-]{2,40}$/, 'المعرف بحروف لاتينية صغيرة') }))
  if (await c.env.DB.prepare('SELECT 1 FROM catalog_sectors WHERE id=?').bind(b.id).first()) throw bad('EXISTS', 'المعرف مستخدم')
  await c.env.DB.prepare('INSERT INTO catalog_sectors (id,name_ar,tagline,description,icon,image,color,items_json,sort_order,is_active) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(b.id, b.name_ar, b.tagline ?? null, b.description ?? null, b.icon ?? 'fa-briefcase', b.image ?? null, b.color ?? '#0B2A5B', JSON.stringify(b.items || []), b.sort_order ?? 99, b.is_active === false ? 0 : 1).run()
  await audit(c, 'admin.catalog_sector_create', 'catalog_sector', b.id)
  return c.json({ ok: true, id: b.id })
})
adminCatalog.put('/sectors/:id', async (c) => {
  const b = await parseBody(c, sectorSchema)
  const r = await c.env.DB.prepare(`UPDATE catalog_sectors SET name_ar=?,tagline=?,description=?,icon=COALESCE(?,icon),image=COALESCE(?,image),color=COALESCE(?,color),items_json=?,sort_order=COALESCE(?,sort_order),is_active=COALESCE(?,is_active),updated_at=datetime('now') WHERE id=?`)
    .bind(b.name_ar, b.tagline ?? null, b.description ?? null, b.icon ?? null, b.image ?? null, b.color ?? null, JSON.stringify(b.items || []), b.sort_order ?? null, b.is_active === undefined ? null : b.is_active ? 1 : 0, c.req.param('id')).run()
  if (!r.meta.changes) throw notFound()
  await audit(c, 'admin.catalog_sector_update', 'catalog_sector', c.req.param('id'))
  return c.json({ ok: true })
})

adminCatalog.get('/studies', async (c) => {
  const sector = c.req.query('sector') || ''
  const rows = await c.env.DB.prepare(`SELECT * FROM catalog_studies WHERE (?1='' OR sector_id=?1) ORDER BY sector_id, sort_order`).bind(sector).all<any>()
  return c.json({ items: rows.results.map(r => mapStudy(r, true, true)) })
})
adminCatalog.post('/studies', async (c) => {
  const b = await parseBody(c, studySchema)
  if (!await c.env.DB.prepare('SELECT 1 FROM catalog_sectors WHERE id=?').bind(b.sector_id).first()) throw bad('SECTOR', 'القطاع غير موجود')
  if (await c.env.DB.prepare('SELECT 1 FROM catalog_studies WHERE slug=?').bind(b.slug).first()) throw bad('SLUG', 'الـ slug مستخدم')
  const id = 'cs-' + b.slug
  await c.env.DB.prepare(`INSERT INTO catalog_studies (id,sector_id,slug,title,icon,image,summary,description,contents_json,requirements_json,cost_items_json,revenue_json,risks_json,deliverables,price,currency,sort_order,is_active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, b.sector_id, b.slug, b.title, b.icon ?? 'fa-file-lines', b.image ?? null, b.summary ?? null, b.description ?? null, JSON.stringify(b.contents || []), JSON.stringify(b.requirements || []), JSON.stringify(b.cost_items || []), JSON.stringify(b.revenue || []), JSON.stringify(b.risks || []), b.deliverables ?? null, b.price ?? null, b.currency || 'EGP', b.sort_order ?? 99, b.is_active === false ? 0 : 1).run()
  await audit(c, 'admin.catalog_study_create', 'catalog_study', id)
  return c.json({ ok: true, id })
})
adminCatalog.put('/studies/:id', async (c) => {
  const b = await parseBody(c, studySchema.partial())
  const cur = await c.env.DB.prepare('SELECT * FROM catalog_studies WHERE id=?').bind(c.req.param('id')).first<any>()
  if (!cur) throw notFound()
  if (b.slug && b.slug !== cur.slug && await c.env.DB.prepare('SELECT 1 FROM catalog_studies WHERE slug=?').bind(b.slug).first()) throw bad('SLUG', 'الـ slug مستخدم')
  const v = <K extends keyof typeof b>(k: K, col: string) => (b[k] === undefined ? cur[col] : b[k])
  const js = (k: 'contents' | 'requirements' | 'cost_items' | 'revenue' | 'risks') => (b[k] === undefined ? cur[k + '_json'] : JSON.stringify(b[k]))
  await c.env.DB.prepare(`UPDATE catalog_studies SET sector_id=?,slug=?,title=?,icon=?,image=?,summary=?,description=?,contents_json=?,requirements_json=?,cost_items_json=?,revenue_json=?,risks_json=?,deliverables=?,price=?,currency=?,sort_order=?,is_active=?,updated_at=datetime('now') WHERE id=?`)
    .bind(v('sector_id', 'sector_id'), v('slug', 'slug'), v('title', 'title'), v('icon', 'icon'), v('image', 'image'), v('summary', 'summary'), v('description', 'description'), js('contents'), js('requirements'), js('cost_items'), js('revenue'), js('risks'), v('deliverables', 'deliverables'),
      b.price === undefined ? cur.price : b.price, v('currency', 'currency'), v('sort_order', 'sort_order'), b.is_active === undefined ? cur.is_active : b.is_active ? 1 : 0, cur.id).run()
  await audit(c, 'admin.catalog_study_update', 'catalog_study', cur.id, { price_before: cur.price, price_after: b.price })
  return c.json({ ok: true })
})
adminCatalog.delete('/studies/:id', async (c) => {
  // soft-disable to keep purchase-request history intact
  await c.env.DB.prepare(`UPDATE catalog_studies SET is_active=0, updated_at=datetime('now') WHERE id=?`).bind(c.req.param('id')).run()
  await audit(c, 'admin.catalog_study_disable', 'catalog_study', c.req.param('id'))
  return c.json({ ok: true })
})

adminCatalog.get('/purchase-requests', async (c) => {
  const status = c.req.query('status') || ''
  const rows = await c.env.DB.prepare(`SELECT * FROM purchase_requests WHERE (?1='' OR status=?1) ORDER BY created_at DESC LIMIT 300`).bind(status).all<any>()
  const counts = await c.env.DB.prepare('SELECT status, COUNT(*) AS n FROM purchase_requests GROUP BY status').all<any>()
  return c.json({ items: rows.results, counts: Object.fromEntries(counts.results.map(r => [r.status, r.n])) })
})
adminCatalog.patch('/purchase-requests/:id', async (c) => {
  const b = await parseBody(c, z.object({ status: z.enum(['new', 'contacted', 'completed', 'cancelled']) }))
  const r = await c.env.DB.prepare('UPDATE purchase_requests SET status=? WHERE id=?').bind(b.status, c.req.param('id')).run()
  if (!r.meta.changes) throw notFound()
  await audit(c, 'admin.purchase_request_status', 'purchase_request', c.req.param('id'), b)
  return c.json({ ok: true })
})
