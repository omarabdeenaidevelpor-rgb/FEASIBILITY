/**
 * Subscriptions & payments.
 * Payment Provider Interface: providers implement createCheckout + verifyWebhook.
 * - 'none' (default): no real payments. Checkout returns PAYMENT_NOT_CONFIGURED. In development a clearly-labelled
 *   "dev" provider can simulate a signed webhook so the flow can be tested end-to-end. It never marks real money as paid.
 * - Real providers (e.g. Paymob, Fawry, Stripe) are added by implementing the interface and setting PAYMENT_PROVIDER + secrets.
 */
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv, Bindings } from '../lib/types'
import { requireAuth, requirePerm } from '../lib/auth'
import { parseBody, bad, safeJson, ApiError } from '../lib/http'
import { audit, getActivePlan, getUsage, isDev, notify } from '../lib/services'
import { uuid, hmacSha256, timingSafeEqual } from '../lib/crypto'

interface PaymentProvider {
  id: string
  createCheckout(p: { paymentId: string; amount: number; currency: string; description: string; returnUrl: string }): Promise<{ url: string }>
  verifyWebhook(req: Request, rawBody: string): Promise<{ eventId: string; paymentId: string; status: 'succeeded' | 'failed' } | null>
}

function devProvider(env: Bindings): PaymentProvider {
  return {
    id: 'dev',
    async createCheckout(p) { return { url: `/app/billing/dev-checkout?payment=${p.paymentId}` } },
    async verifyWebhook(req, raw) {
      const sig = req.headers.get('x-signature') || ''
      const expected = await hmacSha256(env.PAYMENT_WEBHOOK_SECRET || 'dev-only-secret', raw)
      if (!timingSafeEqual(sig, expected)) return null
      const b = safeJson<any>(raw, {})
      return { eventId: String(b.eventId), paymentId: String(b.paymentId), status: b.status === 'succeeded' ? 'succeeded' : 'failed' }
    }
  }
}

function getProvider(env: Bindings): PaymentProvider | null {
  const p = env.PAYMENT_PROVIDER || (isDev(env) ? 'dev' : 'none')
  if (p === 'dev' && isDev(env)) return devProvider(env)
  return null // real providers plug in here
}

const r = new Hono<AppEnv>()

/* public plans */
r.get('/plans', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM plans WHERE is_active=1 ORDER BY sort_order').all<any>()
  return c.json({ items: rows.results.map(p => ({ ...p, features: safeJson(p.features_json, []), features_json: undefined })), paymentsEnabled: !!getProvider(c.env), providerMode: getProvider(c.env)?.id || 'none' })
})

r.get('/subscription', requireAuth, async (c) => {
  const org = requirePerm(c, 'study.read')
  const plan = await getActivePlan(c.env.DB, org.id)
  const usage = await getUsage(c.env.DB, org.id)
  const payments = await c.env.DB.prepare('SELECT p.*, i.number AS invoice_number FROM payments p LEFT JOIN invoices i ON i.payment_id=p.id WHERE p.org_id=? ORDER BY p.created_at DESC LIMIT 50').bind(org.id).all()
  return c.json({ plan: { ...plan, features: safeJson(plan.features_json, []) }, usage, payments: payments.results, paymentsEnabled: !!getProvider(c.env), providerMode: getProvider(c.env)?.id || 'none' })
})

r.post('/checkout', requireAuth, async (c) => {
  const org = requirePerm(c, 'billing.manage')
  const b = await parseBody(c, z.object({ purpose: z.enum(['subscription', 'single_study']), planId: z.string().max(30).optional(), cycle: z.enum(['monthly', 'yearly']).optional(), coupon: z.string().max(40).optional(), idempotencyKey: z.string().min(8).max(80) }))
  const prov = getProvider(c.env)
  if (!prov) throw new ApiError(503, 'PAYMENT_NOT_CONFIGURED', 'بوابة الدفع غير مُفعّلة بعد. سيتم تفعيلها من الإدارة بعد إعداد مزود الدفع.')
  const dup = await c.env.DB.prepare('SELECT id,status FROM payments WHERE idempotency_key=?').bind(b.idempotencyKey).first<any>()
  if (dup) return c.json({ paymentId: dup.id, status: dup.status, reused: true })
  let amount: number | null = null, currency = 'EGP', planId: string | null = null
  if (b.purpose === 'subscription') {
    const p = await c.env.DB.prepare('SELECT * FROM plans WHERE id=? AND is_active=1').bind(b.planId || '').first<any>()
    if (!p || p.id === 'free') throw bad('PLAN', 'الباقة غير صالحة')
    amount = b.cycle === 'yearly' ? p.price_yearly : p.price_monthly; currency = p.currency; planId = p.id
  } else {
    const p = await c.env.DB.prepare(`SELECT price_single_study, currency FROM plans WHERE id='pro'`).first<any>()
    amount = p?.price_single_study; currency = p?.currency || 'EGP'
  }
  if (amount == null || amount <= 0) throw bad('PRICE_NOT_SET', 'لم تُحدد الإدارة سعر هذا الخيار بعد')
  if (b.coupon) {
    const cp = await c.env.DB.prepare(`SELECT * FROM coupons WHERE code=? AND is_active=1 AND (valid_until IS NULL OR valid_until > datetime('now')) AND (max_redemptions IS NULL OR redemptions < max_redemptions)`).bind(b.coupon).first<any>()
    if (!cp) throw bad('COUPON', 'الكوبون غير صالح أو منتهي')
    amount = Math.max(0, cp.percent_off ? amount * (1 - cp.percent_off / 100) : amount - (cp.amount_off || 0))
    amount = Math.round(amount * 100) / 100
  }
  const id = uuid()
  await c.env.DB.prepare(`INSERT INTO payments (id,org_id,user_id,provider,purpose,plan_id,billing_cycle,amount,currency,coupon_code,status,idempotency_key) VALUES (?,?,?,?,?,?,?,?,?,?,'pending',?)`)
    .bind(id, org.id, c.get('user')!.id, prov.id, b.purpose, planId, b.cycle || null, amount, currency, b.coupon || null, b.idempotencyKey).run()
  const co = await prov.createCheckout({ paymentId: id, amount, currency, description: b.purpose, returnUrl: '/app/billing' })
  await audit(c, 'payment.checkout', 'payment', id, { amount, currency })
  return c.json({ paymentId: id, checkoutUrl: co.url, amount, currency, provider: prov.id })
})

