export type Bindings = {
  DB: D1Database
  FILES?: R2Bucket
  OPENAI_API_KEY?: string
  OPENAI_BASE_URL?: string
  APP_ENV?: string
  APP_URL?: string
  ADMIN_EMAILS?: string
  RESEND_API_KEY?: string
  MAIL_FROM?: string
  PAYMENT_PROVIDER?: string
  PAYMENT_WEBHOOK_SECRET?: string
}

export type SessionUser = {
  id: string
  email: string
  name: string
  platform_role: 'SUPER_ADMIN' | 'ADMIN' | 'USER'
  email_verified_at: string | null
  locale: string
  mfa_enabled: number
}

export type OrgCtx = { id: string; name: string; role: string; type: string; permissions: Set<string> }

export type Variables = {
  user: SessionUser | null
  org: OrgCtx | null
  sessionId: string | null
  requestId: string
}

export type AppEnv = { Bindings: Bindings; Variables: Variables }
