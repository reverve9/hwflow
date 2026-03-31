import { useState } from 'react'
import { Modal, ModalHeader, ModalSection, FieldLabel } from './Modal'
import { loadSettings, saveSettings, loadDraft, saveDraft, clearDraft, formatDraftTime, type AppSettings } from '@/lib/autosave'
import { useAppStore } from '@/store/useAppStore'

interface Props {
  onClose: () => void
}

export function SettingsModal({ onClose }: Props) {
  const [settings, setSettings] = useState<AppSettings>(loadSettings)
  const [saved, setSaved] = useState('')
  const draft = loadDraft()

  const update = (patch: Partial<AppSettings>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    saveSettings(next)
  }

  const handleManualSave = () => {
    const s = useAppStore.getState()
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
    setSaved('저장 완료')
    setTimeout(() => setSaved(''), 2000)
  }

  const handleLoadDraft = () => {
    const d = loadDraft()
    if (!d) return
    const s = useAppStore.getState()
    s.restoreDraft(d)
    setSaved('복원 완료')
    setTimeout(() => { setSaved(''); onClose() }, 1000)
  }

  const handleClearDraft = () => {
    clearDraft()
    setSaved('삭제 완료')
    setTimeout(() => setSaved(''), 2000)
  }

  return (
    <Modal onClose={onClose} width="420px" height="auto">
      <ModalHeader title="설정" onClose={onClose} />

      <div className="p-5 space-y-5 overflow-y-auto">
        {/* 자동저장 */}
        <ModalSection label="자동 임시저장">
          <div className="bg-white rounded-lg border border-app-border p-3 space-y-3">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-[11px] text-navy-700">자동 저장 사용</span>
              <div
                className={`w-8 h-[18px] rounded-full transition-colors relative ${settings.autoSave ? 'bg-navy-500' : 'bg-gray-300'}`}
                onClick={() => update({ autoSave: !settings.autoSave })}
              >
                <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform ${settings.autoSave ? 'translate-x-[16px]' : 'translate-x-[2px]'}`} />
              </div>
            </label>
            {settings.autoSave && (
              <div>
                <FieldLabel>저장 간격 (초)</FieldLabel>
                <div className="flex items-center gap-2">
                  {[10, 30, 60, 120].map(v => (
                    <button key={v} onClick={() => update({ autoSaveInterval: v })}
                      className={`px-2 py-1 text-[11px] rounded-md border transition-colors ${
                        settings.autoSaveInterval === v
                          ? 'bg-navy-600 text-white border-navy-600'
                          : 'bg-white text-navy-600 border-app-border hover:bg-navy-50'
                      }`}>
                      {v}초
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ModalSection>

        {/* 수동 저장/복원 */}
        <ModalSection label="수동 임시저장">
          <div className="bg-white rounded-lg border border-app-border p-3 space-y-3">
            {draft && (
              <p className="text-[10px] text-app-muted">
                마지막 저장: {formatDraftTime(draft.savedAt)}
                {draft.documentTitle && ` — "${draft.documentTitle}"`}
              </p>
            )}
            <div className="flex gap-2">
              <button onClick={handleManualSave}
                className="px-3 py-1.5 text-[11px] rounded-md bg-navy-600 text-white hover:bg-navy-700 transition-colors shadow-sm">
                지금 저장
              </button>
              <button onClick={handleLoadDraft} disabled={!draft}
                className="px-3 py-1.5 text-[11px] rounded-md border border-app-border text-navy-600 hover:bg-white transition-colors disabled:opacity-30">
                복원
              </button>
              <button onClick={handleClearDraft} disabled={!draft}
                className="px-3 py-1.5 text-[11px] rounded-md border border-app-border text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30">
                삭제
              </button>
            </div>
            {saved && <p className="text-[11px] text-green-600">{saved}</p>}
          </div>
        </ModalSection>
      </div>
    </Modal>
  )
}
