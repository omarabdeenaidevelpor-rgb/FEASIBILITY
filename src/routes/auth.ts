import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../lib/types'
import { hashPassword, verifyPassword, randomToken, sha256, uuid, newTotpSecret, verifyTotp } from '../lib/crypto'
import { createSession, destroySession, requireAuth } from '../lib/auth'
import { bad, parseBody, unauthorized, addSeconds, ApiError } from '../lib/http'
import { audit, sendMail, isDev, getSetting, notify } from '../lib/services'

const r = new Hono<AppEnv>()

const password = z.string().min(8, 'كلمة المرور يجب ألا تقل عن 8 أحرف').max(128)
  .refine(p => /[A-Za-z\u0600-\u06FF]/.test(p) && /\d/.test(p), 'كلمة المرور يجب أن تحتوي على حروف وأرقام')

async function rateLimit(db: D1Database, key: string, max: number, windowMin: number) {
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM login_attempts WHERE key = ? AND created_at > datetime('now', ?)`).bind(key, `-${windowMin} minutes`).first<{ n: number }>()
  if ((row?.n ?? 0) >= max) throw new ApiError(429, 'RATE_LIMITED', 'محاولات كثيرة. يرجى المحاولة لاحقًا.')
  await db.prepare('INSERT INTO login_attempts (key) VALUES (?)').bind(key).run()
}

async function issueToken(db: D1Database, userId: string, purpose: 'verify_email' | 'reset_password', ttlSec: number) {
  const token = randomToken(24)
  await db.prepare('INSERT INTO auth_tokens (id,user_id,purpose,expires_at) VALUES (?,?,?,?)').bind(await sha256(token), userId, purpose, addSeconds(ttlSec)).run()
  return token
}

r.post('/register', async (c) => {
  const body = await parseBody(c, z.object({
    name: z.string().trim().min(2).max(100), email: z.string().trim().toLowerCase().email('بريد إلكتروني غير صالح'), password,
    accountType: z.enum(['individual', 'company', 'consultancy']).default('individual'), orgName: z.string().trim().max(120).optional(),
    acceptTerms: z.literal(true, { message: 'يجب الموافقة على الشروط والأحكام' })
  }))
  const settings = await getSetting(c.env.DB, 'platform', { registration_open: true } as any)
  if (settings.registration_open === false) throw bad('REG_CLOSED', 'التسجيل مغلق حاليًا')
  await rateLimit(c.env.DB, 'reg:' + (c.req.header('cf-connecting-ip') || 'local'), 20, 60)
  const exists = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(body.email).first()
  if (exists) throw bad('EMAIL_TAKEN', 'هذا البريد الإلكتروني مسجل بالفعل')

  const userId = uuid(), orgId = uuid()
  const admins = (c.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  const firstUser = !(await c.env.DB.prepare('SELECT 1 FROM users LIMIT 1').first())
  const platformRole = admins.includes(body.email) ? 'SUPER_ADMIN' : (firstUser && isDev(c.env) ? 'SUPER_ADMIN' : 'USER')
  const isOrg = body.accountType !== 'individual'
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO users (id,email,password_hash,name,platform_role) VALUES (?,?,?,?,?)').bind(userId, body.email, await hashPassword(body.password), body.name, platformRole),
    c.env.DB.prepare('INSERT INTO organizations (id,name,type,owner_id) VALUES (?,?,?,?)').bind(orgId, isOrg ? (body.orgName || body.name) : body.name, isOrg ? (body.accountType === 'company' ? 'company' : 'consultancy') : 'personal', userId),
    c.env.DB.prepare('INSERT INTO organization_members (org_id,user_id,role) VALUES (?,?,?)').bind(orgId, userId, isOrg ? 'ORGANIZATION_OWNER' : 'INDIVIDUAL_USER'),
    c.env.DB.prepare(`INSERT INTO subscriptions (id,org_id,plan_id,status,billing_cycle) VALUES (?,?,'free','active','none')`).bind(uuid(), orgId)
  ])
  const token = await issueToken(c.env.DB, userId, 'verify_email', 60 * 60 * 48)
  const link = `${c.env.APP_URL || new URL(c.req.url).origin}/verify-email?token=${token}`
  const mail = await sendMail(c.env, body.email, 'تأكيد البريد الإلكتروني', `<p>مرحبًا ${body.name}</p><p>لتأكيد بريدك: <a href="${link}">${link}</a></p>`)
  await createSession(c, userId)
  c.set('user', { id: userId } as any)
  await audit(c, 'auth.register', 'user', userId)
  await notify(c.env.DB, userId, 'مرحبًا بك في المنصة', 'ابدأ بإنشاء مشروعك الأول ثم دراسة الجدوى الخاصة به.', '/app/projects')
  return c.json({ ok: true, userId, emailSent: mail.sent, ...(isDev(c.env) && !mail.sent ? { devVerifyLink: link } : {}) }, 201)
})

r.post('/login', async (c) => {
  const body = await parseBody(c, z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200), totp: z.string().optional() }))
  const ip = c.req.header('cf-connecting-ip') || 'local'
  await rateLimit(c.env.DB, 'login-ip:' + ip, 30, 15)
  const u = await c.env.DB.prepare('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL').bind(body.email).first<any>()
  if (u?.locked_until && u.locked_until > new Date().toISOString().replace('T', ' ').slice(0, 19)) throw new ApiError(429, 'LOCKED', 'تم قفل الحساب مؤقتًا بسبب محاولات فاشلة متكررة. حاول بعد 15 دقيقة.')
  const ok = u ? await verifyPassword(body.password, u.password_hash) : (await hashPassword('timing-equalizer'), false)
  if (!u || !ok) {
    if (u) {
      const fails = (u.failed_logins || 0) + 1
      await c.env.DB.prepare(`UPDATE users SET failed_logins = ?, locked_until = CASE WHEN ? >= 5 THEN datetime('now','+15 minutes') ELSE locked_until END WHERE id = ?`).bind(fails >= 5 ? 0 : fails, fails, u.id).run()
    }
    throw unauthorized('البريد الإلكتروني أو كلمة المرور غير صحيحة')
  }
  if (u.status !== 'active') throw new ApiError(403, 'SUSPENDED', 'الحساب موقوف. تواصل مع الدعم.')
  if (u.mfa_enabled) {
    if (!body.totp) return c.json({ ok: false, mfaRequired: true }, 200)
    if (!(await verifyTotp(u.mfa_secret, body.totp))) throw unauthorized('رمز التحقق الثنائي غير صحيح')
  }
  await c.env.DB.prepare(`UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = datetime('now') WHERE id = ?`).bind(u.id).run()
  await createSession(c, u.id)
  c.set('user', u)
  await audit(c, 'auth.login', 'user', u.id)
  return c.json({ ok: true })
})

r.post('/logout', async (c) => {
  await destroySession(c)
  return c.json({ ok: true })
})

r.post('/logout-all', requireAuth, async (c) => {
  await c.env.DB.prepare(`UPDATE sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL`).bind(c.get('user')!.id).run()
  await audit(c, 'auth.logout_all', 'user', c.get('user')!.id)
  return c.json({ ok: true })
})

r.get('/sessions', requireAuth, async (c) => {
  const rows = await c.env.DB.prepare(`SELECT id, ip, user_agent, created_at, last_seen_at FROM sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > datetime('now') ORDER BY last_seen_at DESC`).bind(c.get('user')!.id).all<any>()
  return c.json({ sessions: rows.results.map(s => ({ ...s, id: s.id.slice(0, 12), current: s.id === c.get('sessionId') })) })
})

r.post('/forgot-password', async (c) => {
  const { email } = await parseBody(c, z.object({ email: z.string().trim().toLowerCase().email() }))
  await rateLimit(c.env.DB, 'forgot:' + email, 5, 60)
  const u = await c.env.DB.prepare('SELECT id,name FROM users WHERE email = ? AND deleted_at IS NULL').bind(email).first<any>()
  let devLink: string | undefined
  if (u) {
    const token = await issueToken(c.env.DB, u.id, 'reset_password', 60 * 60)
    const link = `${c.env.APP_URL || new URL(c.req.url).origin}/reset-password?token=${token}`
    const mail = await sendMail(c.env, email, 'استعادة كلمة المرور', `<p>لإعادة تعيين كلمة المرور: <a href="${link}">${link}</a> (صالح لمدة ساعة)</p>`)
    if (isDev(c.env) && !mail.sent) devLink = link
  }
  // Same response whether the account exists or not (no enumeration)
  return c.json({ ok: true, message: 'إذا كان البريد مسجلًا فستصلك رسالة بخطوات الاستعادة.', ...(devLink ? { devResetLink: devLink } : {}) })
})

r.post('/reset-password', async (c) => {
  const body = await parseBody(c, z.object({ token: z.string().min(10).max(200), password }))
  const t = await c.env.DB.prepare(`SELECT * FROM auth_tokens WHERE id = ? AND purpose='reset_password' AND used_at IS NULL AND expires_at > datetime('now')`).bind(await sha256(body.token)).first<any>()
  if (!t) throw bad('INVALID_TOKEN', 'الرابط غير صالح أو منتهي الصلاحية')
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE users SET password_hash = ?, failed_logins = 0, locked_until = NULL, updated_at = datetime('now') WHERE id = ?`).bind(await hashPassword(body.password), t.user_id),
    c.env.DB.prepare(`UPDATE auth_tokens SET used_at = datetime('now') WHERE id = ?`).bind(t.id),
    c.env.DB.prepare(`UPDATE sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL`).bind(t.user_id)
  ])
  return c.json({ ok: true })
})

