import { useAppStore } from '@/store/useAppStore'
import type { InputMode } from '@/store/types'

export function Toolbar({ onOpenPreviewWindow }: { onOpenPreviewWindow: () => void }) {
  const {
    inputMode, setInputMode, selectedPreset, setSelectedPreset,
    availablePresets, documentTitle, setDocumentTitle,
    showSplitPreview, setShowSplitPreview, showInspector, setShowInspector,
    setShowStyleSettings, irBlocks, isConverting,
    setIRBlocks, setSelectedFileName,
  } = useAppStore()

  const hasBlocks = irBlocks.length > 0

  const handleConvert = async () => {
    const store = useAppStore.getState()
    const { convertToHwpx } = await import('@/lib/convert')
    await convertToHwpx(store)
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-[#f5f5f5] border-b border-app-border shrink-0 sticky top-0 z-30">
      {/* 입력 모드 */}
      <div className="inline-flex rounded-md border border-app-border text-[12px] overflow-hidden">
        {(['file', 'paste'] as InputMode[]).map(mode => (
          <button
            key={mode}
            onClick={() => setInputMode(mode)}
            className={`px-2.5 py-1 transition-colors ${
              inputMode === mode
                ? 'bg-navy-600 text-white'
                : 'bg-app-surface text-navy-700 hover:bg-navy-50'
            } ${mode === 'paste' ? 'border-l border-app-border' : ''}`}
          >
            {mode === 'file' ? '파일 업로드' : '텍스트 붙여넣기'}
          </button>
        ))}
      </div>

      <div className="w-px h-5 bg-app-border" />

      {/* 스타일 프리셋 */}
      <div className="flex items-center gap-1.5 text-[12px]">
        <span className="text-app-muted">스타일:</span>
        <select
          value={selectedPreset}
          onChange={e => setSelectedPreset(e.target.value)}
          className="border border-app-border rounded-md px-2 py-1 text-[12px] bg-app-surface text-navy-800"
        >
          {availablePresets.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      <div className="w-px h-5 bg-app-border" />

      {/* 문서 제목 */}
      <input
        type="text"
        placeholder="문서 제목"
        value={documentTitle}
        onChange={e => setDocumentTitle(e.target.value)}
        className="border border-app-border rounded-md px-2 py-1 text-[12px] w-36 bg-app-surface text-navy-800 placeholder:text-app-muted"
      />

      <div className="flex-1" />

      {/* 블록이 있으면 "다른 파일" 버튼 */}
      {hasBlocks && (
        <button
          onClick={() => { setIRBlocks([]); setSelectedFileName('') }}
          className="text-[12px] px-2 py-1 rounded-md border border-app-border hover:bg-navy-50 text-navy-600 transition-colors"
        >
          다른 파일
        </button>
      )}

      {/* 스플릿 미리보기 */}
      <button
        onClick={() => setShowSplitPreview(!showSplitPreview)}
        disabled={!hasBlocks}
        className={`p-1.5 rounded-md transition-colors ${showSplitPreview ? 'bg-navy-100 text-navy-600' : 'text-app-muted hover:bg-navy-50 hover:text-navy-600'} disabled:opacity-30`}
        title="스플릿 미리보기"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="1.5" />
          <line x1="12" y1="3" x2="12" y2="21" strokeWidth="1.5" />
        </svg>
      </button>

      {/* 새 창 미리보기 */}
      <button
        onClick={onOpenPreviewWindow}
        disabled={!hasBlocks}
        className="p-1.5 rounded-md text-app-muted hover:bg-navy-50 hover:text-navy-600 transition-colors disabled:opacity-30"
        title="새 창으로 미리보기"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
          <rect x="2" y="4" width="16" height="14" rx="2" />
          <rect x="6" y="2" width="16" height="14" rx="2" fill="white" />
          <rect x="6" y="2" width="16" height="14" rx="2" />
        </svg>
      </button>

      {/* 스타일 설정 */}
      <button
        onClick={() => setShowStyleSettings(true)}
        className="p-1.5 rounded-md text-app-muted hover:bg-navy-50 hover:text-navy-600 transition-colors"
        title="스타일 설정"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
            d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
        </svg>
      </button>

      {/* 인스펙터 */}
      <button
        onClick={() => setShowInspector(!showInspector)}
        className={`p-1.5 rounded-md transition-colors ${showInspector ? 'bg-navy-100 text-navy-600' : 'text-app-muted hover:bg-navy-50 hover:text-navy-600'}`}
        title="스타일 인스펙터"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="15" y1="3" x2="15" y2="21" />
        </svg>
      </button>

      {/* 변환 */}
      <button
        onClick={handleConvert}
        disabled={isConverting || !hasBlocks}
        className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-navy-600 text-white text-[12px] font-medium hover:bg-navy-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
      >
        {isConverting && (
          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        변환
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      </button>
    </div>
  )
}
