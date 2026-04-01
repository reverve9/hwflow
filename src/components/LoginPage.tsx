import { useState } from 'react'
import { login, signUp } from '@/lib/auth'

interface Props {
  onLogin: () => void
}

export function LoginPage({ onLogin }: Props) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const result = await login(email, password)
    if (result.ok) {
      onLogin()
    } else {
      setError(result.error ?? '로그인 실패')
    }
    setLoading(false)
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 6) { setError('비밀번호는 6자 이상이어야 합니다.'); return }
    setLoading(true)
    setError('')
    const result = await signUp(email, password, displayName)
    if (result.ok) {
      setMessage('가입 완료! 관리자 승인 후 로그인할 수 있습니다.')
      setMode('login')
    } else {
      setError(result.error ?? '가입 실패')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f0f0]">
      <div className="w-[360px]">
        {/* 로고 */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-navy-800 tracking-tight">HWFlow</h1>
          <p className="text-[13px] text-gray-400 mt-1">HWPX 변환 도구</p>
        </div>

        {/* 카드 */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          {/* 탭 */}
          <div className="flex mb-5 border-b border-gray-100">
            <button
              onClick={() => { setMode('login'); setError(''); setMessage('') }}
              className={`flex-1 pb-2.5 text-[13px] font-medium transition-colors ${mode === 'login' ? 'text-navy-700 border-b-2 border-navy-600' : 'text-gray-400 hover:text-gray-500'}`}
            >로그인</button>
            <button
              onClick={() => { setMode('signup'); setError(''); setMessage('') }}
              className={`flex-1 pb-2.5 text-[13px] font-medium transition-colors ${mode === 'signup' ? 'text-navy-700 border-b-2 border-navy-600' : 'text-gray-400 hover:text-gray-500'}`}
            >회원가입</button>
          </div>

          <form onSubmit={mode === 'login' ? handleLogin : handleSignUp} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="text-[11px] font-medium text-gray-500 block mb-1.5">이름</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => { setDisplayName(e.target.value); setError('') }}
                  placeholder="홍길동"
                  autoComplete="name"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-[13px] text-gray-800 placeholder:text-gray-300 outline-none focus:border-navy-400 focus:ring-2 focus:ring-navy-100 transition-all"
                />
              </div>
            )}

            <div>
              <label className="text-[11px] font-medium text-gray-500 block mb-1.5">이메일</label>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                placeholder="name@example.com"
                autoFocus
                autoComplete="email"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-[13px] text-gray-800 placeholder:text-gray-300 outline-none focus:border-navy-400 focus:ring-2 focus:ring-navy-100 transition-all"
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-gray-500 block mb-1.5">비밀번호</label>
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError('') }}
                placeholder={mode === 'signup' ? '6자 이상' : '비밀번호'}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-[13px] text-gray-800 placeholder:text-gray-300 outline-none focus:border-navy-400 focus:ring-2 focus:ring-navy-100 transition-all"
              />
            </div>

            {error && (
              <p className="text-[11px] text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}
            {message && (
              <p className="text-[11px] text-green-600 bg-green-50 rounded-lg px-3 py-2">{message}</p>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="w-full py-2.5 rounded-lg bg-navy-600 text-white text-[13px] font-medium hover:bg-navy-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {loading ? '처리 중...' : mode === 'login' ? '로그인' : '가입하기'}
            </button>
          </form>
        </div>

        <p className="text-center text-[10px] text-gray-300 mt-6">v0.2.0</p>
      </div>
    </div>
  )
}
