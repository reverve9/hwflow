import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { Toolbar } from '@/components/Toolbar'
import { FileInput } from '@/components/FileInput'
import { PasteInput } from '@/components/PasteInput'
import { BlockList } from '@/components/BlockList'
import { DocumentPreview } from '@/components/DocumentPreview'
import { StyleInspector } from '@/components/StyleInspector'
import { BlockStyleModal } from '@/components/BlockStyleModal'
import { TableEditModal } from '@/components/TableEditModal'
import { StyleManager } from '@/components/StyleManager'
import { PreviewWindow } from '@/components/PreviewWindow'
import { SettingsModal } from '@/components/SettingsModal'
import { LoginPage } from '@/components/LoginPage'
import { AdminPanel } from '@/components/AdminPanel'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { loadSettings, saveDraft, loadDraft, hasDraft, formatDraftTime } from '@/lib/autosave'
import { logout, getProfile, onAuthChange } from '@/lib/auth'
import type { Profile } from '@/lib/auth'

export default function App() {
  const [authed, setAuthed] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  // Supabase 인증 상태 구독
  useEffect(() => {
    const sub = onAuthChange(async (user) => {
      if (user) {
        const p = await getProfile()
        setProfile(p)
        setAuthed(!!p?.approved)
      } else {
        setProfile(null)
        setAuthed(false)
      }
      setAuthLoading(false)
    })
    return () => sub.unsubscribe()
  }, [])
  const {
    inputMode, irBlocks, showInspector, showSplitPreview,
    showBlockModal, showStyleSettings,
    selectedBlock,
  } = useAppStore()

  const [showPreviewWindow, setShowPreviewWindow] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [draftBanner, setDraftBanner] = useState<string | null>(null)
  useKeyboardShortcuts()

  const block = selectedBlock()
  const hasBlocks = irBlocks.length > 0

  // 시작 시 임시저장 복원 제안
  const initRef = useRef(false)
  useEffect(() => {
    if (initRef.current || !authed) return
    initRef.current = true
    if (hasDraft() && irBlocks.length === 0) {
      const d = loadDraft()
      if (d) setDraftBanner(formatDraftTime(d.savedAt))
    }
  }, [authed])

  // 자동 임시저장
  useEffect(() => {
    if (!authed) return
    const settings = loadSettings()
    if (!settings.autoSave) return
    const timer = setInterval(() => {
      const s = useAppStore.getState()
      if (s.irBlocks.length === 0) return
      saveDraft({
        documentTitle: s.documentTitle,
        selectedPreset: s.selectedPreset,
        selectedFileName: s.selectedFileName,
        irBlocks: s.irBlocks,
        blockOverrides: s.blockOverrides,
        blockTypeOverrides: s.blockTypeOverrides,
        blockTextOverrides: s.blockTextOverrides,
        tableRowOverrides: s.tableRowOverrides,
        tableHeaderOverrides: s.tableHeaderOverrides,
        styleMapping: s.styleMapping,
      })
    }, settings.autoSaveInterval * 1000)
    return () => clearInterval(timer)
  }, [authed, showSettings])

  const handleRestoreDraft = () => {
    const d = loadDraft()
    if (d) useAppStore.getState().restoreDraft(d)
    setDraftBanner(null)
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f0f0]">
        <p className="text-[13px] text-gray-400">로딩 중...</p>
      </div>
    )
  }

  if (!authed) {
    // 로그인은 됐지만 미승인
    if (profile && !profile.approved) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#f0f0f0]">
          <div className="w-[360px] text-center">
            <h1 className="text-2xl font-bold text-navy-800 tracking-tight mb-2">HWFlow</h1>
            <div className="bg-white rounded-xl shadow-lg p-6 space-y-4">
              <p className="text-[13px] text-gray-600">승인 대기 중입니다.</p>
              <p className="text-[11px] text-gray-400">관리자가 계정을 승인하면 사용할 수 있습니다.</p>
              <button
                onClick={async () => { await logout(); setProfile(null) }}
                className="text-[11px] text-gray-400 hover:text-navy-600 transition-colors"
              >로그아웃</button>
            </div>
          </div>
        </div>
      )
    }
    return <LoginPage onLogin={async () => {
      const p = await getProfile()
      setProfile(p)
      setAuthed(!!p?.approved)
    }} />
  }

  return (
    <div className="flex flex-col h-screen bg-app-bg">
      <Toolbar onOpenPreviewWindow={() => setShowPreviewWindow(true)} onOpenSettings={() => setShowSettings(true)}
        isAdmin={profile?.role === 'super_admin' || profile?.role === 'admin'} onOpenAdmin={() => setShowAdmin(true)} />

      {/* 임시저장 복원 배너 */}
      {draftBanner && (
        <div className="flex items-center gap-3 px-4 py-2 bg-navy-50 border-b border-app-border text-[12px] shrink-0">
          <span className="text-navy-700">임시저장된 작업이 있습니다 ({draftBanner})</span>
          <button onClick={handleRestoreDraft}
            className="px-2 py-0.5 rounded-md bg-navy-600 text-white hover:bg-navy-700 transition-colors text-[11px]">
            복원
          </button>
          <button onClick={() => setDraftBanner(null)}
            className="px-2 py-0.5 rounded-md border border-app-border text-navy-600 hover:bg-white transition-colors text-[11px]">
            무시
          </button>
        </div>
      )}

      {/* 본문 */}
      <div className="flex flex-1 min-h-0">
        {/* 좌측: 입력 / 블록 리스트 */}
        <div className="flex-1 flex flex-col min-w-[350px]">
          {hasBlocks ? (
            <BlockList />
          ) : inputMode === 'paste' ? (
            <PasteInput />
          ) : (
            <FileInput />
          )}
        </div>

        {/* 중앙: 스플릿 미리보기 */}
        {showSplitPreview && hasBlocks && (
          <>
            <div className="w-px bg-app-border" />
            <div className="flex-1 min-w-[350px]">
              <DocumentPreview />
            </div>
          </>
        )}

        {/* 우측: 인스펙터 */}
        {showInspector && (
          <>
            <div className="w-px bg-app-border" />
            <div className="w-[280px] shrink-0">
              <StyleInspector />
            </div>
          </>
        )}
      </div>

      {/* 모달 */}
      {showBlockModal && block && (
        block.isTable
          ? <TableEditModal block={block} />
          : <BlockStyleModal block={block} />
      )}
      {showStyleSettings && <StyleManager />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} onLogout={async () => { setShowSettings(false); await logout(); setProfile(null); setAuthed(false) }} />}
      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}

      {/* 새 창 미리보기 */}
      {showPreviewWindow && hasBlocks && (
        <PreviewWindow onClose={() => setShowPreviewWindow(false)} />
      )}
    </div>
  )
}
