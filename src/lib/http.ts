import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { z } from 'zod'

export class ApiError extends HTTPException {
  code: string
  details?: unknown
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(status as any, { message })
    this.code = code
    this.details = details
  }
}

export const bad = (code: string, msg: string, details?: unknown) => new ApiError(400, code, msg, details)
export const unauthorized = (msg = 'يلزم تسجيل الدخول') => new ApiError(401, 'UNAUTHORIZED', msg)
export const forbidden = (msg = 'ليست لديك صلاحية لتنفيذ هذا الإجراء') => new ApiError(403, 'FORBIDDEN', msg)
export const notFound = (msg = 'العنصر غير موجود') => new ApiError(404, 'NOT_FOUND', msg)
export const limitReached = (msg: string) => new ApiError(402, 'PLAN_LIMIT', msg)

export async function parseBody<T extends z.ZodTypeAny>(c: Context, schema: T): Promise<z.infer<T>> {
  let body: unknown
  try { body = await c.req.json() } catch { throw bad('INVALID_JSON', 'صيغة الطلب غير صالحة') }
  const r = schema.safeParse(body)
  if (!r.success) {
    throw bad('VALIDATION', 'بيانات غير صالحة', r.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })))
  }
  return r.data
}

export function paging(c: Context) {
  const page = Math.max(1, parseInt(c.req.query('page') || '1') || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query('pageSize') || '20') || 20))
  return { page, pageSize, offset: (page - 1) * pageSize }
}

export const safeJson = <T = any>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback
  try { return JSON.parse(s) } catch { return fallback }
}

export const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19)
export const addSeconds = (sec: number) => new Date(Date.now() + sec * 1000).toISOString().replace('T', ' ').slice(0, 19)
export const period = () => new Date().toISOString().slice(0, 7)
