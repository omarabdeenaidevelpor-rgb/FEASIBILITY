import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import { z } from 'zod'
import type { AppEnv } from './lib/types'
import { loadSession } from './lib/auth'
import { ApiError, parseBody, bad } from './lib/http'
import { getSetting } from './lib/services'
import { uuid } from './lib/crypto'
import { aiConfigured } from './lib/ai'
import { ENGINE_VERSION } from '../packages/financial-engine/src'
import authRoutes from './routes/auth'
import coreRoutes from './routes/core'
import studyRoutes from './routes/studies'
import reportRoutes from './routes/reports'
import billingRoutes from './routes/billing'
import adminRoutes from './routes/admin'
import { publicCatalog, adminCatalog } from './routes/catalog'

const app = new Hono<AppEnv>()

/* ---- Request id + structured log ---- */
app.use('*', async (c, next) => {
  const rid = c.req.header('x-request-id') || uuid()
  c.set('requestId', rid)
  const t0 = Date.now()
  await next()
  c.header('X-Request-Id', rid)
  if (c.req.path.startsWith('/api/')) console.log(JSON.stringify({ level: 'info', rid, method: c.req.method, path: c.req.path, status: c.res.status, ms: Date.now() - t0 }))
})

app.use('*', secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.tailwindcss.com', 'https://cdn.jsdelivr.net'],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net', 'data:'],
    imgSrc: ["'self'", 'data:', 'https:'],
    connectSrc: ["'self'"],
    frameAncestors: ["'none'"],
    formAction: ["'self'"]
  },
  crossOriginEmbedderPolicy: false
}))

/* ---- CSRF: state-changing API calls must be same-origin + JSON/explicit header ---- */
app.use('/api/*', async (c, next) => {
  const m = c.req.method
  if (!['GET', 'HEAD', 'OPTIONS'].includes(m) && c.req.path !== '/api/billing/webhooks/payments') {
    const origin = c.req.header('origin')
    const host = new URL(c.req.url).host
    if (origin && new URL(origin).host !== host) throw new ApiError(403, 'CSRF', 'طلب من مصدر غير موثوق')
    if (c.req.header('x-requested-with') !== 'fetch') throw new ApiError(403, 'CSRF', 'طلب غير صالح')
  }
  await next()
})

app.use('/api/*', loadSession)

/* ---- Errors ---- */
app.onError((err, c) => {
  if (err instanceof ApiError) return c.json({ error: { code: err.code, message: err.message, details: err.details } }, err.status)
  console.error(JSON.stringify({ level: 'error', rid: c.get('requestId'), path: c.req.path, err: String((err as any)?.stack || err) }))
  return c.json({ error: { code: 'INTERNAL', message: 'حدث خطأ غير متوقع. تم تسجيله برقم ' + c.get('requestId') } }, 500)
})
app.notFound((c) => c.req.path.startsWith('/api/') ? c.json({ error: { code: 'NOT_FOUND', message: 'المسار غير موجود' } }, 404) : c.html(shell(), 200))

/* ---- Health ---- */
app.get('/api/health', async (c) => {
  let db = 'ok'
  try { await c.env.DB.prepare('SELECT 1').first() } catch { db = 'error' }
  return c.json({ status: db === 'ok' ? 'ok' : 'degraded', db, engine: ENGINE_VERSION, ai: aiConfigured(c.env) ? 'configured' : 'not_configured', storage: c.env.FILES ? 'configured' : 'not_configured', email: c.env.RESEND_API_KEY ? 'configured' : 'not_configured', payments: c.env.PAYMENT_PROVIDER || ((c.env.APP_ENV === 'development') ? 'dev' : 'none'), time: new Date().toISOString() }, db === 'ok' ? 200 : 503)
})

