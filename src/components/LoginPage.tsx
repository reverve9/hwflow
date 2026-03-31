import { useState } from 'react'
import { login } from '@/lib/auth'

interface Props {
  onLogin: () => void
}

export function LoginPage({ onLogin }: Props) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    // 약간의 딜레이 (실제 API 호출 느낌)
    setTimeout(() => {
      const result = login(email)
      if (result.ok) {
        onLogin()
      } else {
        setError(result.error ?? '로그인 실패')
      }
      setLoading(false)
    }, 300)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f0f0]">
      <div className="w-[360px]">
        {/* 로고 */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-navy-800 tracking-tight">HWFlow</h1>
          <p className="text-[13px] text-gray-400 mt-1">문서 변환 도구</p>
        </div>

        {/* 로그인 카드 */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
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

            {error && (
              <p className="text-[11px] text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full py-2.5 rounded-lg bg-navy-600 text-white text-[13px] font-medium hover:bg-navy-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {loading ? '확인 중...' : '로그인'}
            </button>
          </form>
        </div>

        <p className="text-center text-[10px] text-gray-300 mt-6">v0.1.0</p>
      </div>
    </div>
  )
}
