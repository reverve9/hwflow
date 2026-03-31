/**
 * auth.ts — 인증 (추후 Supabase Auth로 교체)
 */

const SESSION_KEY = 'hwflow_session'

// TODO: Supabase Auth 연동 시 제거
const ALLOWED_EMAILS = [
  'admin@hwflow.kr',
  'test@hwflow.kr',
]

export interface Session {
  email: string
  loggedInAt: string
}

export function login(email: string): { ok: boolean; error?: string } {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return { ok: false, error: '이메일을 입력해주세요.' }
  if (!ALLOWED_EMAILS.includes(normalized)) {
    return { ok: false, error: '등록되지 않은 이메일입니다.' }
  }
  const session: Session = { email: normalized, loggedInAt: new Date().toISOString() }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return { ok: true }
}

export function logout() {
  localStorage.removeItem(SESSION_KEY)
}

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}