/** Dev-only: produce a signed webhook (simulates what a real gateway would send). */
r.post('/dev/simulate-webhook', requireAuth, async (c) => {
  if (!isDev(c.env)) throw new ApiError(404, 'NOT_FOUND', 'غير متاح')
  const org = requirePerm(c, 'billing.manage')
  const b = await parseBody(c, z.object({ paymentId: z.string(), status: z.enum(['succeeded', 'failed']) }))
  const p = await c.env.DB.prepare('SELECT id FROM payments WHERE id=? AND org_id=?').bind(b.paymentId, org.id).first()
  if (!p) throw bad('PAYMENT', 'عملية غير موجودة')
  const raw = JSON.stringify({ eventId: 'evt_' + uuid(), paymentId: b.paymentId, status: b.status })
  const sig = await hmacSha256(c.env.PAYMENT_WEBHOOK_SECRET || 'dev-only-secret', raw)
  const res = await handleWebhook(c.env, new Request('http://x', { method: 'POST', headers: { 'x-signature': sig } }), raw)
  return c.json(res)
})

async function handleWebhook(env: Bindings, req: Request, raw: string) {
  const prov = getProvider(env)
  if (!prov) throw new ApiError(503, 'PAYMENT_NOT_CONFIGURED', 'not configured')
  const ev = await prov.verifyWebhook(req, raw)
  if (!ev) throw new ApiError(401, 'BAD_SIGNATURE', 'invalid signature')
  const db = env.DB
  // Idempotency: each provider event processed once
  const ins = await db.prepare('INSERT OR IGNORE INTO payment_events (provider,event_id,payload) VALUES (?,?,?)').bind(prov.id, ev.eventId, raw.slice(0, 4000)).run()
  if (!ins.meta.changes) return { ok: true, duplicate: true }
  const pay = await db.prepare('SELECT * FROM payments WHERE id=?').bind(ev.paymentId).first<any>()
  if (!pay || pay.status !== 'pending') return { ok: true, ignored: true }
  if (ev.status === 'failed') {
    await db.prepare(`UPDATE payments SET status='failed', updated_at=datetime('now') WHERE id=?`).bind(pay.id).run()
    return { ok: true, status: 'failed' }
  }
  const stmts = [db.prepare(`UPDATE payments SET status='succeeded', updated_at=datetime('now') WHERE id=? AND status='pending'`).bind(pay.id)]
  const inv = `INV-${new Date().getFullYear()}-${pay.id.slice(0, 8).toUpperCase()}`
  stmts.push(db.prepare('INSERT OR IGNORE INTO invoices (id,number,org_id,payment_id,amount,currency) VALUES (?,?,?,?,?,?)').bind(uuid(), inv, pay.org_id, pay.id, pay.amount, pay.currency))
  if (pay.purpose === 'subscription') {
    stmts.push(db.prepare(`UPDATE subscriptions SET status='canceled', updated_at=datetime('now') WHERE org_id=? AND status='active'`).bind(pay.org_id))
    stmts.push(db.prepare(`INSERT INTO subscriptions (id,org_id,plan_id,status,billing_cycle,current_period_end) VALUES (?,?,?,'active',?,datetime('now', ?))`).bind(uuid(), pay.org_id, pay.plan_id, pay.billing_cycle, pay.billing_cycle === 'yearly' ? '+1 year' : '+1 month'))
  } else if (pay.purpose === 'single_study') {
    stmts.push(db.prepare(`UPDATE subscriptions SET extra_study_credits = extra_study_credits + 1 WHERE org_id=? AND status='active'`).bind(pay.org_id))
  }
  if (pay.coupon_code) stmts.push(db.prepare('UPDATE coupons SET redemptions = redemptions + 1 WHERE code=?').bind(pay.coupon_code))
  await db.batch(stmts)
  await notify(db, pay.user_id, 'تم تأكيد الدفع', `رقم الفاتورة ${inv}`, '/app/billing')
  return { ok: true, status: 'succeeded', invoice: inv }
}

/** Public webhook endpoint (signature-verified) */
r.post('/webhooks/payments', async (c) => {
  const raw = await c.req.text()
  return c.json(await handleWebhook(c.env, c.req.raw, raw))
})

r.post('/subscription/cancel', requireAuth, async (c) => {
  const org = requirePerm(c, 'billing.manage')
  await c.env.DB.prepare(`UPDATE subscriptions SET cancel_at_period_end=1, updated_at=datetime('now') WHERE org_id=? AND status='active' AND plan_id != 'free'`).bind(org.id).run()
  await audit(c, 'subscription.cancel', 'org', org.id)
  return c.json({ ok: true, message: 'سيتم إلغاء الاشتراك بنهاية الفترة الحالية.' })
})

export default r
