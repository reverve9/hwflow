import { useCallback, useRef, useEffect } from 'react'
import { useAppStore } from '@/store/useAppStore'
import type { IRBlock } from '@/store/types'

const TYPE_CONFIG: Record<string, { label: string; color: string; font: string; weight: string; indent: number }> = {
  heading1: { label: 'H1', color: 'bg-navy-100 text-navy-700', font: 'text-lg', weight: 'font-bold', indent: 0 },
  heading2: { label: 'H2', color: 'bg-indigo-100 text-indigo-700', font: 'text-base', weight: 'font-bold', indent: 1 },
  heading3: { label: 'H3', color: 'bg-purple-100 text-purple-700', font: 'text-sm', weight: 'font-bold', indent: 2 },
  heading4: { label: 'H4', color: 'bg-pink-100 text-pink-700', font: 'text-sm', weight: 'font-normal', indent: 3 },
  body: { label: '본문', color: 'bg-navy-50 text-navy-500', font: 'text-sm', weight: 'font-normal', indent: 1 },
  table: { label: '표', color: 'bg-orange-100 text-orange-700', font: 'text-sm', weight: 'font-normal', indent: 0 },
  image: { label: '이미지', color: 'bg-teal-100 text-teal-700', font: 'text-sm', weight: 'font-normal', indent: 0 },
}

function getConfig(type: string) {
  return TYPE_CONFIG[type] ?? { label: type, color: 'bg-navy-50 text-navy-500', font: 'text-sm', weight: 'font-normal', indent: 0 }
}

export function BlockList() {
  const {
    irBlocks, selectedBlockIDs, effectiveType, effectiveText,
    blockOverrides, blockTextOverrides,
    selectBlock, setShowBlockModal, setShowInspector,
    moveBlockUp, moveBlockDown, deleteBlock, deleteSelectedBlocks, addBlock,
    selectedBlock: getSelectedBlock, availableStyleKeys, displayName,
    setBlockTypeOverride, setTypeForSelectedBlocks,
  } = useAppStore()

  const scrollRef = useRef<HTMLDivElement>(null)
  const anchorBlockID = useAppStore(s => s.anchorBlockID)

  // 선택 블록 스크롤
  useEffect(() => {
    if (!anchorBlockID || !scrollRef.current) return
    const el = scrollRef.current.querySelector(`[data-block-id="${anchorBlockID}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [anchorBlockID])

  const handleClick = useCallback((e: React.MouseEvent, block: IRBlock) => {
    selectBlock(block.id, { command: e.metaKey || e.ctrlKey, shift: e.shiftKey })
    if (!e.metaKey && !e.ctrlKey && !e.shiftKey) setShowInspector(true)
  }, [selectBlock, setShowInspector])

  const handleDoubleClick = useCallback((block: IRBlock) => {
    selectBlock(block.id)
    setShowBlockModal(true)
  }, [selectBlock, setShowBlockModal])

  const selected = getSelectedBlock()

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        <div className="space-y-0.5">
          {irBlocks.map(block => {
            const eType = effectiveType(block)
            const eText = effectiveText(block)
            const config = getConfig(eType)
            const isSelected = selectedBlockIDs.has(block.id)
            const hasOverride = !!blockOverrides[block.id] || !!blockTextOverrides[block.id]

            return (
              <div
                key={block.id}
                data-block-id={block.id}
                onClick={e => handleClick(e, block)}
                onDoubleClick={() => handleDoubleClick(block)}
                onContextMenu={e => {
                  e.preventDefault()
                  selectBlock(block.id)
                }}
                className={`flex items-start gap-2 py-1.5 px-2 rounded-md cursor-pointer transition-colors
                  ${isSelected ? 'bg-navy-50 ring-1 ring-navy-200' : 'hover:bg-navy-50/50'}`}
                style={{ paddingLeft: `${config.indent * 16 + 8}px` }}
              >
                <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded ${config.color} mt-0.5`}>
                  {config.label}
                </span>
                <span className={`flex-1 ${config.font} ${config.weight} text-navy-800 line-clamp-3`}>
                  {eText || '\u00A0'}
                </span>
                {hasOverride && (
                  <svg className="w-3.5 h-3.5 text-orange-400 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M21.731 2.269a2.625 2.625 0 00-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 000-3.712zM19.513 8.199l-3.712-3.712-12.15 12.15a5.25 5.25 0 00-1.32 2.214l-.8 2.685a.75.75 0 00.933.933l2.685-.8a5.25 5.25 0 002.214-1.32L19.513 8.2z" />
                  </svg>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 하단 조작 바 */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-app-subtle border-t border-app-border text-sm shrink-0">
        <button
          onClick={() => addBlock(selected?.id)}
          className="p-1 rounded hover:bg-navy-100 text-app-muted"
          title="블록 추가"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <button
          onClick={() => { if (selectedBlockIDs.size > 1) deleteSelectedBlocks(); else if (selected) deleteBlock(selected.id) }}
          disabled={selectedBlockIDs.size === 0}
          className="p-1 rounded hover:bg-navy-100 text-app-muted disabled:opacity-30"
          title="블록 삭제"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4" />
          </svg>
        </button>

        <div className="w-px h-4 bg-app-border" />

        <button
          onClick={() => { if (selected) moveBlockUp(selected.id) }}
          disabled={selectedBlockIDs.size !== 1}
          className="p-1 rounded hover:bg-navy-100 text-app-muted disabled:opacity-30"
          title="위로 이동"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
          </svg>
        </button>
        <button
          onClick={() => { if (selected) moveBlockDown(selected.id) }}
          disabled={selectedBlockIDs.size !== 1}
          className="p-1 rounded hover:bg-navy-100 text-app-muted disabled:opacity-30"
          title="아래로 이동"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <div className="flex-1" />

        {selectedBlockIDs.size > 1 && (
          <span className="text-xs text-navy-500">{selectedBlockIDs.size}개 선택</span>
        )}
        <span className="text-xs text-app-muted">{irBlocks.length}개 블록</span>
      </div>
    </div>
  )
}
