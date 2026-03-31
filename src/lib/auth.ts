/**
 * auth.ts — 인증 (추후 Supabase Auth로 교체)
 */

const SESSION_KEY = 'hwflow_session'

// TODO: Supabase Auth 연동 시 제거
const ACCOUNTS: Record<string, string> = {
  'reverve9@naver.com': '123456',
  'ahnsujung@korea.kr': 'spahspah512!',
}

export interface Session {
  email: string
  loggedInAt: string
}

export function login(email: string, password: string): { ok: boolean; error?: string } {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return { ok: false, error: '이메일을 입력해주세요.' }
  if (!password) return { ok: false, error: '비밀번호를 입력해주세요.' }
  const expected = ACCOUNTS[normalized]
  if (!expected || expected !== password) {
    return { ok: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' }
  }
  const session: Session = { email: normalized, loggedInAt: new Date().toISOString() }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return { ok: true }
}

export function logout() {
  localStorage.removeItem(SESSION_KEY)
}

const SESSION_TTL_MS = 6 * 60 * 60 * 1000 // 6시간

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const session: Session = JSON.parse(raw)
    if (Date.now() - new Date(session.loggedInAt).getTime() > SESSION_TTL_MS) {
      localStorage.removeItem(SESSION_KEY)
      return null
    }
    return session
  } catch {
    return null
  }
}
