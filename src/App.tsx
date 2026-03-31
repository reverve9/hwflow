import { useState } from 'react'
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
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'

export default function App() {
  const {
    inputMode, irBlocks, showInspector, showSplitPreview,
    showBlockModal, showStyleSettings,
    selectedBlock,
  } = useAppStore()

  const [showPreviewWindow, setShowPreviewWindow] = useState(false)
  useKeyboardShortcuts()

  const block = selectedBlock()
  const hasBlocks = irBlocks.length > 0

  return (
    <div className="flex flex-col h-screen bg-app-bg">
      <Toolbar onOpenPreviewWindow={() => setShowPreviewWindow(true)} />

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

      {/* 새 창 미리보기 */}
      {showPreviewWindow && hasBlocks && (
        <PreviewWindow onClose={() => setShowPreviewWindow(false)} />
      )}
    </div>
  )
}