r.post('/verify-email', async (c) => {
  const { token } = await parseBody(c, z.object({ token: z.string().min(10).max(200) }))
  const t = await c.env.DB.prepare(`SELECT * FROM auth_tokens WHERE id = ? AND purpose='verify_email' AND used_at IS NULL AND expires_at > datetime('now')`).bind(await sha256(token)).first<any>()
  if (!t) throw bad('INVALID_TOKEN', 'رابط التحقق غير صالح أو منتهي الصلاحية')
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE users SET email_verified_at = datetime('now') WHERE id = ?`).bind(t.user_id),
    c.env.DB.prepare(`UPDATE auth_tokens SET used_at = datetime('now') WHERE id = ?`).bind(t.id)
  ])
  return c.json({ ok: true })
})

r.post('/resend-verification', requireAuth, async (c) => {
  const u = c.get('user')!
  if (u.email_verified_at) return c.json({ ok: true, already: true })
  await rateLimit(c.env.DB, 'verify:' + u.id, 5, 60)
  const token = await issueToken(c.env.DB, u.id, 'verify_email', 60 * 60 * 48)
  const link = `${c.env.APP_URL || new URL(c.req.url).origin}/verify-email?token=${token}`
  const mail = await sendMail(c.env, u.email, 'تأكيد البريد الإلكتروني', `<a href="${link}">${link}</a>`)
  return c.json({ ok: true, emailSent: mail.sent, ...(isDev(c.env) && !mail.sent ? { devVerifyLink: link } : {}) })
})

/* ---- MFA (TOTP) ---- */
r.post('/mfa/setup', requireAuth, async (c) => {
  const u = c.get('user')!
  const secret = newTotpSecret()
  await c.env.DB.prepare('UPDATE users SET mfa_secret = ?, mfa_enabled = 0 WHERE id = ?').bind(secret, u.id).run()
  const label = encodeURIComponent(`FeasibilityAI:${u.email}`)
  return c.json({ secret, otpauth: `otpauth://totp/${label}?secret=${secret}&issuer=FeasibilityAI` })
})
r.post('/mfa/enable', requireAuth, async (c) => {
  const { code } = await parseBody(c, z.object({ code: z.string().regex(/^\d{6}$/) }))
  const u = await c.env.DB.prepare('SELECT mfa_secret FROM users WHERE id = ?').bind(c.get('user')!.id).first<any>()
  if (!u?.mfa_secret || !(await verifyTotp(u.mfa_secret, code))) throw bad('INVALID_CODE', 'الرمز غير صحيح')
  await c.env.DB.prepare('UPDATE users SET mfa_enabled = 1 WHERE id = ?').bind(c.get('user')!.id).run()
  await audit(c, 'auth.mfa_enabled', 'user', c.get('user')!.id)
  return c.json({ ok: true })
})
r.post('/mfa/disable', requireAuth, async (c) => {
  const { password: pw } = await parseBody(c, z.object({ password: z.string() }))
  const u = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(c.get('user')!.id).first<any>()
  if (!(await verifyPassword(pw, u.password_hash))) throw unauthorized('كلمة المرور غير صحيحة')
  await c.env.DB.prepare('UPDATE users SET mfa_enabled = 0, mfa_secret = NULL WHERE id = ?').bind(c.get('user')!.id).run()
  await audit(c, 'auth.mfa_disabled', 'user', c.get('user')!.id)
  return c.json({ ok: true })
})

r.post('/change-password', requireAuth, async (c) => {
  const body = await parseBody(c, z.object({ current: z.string(), password }))
  const u = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(c.get('user')!.id).first<any>()
  if (!(await verifyPassword(body.current, u.password_hash))) throw unauthorized('كلمة المرور الحالية غير صحيحة')
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(body.password), c.get('user')!.id),
    c.env.DB.prepare(`UPDATE sessions SET revoked_at = datetime('now') WHERE user_id = ? AND id != ? AND revoked_at IS NULL`).bind(c.get('user')!.id, c.get('sessionId'))
  ])
  await audit(c, 'auth.password_changed', 'user', c.get('user')!.id)
  return c.json({ ok: true })
})

export default r
