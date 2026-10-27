import type { Context } from 'hono'
import type { AppEnv, Bindings } from './types'
import { limitReached, period, safeJson } from './http'

/* ---------------- Audit ---------------- */
export async function audit(c: Context<AppEnv>, action: string, entity?: string, entityId?: string, meta?: unknown) {
  try {
    await c.env.DB.prepare('INSERT INTO audit_logs (actor_id,org_id,action,entity,entity_id,meta_json,ip,request_id) VALUES (?,?,?,?,?,?,?,?)')
      .bind(c.get('user')?.id ?? null, c.get('org')?.id ?? null, action, entity ?? null, entityId ?? null,
        meta ? JSON.stringify(meta).slice(0, 4000) : null, c.req.header('cf-connecting-ip') || null, c.get('requestId')).run()
  } catch (e) { console.error(JSON.stringify({ level: 'error', msg: 'audit_failed', err: String(e) })) }
}

export async function notify(db: D1Database, userId: string, title: string, body?: string, link?: string) {
  await db.prepare('INSERT INTO notifications (id,user_id,title,body,link) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(), userId, title, body ?? null, link ?? null).run()
}

/* ---------------- Settings ---------------- */
export async function getSetting<T = any>(db: D1Database, key: string, fallback: T): Promise<T> {
  const r = await db.prepare('SELECT value FROM system_settings WHERE key = ?').bind(key).first<{ value: string }>()
  return r ? { ...fallback as any, ...safeJson(r.value, {}) } : fallback
}

/* ---------------- Plans & limits ---------------- */
export async function getActivePlan(db: D1Database, orgId: string) {
  const sub = await db.prepare(
    `SELECT s.*, p.* , s.id AS subscription_id, s.status AS sub_status FROM subscriptions s JOIN plans p ON p.id = s.plan_id
     WHERE s.org_id = ? AND s.status = 'active' AND (s.current_period_end IS NULL OR s.current_period_end > datetime('now'))
     ORDER BY s.created_at DESC LIMIT 1`).bind(orgId).first<any>()
  if (sub) return sub
  // expire stale subscriptions lazily and fall back to free
  await db.prepare(`UPDATE subscriptions SET status='expired', updated_at=datetime('now') WHERE org_id = ? AND status='active' AND current_period_end IS NOT NULL AND current_period_end <= datetime('now')`).bind(orgId).run()
  const free = await db.prepare(`SELECT *, NULL AS subscription_id, 'active' AS sub_status, 0 AS extra_study_credits FROM plans WHERE id='free'`).first<any>()
  return free
}

export async function getUsage(db: D1Database, orgId: string) {
  const p = period()
  const rows = await db.prepare('SELECT metric, value FROM subscription_usage WHERE org_id = ? AND period = ?').bind(orgId, p).all<{ metric: string; value: number }>()
  const u = { ai_requests: 0, exports: 0, ai_tokens: 0 } as Record<'ai_requests' | 'exports' | 'ai_tokens', number>
  for (const r of rows.results) (u as any)[r.metric] = r.value
  const counts = await db.prepare(
    `SELECT (SELECT COUNT(*) FROM projects WHERE org_id = ?1 AND deleted_at IS NULL) AS projects,
            (SELECT COUNT(*) FROM feasibility_studies WHERE org_id = ?1 AND deleted_at IS NULL) AS studies`).bind(orgId).first<{ projects: number; studies: number }>()
  return { period: p, ...u, projects: counts?.projects ?? 0, studies: counts?.studies ?? 0 }
}

export async function incUsage(db: D1Database, orgId: string, metric: 'ai_requests' | 'exports' | 'ai_tokens', by = 1) {
  await db.prepare(`INSERT INTO subscription_usage (org_id, period, metric, value) VALUES (?,?,?,?)
    ON CONFLICT(org_id, period, metric) DO UPDATE SET value = value + excluded.value`).bind(orgId, period(), metric, by).run()
}

export async function enforceLimit(db: D1Database, orgId: string, kind: 'projects' | 'studies' | 'ai_requests' | 'exports') {
  const plan = await getActivePlan(db, orgId)
  const usage = await getUsage(db, orgId)
  const map = {
    projects: [usage.projects, plan.max_projects, 'عدد المشروعات'],
    studies: [usage.studies, plan.max_studies + (plan.extra_study_credits || 0), 'عدد الدراسات'],
    ai_requests: [usage.ai_requests, plan.max_ai_requests_month, 'طلبات الذكاء الاصطناعي هذا الشهر'],
    exports: [usage.exports, plan.max_exports_month, 'تصدير التقارير هذا الشهر']
  } as const
  const [used, max, label] = map[kind]
  if (used >= max) throw limitReached(`وصلت إلى الحد الأقصى في باقتك الحالية (${label}: ${max}). يمكنك الترقية من صفحة الاشتراك.`)
  return plan
}

/* ---------------- Email (pluggable) ---------------- */
export async function sendMail(env: Bindings, to: string, subject: string, html: string): Promise<{ sent: boolean; provider: string }> {
  if (env.RESEND_API_KEY && env.MAIL_FROM) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.MAIL_FROM, to, subject, html })
    })
    return { sent: r.ok, provider: 'resend' }
  }
  console.log(JSON.stringify({ level: 'info', msg: 'mail_not_configured', to, subject }))
  return { sent: false, provider: 'none' }
}

export const isDev = (env: Bindings) => (env.APP_ENV || 'production') === 'development'
