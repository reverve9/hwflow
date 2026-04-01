import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal, ModalHeader, ModalSection } from './Modal'

interface UserRow {
  id: string
  email: string
  display_name: string | null
  tenant_id: string | null
  tenant_name: string | null
  role: string
  approved: boolean
  created_at: string
}

interface TenantRow {
  id: string
  name: string
  member_count: number
  created_at: string
}

export function AdminPanel({ onClose }: { onClose: () => void }) {
  const [users, setUsers] = useState<UserRow[]>([])
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [tab, setTab] = useState<'users' | 'tenants'>('users')
  const [message, setMessage] = useState('')

  const loadData = async () => {
    const [u, t] = await Promise.all([
      supabase.rpc('admin_list_users'),
      supabase.rpc('admin_list_tenants'),
    ])
    if (u.data) setUsers(u.data)
    if (t.data) setTenants(t.data)
  }

  useEffect(() => { loadData() }, [])

  const flash = (msg: string) => { setMessage(msg); setTimeout(() => setMessage(''), 2000) }

  const handleApprove = async (id: string, approved: boolean) => {
    await supabase.rpc('admin_update_user', { target_id: id, set_approved: approved })
    flash(approved ? '승인 완료' : '승인 취소')
    loadData()
  }

  const handleRole = async (id: string, role: string) => {
    await supabase.rpc('admin_update_user', { target_id: id, set_role: role })
    flash('역할 변경 완료')
    loadData()
  }

  const handleTenant = async (userId: string, tenantId: string | null) => {
    await supabase.rpc('admin_update_user', {
      target_id: userId,
      set_tenant_id: tenantId || null,
    })
    flash('테넌트 변경 완료')
    loadData()
  }

  const handleCreateTenant = async () => {
    const name = prompt('기관 이름:')
    if (!name?.trim()) return
    await supabase.rpc('admin_create_tenant', { tenant_name: name.trim() })
    flash(`'${name.trim()}' 생성 완료`)
    loadData()
  }

  const pending = users.filter(u => !u.approved)
  const approved = users.filter(u => u.approved)

  return (
    <Modal onClose={onClose} width="720px" height="600px">
      <ModalHeader title="관리자" onClose={onClose}
        extra={message && (
          <span className="text-[11px] px-2 py-0.5 rounded-md bg-green-50 text-green-600 ml-3">
            {message}
          </span>
        )}
      />

      {/* 탭 */}
      <div className="flex border-b border-app-border/50 px-5 shrink-0">
        {(['users', 'tenants'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-[12px] font-medium transition-colors ${
              tab === t ? 'text-navy-700 border-b-2 border-navy-600' : 'text-gray-400 hover:text-gray-500'
            }`}>
            {t === 'users' ? `사용자 (${users.length})` : `기관 (${tenants.length})`}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {tab === 'users' ? (
          <div className="space-y-5">
            {/* 대기 중 */}
            {pending.length > 0 && (
              <ModalSection label={`승인 대기 (${pending.length})`}>
                <div className="space-y-2">
                  {pending.map(u => (
                    <UserCard key={u.id} user={u} tenants={tenants}
                      onApprove={handleApprove} onRole={handleRole} onTenant={handleTenant} />
                  ))}
                </div>
              </ModalSection>
            )}

            {/* 승인됨 */}
            <ModalSection label={`활성 사용자 (${approved.length})`}>
              <div className="space-y-2">
                {approved.length === 0 && <p className="text-[11px] text-app-muted">없음</p>}
                {approved.map(u => (
                  <UserCard key={u.id} user={u} tenants={tenants}
                    onApprove={handleApprove} onRole={handleRole} onTenant={handleTenant} />
                ))}
              </div>
            </ModalSection>
          </div>
        ) : (
          <div className="space-y-4">
            <button onClick={handleCreateTenant}
              className="text-[12px] px-3 py-1.5 rounded-md bg-navy-600 text-white hover:bg-navy-700 transition-colors">
              + 기관 추가
            </button>
            <div className="space-y-2">
              {tenants.map(t => (
                <div key={t.id} className="flex items-center justify-between bg-white rounded-lg border border-app-border p-3">
                  <div>
                    <p className="text-[12px] text-navy-800 font-medium">{t.name}</p>
                    <p className="text-[10px] text-app-muted">{t.member_count}명</p>
                  </div>
                  <span className="text-[10px] text-app-muted">{new Date(t.created_at).toLocaleDateString()}</span>
                </div>
              ))}
              {tenants.length === 0 && <p className="text-[11px] text-app-muted">등록된 기관이 없습니다.</p>}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

function UserCard({ user, tenants, onApprove, onRole, onTenant }: {
  user: UserRow
  tenants: TenantRow[]
  onApprove: (id: string, v: boolean) => void
  onRole: (id: string, v: string) => void
  onTenant: (id: string, v: string | null) => void
}) {
  return (
    <div className={`flex items-center gap-3 bg-white rounded-lg border p-3 ${user.approved ? 'border-app-border' : 'border-orange-200 bg-orange-50/30'}`}>
      {/* 정보 */}
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-navy-800 font-medium truncate">
          {user.display_name || user.email}
        </p>
        <p className="text-[10px] text-app-muted truncate">{user.email}</p>
      </div>

      {/* 테넌트 */}
      <select
        value={user.tenant_id ?? ''}
        onChange={e => onTenant(user.id, e.target.value || null)}
        className="text-[11px] border border-app-border rounded px-1.5 py-1 bg-white min-w-[100px]"
      >
        <option value="">미배정</option>
        {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>

      {/* 역할 */}
      <select
        value={user.role}
        onChange={e => onRole(user.id, e.target.value)}
        className="text-[11px] border border-app-border rounded px-1.5 py-1 bg-white w-[80px]"
      >
        <option value="member">멤버</option>
        <option value="admin">관리자</option>
      </select>

      {/* 승인 */}
      <button
        onClick={() => onApprove(user.id, !user.approved)}
        className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${
          user.approved
            ? 'bg-green-50 text-green-600 hover:bg-red-50 hover:text-red-500'
            : 'bg-navy-600 text-white hover:bg-navy-700'
        }`}
      >
        {user.approved ? '승인됨' : '승인'}
      </button>
    </div>
  )
}
