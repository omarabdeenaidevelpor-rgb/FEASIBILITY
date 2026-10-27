import type { Context, Next } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { AppEnv, SessionUser, OrgCtx } from './types'
import { randomToken, sha256 } from './crypto'
import { unauthorized, forbidden, notFound } from './http'
import { addSeconds } from './http'

export const SESSION_COOKIE = 'fa_session'
const SESSION_TTL = 60 * 60 * 24 * 14 // 14 days

export async function createSession(c: Context<AppEnv>, userId: string) {
  const token = randomToken(32)
  const id = await sha256(token)
  await c.env.DB.prepare('INSERT INTO sessions (id,user_id,ip,user_agent,expires_at) VALUES (?,?,?,?,?)')
    .bind(id, userId, c.req.header('cf-connecting-ip') || '', (c.req.header('user-agent') || '').slice(0, 250), addSeconds(SESSION_TTL)).run()
  const secure = new URL(c.req.url).protocol === 'https:'
  setCookie(c, SESSION_COOKIE, token, { httpOnly: true, secure, sameSite: 'Lax', path: '/', maxAge: SESSION_TTL })
  return id
}

export async function destroySession(c: Context<AppEnv>) {
  const sid = c.get('sessionId')
  if (sid) await c.env.DB.prepare("UPDATE sessions SET revoked_at = datetime('now') WHERE id = ?").bind(sid).run()
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
}

/** Loads user + active organization (never trusts client-supplied org for authz beyond membership check). */
export async function loadSession(c: Context<AppEnv>, next: Next) {
  c.set('user', null); c.set('org', null); c.set('sessionId', null)
  const token = getCookie(c, SESSION_COOKIE)
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    const sid = await sha256(token)
    const row = await c.env.DB.prepare(
      `SELECT u.id,u.email,u.name,u.platform_role,u.email_verified_at,u.locale,u.mfa_enabled,s.last_seen_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.revoked_at IS NULL AND s.expires_at > datetime('now') AND u.status = 'active' AND u.deleted_at IS NULL`
    ).bind(sid).first<SessionUser & { last_seen_at: string }>()
    if (row) {
      const { last_seen_at, ...user } = row
      c.set('user', user); c.set('sessionId', sid)
      // throttle last_seen writes to once / 5 min
      if (Date.now() - new Date(last_seen_at.replace(' ', 'T') + 'Z').getTime() > 300000)
        await c.env.DB.prepare("UPDATE sessions SET last_seen_at = datetime('now') WHERE id = ?").bind(sid).run()
      const wanted = c.req.header('x-org-id') || getCookie(c, 'fa_org') || ''
      const org = await resolveOrg(c, user.id, wanted)
      c.set('org', org)
    }
  }
  await next()
}

async function resolveOrg(c: Context<AppEnv>, userId: string, wanted: string): Promise<OrgCtx | null> {
  const rows = await c.env.DB.prepare(
    `SELECT o.id,o.name,o.type,m.role FROM organization_members m JOIN organizations o ON o.id=m.org_id
     WHERE m.user_id = ? AND o.deleted_at IS NULL ORDER BY (o.id = ?) DESC, (o.type='personal') DESC LIMIT 1`
  ).bind(userId, wanted).all<{ id: string; name: string; type: string; role: string }>()
  const r = rows.results[0]
  if (!r) return null
  const perms = await c.env.DB.prepare('SELECT permission FROM role_permissions WHERE role = ?').bind(r.role).all<{ permission: string }>()
  return { ...r, permissions: new Set(perms.results.map(p => p.permission)) }
}

export const requireAuth = async (c: Context<AppEnv>, next: Next) => {
  if (!c.get('user')) throw unauthorized()
  await next()
}

export const requirePlatformAdmin = async (c: Context<AppEnv>, next: Next) => {
  const u = c.get('user')
  if (!u) throw unauthorized()
  if (u.platform_role !== 'ADMIN' && u.platform_role !== 'SUPER_ADMIN') throw forbidden()
  await next()
}

export function can(c: Context<AppEnv>, perm: string): boolean {
  return !!c.get('org')?.permissions.has(perm)
}

export function requirePerm(c: Context<AppEnv>, perm: string) {
  const org = c.get('org')
  if (!org) throw forbidden('لا توجد مؤسسة نشطة لهذا الحساب')
  if (!org.permissions.has(perm)) throw forbidden()
  return org
}

/** Ownership check: resource must belong to the active org. Returns 404 (not 403) to avoid ID enumeration. */
export async function loadOwnedStudy(c: Context<AppEnv>, id: string, perm = 'study.read') {
  const org = requirePerm(c, perm)
  const s = await c.env.DB.prepare('SELECT * FROM feasibility_studies WHERE id = ? AND org_id = ? AND deleted_at IS NULL').bind(id, org.id).first<any>()
  if (!s) throw notFound('الدراسة غير موجودة')
  return s
}

export async function loadOwnedProject(c: Context<AppEnv>, id: string, perm = 'project.read') {
  const org = requirePerm(c, perm)
  const p = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ? AND org_id = ? AND deleted_at IS NULL').bind(id, org.id).first<any>()
  if (!p) throw notFound('المشروع غير موجود')
  return p
}