/* ---- Public API ---- */
app.get('/api/session', (c) => c.json({ authenticated: !!c.get('user') }))
app.get('/api/public/settings', async (c) => {
  const p = await getSetting(c.env.DB, 'platform', {} as any)
  const cat = await getSetting(c.env.DB, 'catalog', {} as any)
  return c.json({ whatsapp: String(cat.whatsapp || '201008338490').replace(/\D/g, ''), name_ar: p.name_ar, name_en: p.name_en, tagline_ar: p.tagline_ar, tagline_en: p.tagline_en, logo: p.logo, primary: p.primary, accent: p.accent, support_email: p.support_email, registration_open: p.registration_open !== false })
})
app.get('/api/public/templates', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT t.id,t.sector,t.name_ar,t.name_en,t.icon,t.image,v.definition_json FROM study_templates t JOIN study_template_versions v ON v.template_id=t.id AND v.version=t.current_version WHERE t.is_active=1 ORDER BY t.sort_order`).all<any>()
  return c.json({ items: rows.results.map(r => { const d = JSON.parse(r.definition_json || '{}'); return { id: r.id, sector: r.sector, name_ar: r.name_ar, name_en: r.name_en, icon: r.icon, image: r.image, description_ar: d.description_ar, kpis: d.kpis, risks: d.risks } }) })
})
app.get('/api/public/articles', async (c) => c.json({ items: (await c.env.DB.prepare('SELECT slug,title,excerpt,updated_at FROM articles WHERE published=1 ORDER BY updated_at DESC LIMIT 50').all()).results }))
app.get('/api/public/articles/:slug', async (c) => {
  const a = await c.env.DB.prepare('SELECT slug,title,excerpt,body,updated_at FROM articles WHERE slug=? AND published=1').bind(c.req.param('slug')).first()
  return a ? c.json(a) : c.json({ error: { code: 'NOT_FOUND', message: 'المقال غير موجود' } }, 404)
})
app.post('/api/public/contact', async (c) => {
  const b = await parseBody(c, z.object({ name: z.string().trim().min(2).max(100), email: z.string().email(), subject: z.string().max(200).optional(), message: z.string().trim().min(10).max(5000), website: z.string().max(0).optional() }))
  const ip = c.req.header('cf-connecting-ip') || 'local'
  const n = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM login_attempts WHERE key=? AND created_at > datetime('now','-60 minutes')`).bind('contact:' + ip).first<any>()
  if (n.n >= 5) throw bad('RATE_LIMITED', 'تم إرسال رسائل كثيرة، حاول لاحقًا')
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO login_attempts (key) VALUES (?)').bind('contact:' + ip),
    c.env.DB.prepare('INSERT INTO contact_messages (id,name,email,subject,message) VALUES (?,?,?,?,?)').bind(uuid(), b.name, b.email, b.subject ?? null, b.message)
  ])
  return c.json({ ok: true })
})

app.route('/api/public', publicCatalog)
app.route('/api/admin/catalog', adminCatalog)
app.route('/api/auth', authRoutes)
app.route('/api/billing', billingRoutes)
app.route('/api/admin', adminRoutes)
app.route('/api', reportRoutes)
app.route('/api', studyRoutes)
app.route('/api', coreRoutes)

/* ---- SPA shell ---- */
function shell() {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>اصنع مشروعك بنفسك — منصة دراسات الجدوى الذكية</title>
<meta name="description" content="منصة دراسات جدوى اقتصادية ومالية بمحرك مالي مستقل ومساعد ذكاء اصطناعي: دراسة السوق، التكاليف، الإيرادات، القوائم المالية، NPV وIRR، السيناريوهات والتقارير.">
<link rel="icon" href="/static/img/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.2/css/all.min.css" rel="stylesheet">
<script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config={theme:{extend:{fontFamily:{sans:['Cairo','Tahoma','sans-serif']},colors:{navy:{50:'#eef3fb',100:'#d6e2f5',600:'#123d7e',700:'#0e3270',800:'#0b2a5b',900:'#071d40'},gold:{300:'#ffd95c',400:'#f8c51c',500:'#f2b705',600:'#d39e00'}}}}}</script>
<link href="/static/style.css" rel="stylesheet">
</head><body class="bg-slate-50 font-sans text-slate-800"><div id="app"><div class="min-h-screen flex items-center justify-center"><i class="fas fa-spinner fa-spin text-3xl text-navy-800"></i></div></div>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<script src="/static/js/core.js"></script><script src="/static/js/public.js"></script><script src="/static/js/app.js"></script><script src="/static/js/wizard.js"></script><script src="/static/js/steps.js"></script><script src="/static/js/results.js"></script><script src="/static/js/catalog.js"></script><script src="/static/js/admin.js"></script><script src="/static/js/main.js"></script>
</body></html>`
}

app.get('*', (c) => c.html(shell()))

export default app
