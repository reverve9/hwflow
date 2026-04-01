import { useMemo, useState, useRef, useEffect } from 'react'
import { useAppStore } from '@/store/useAppStore'
import type { IRBlock, IRTableCell, ParagraphStyleData } from '@/store/types'

// A4 96dpi (CSS 기준)
const PAGE_W = 794   // 210mm × 3.78
const PAGE_H = 1123  // 297mm × 3.78
const MM_TO_PX = 3.78  // 96dpi: 96/25.4
const PT_TO_PX = 1.333 // 96/72
const HWPUNIT_PER_MM = 283.46
const HWPUNIT_TO_PX = MM_TO_PX / HWPUNIT_PER_MM

export function DocumentPreview() {
  const {
    irBlocks, selectedBlockIDs, effectiveType, effectiveText,
    effectiveTableRows, effectiveHasHeader,
    blockOverrides, getPresetData, presetVersion,
  } = useAppStore()

  const [showOriginal, setShowOriginal] = useState(false)
  const hasOriginalStyle = irBlocks.some(b => b.originalStyle)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const anchorBlockID = useAppStore(s => s.anchorBlockID)

  // 블록 선택 시 미리보기 스크롤 동기화
  useEffect(() => {
    if (!anchorBlockID || !scrollContainerRef.current) return
    const el = scrollContainerRef.current.querySelector(`[data-preview-block="${anchorBlockID}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [anchorBlockID])

  const preset = getPresetData()
  const marginTop = (preset?.page.margin.top_mm ?? 20) * MM_TO_PX
  const marginBottom = (preset?.page.margin.bottom_mm ?? 15) * MM_TO_PX
  const marginLeft = (preset?.page.margin.left_mm ?? 15) * MM_TO_PX
  const marginRight = (preset?.page.margin.right_mm ?? 15) * MM_TO_PX
  const tableHeadColor = preset?.colors?.table_head ?? '#D8D8D8'

  const resolveStyle = (block: IRBlock, eType: string): ParagraphStyleData => {
    // 원본 모드: originalStyle이 있으면 그것으로 렌더링
    if (showOriginal && block.originalStyle) {
      const os = block.originalStyle
      return {
        font: os.font ?? 'HCR Batang',
        size_pt: os.size_pt ?? 10,
        bold: os.bold ?? false,
        align: (os.align as ParagraphStyleData['align']) ?? 'justify',
        indent_left_hwpunit: os.indent_left_hwpunit ?? 0,
        space_before_hwpunit: os.space_before_hwpunit ?? 0,
        space_after_hwpunit: os.space_after_hwpunit ?? 0,
        line_height_percent: os.line_height_percent ?? 160,
      }
    }
    if (blockOverrides[block.id]) return blockOverrides[block.id].style
    const base = preset?.paragraph_styles[eType] ?? {
      font: 'HCR Batang', size_pt: 10, bold: false, align: 'justify',
      indent_left_hwpunit: 0, space_before_hwpunit: 0, space_after_hwpunit: 0,
      line_height_percent: 160,
    }
    return {
      ...base,
      ...(block.align && { align: block.align }),
      ...(block.indent_left_hwpunit && { indent_left_hwpunit: block.indent_left_hwpunit }),
      ...(block.space_before_hwpunit && { space_before_hwpunit: block.space_before_hwpunit }),
      ...(block.space_after_hwpunit && { space_after_hwpunit: block.space_after_hwpunit }),
    }
  }

  const estimateHeight = (block: IRBlock, eType: string): number => {
    if (block.type === 'image' || eType === 'image') return 100
    if (block.isTable) {
      const rows = effectiveTableRows(block)
      // 각 행의 최대 셀 텍스트 줄 수로 높이 추정
      let totalH = 8
      for (const row of rows) {
        let maxLines = 1
        for (const cell of row) {
          if (cell.merged) continue
          const text = cell.runs.map(r => r.text).join('')
          const lines = Math.max(text.split('\n').length, Math.ceil(text.length / 20) || 1)
          if (lines > maxLines) maxLines = lines
        }
        totalH += maxLines * 20 + 8
      }
      return totalH
    }
    const style = resolveStyle(block, eType)
    const fontSizePx = style.size_pt * PT_TO_PX
    const lineH = (style.line_height_percent / 100) * fontSizePx
    const textLen = (effectiveText(block) || '').length
    const indentPx = style.indent_left_hwpunit * HWPUNIT_TO_PX
    const contentW = PAGE_W - marginLeft - marginRight - indentPx
    const charsPerLine = Math.max(contentW / (fontSizePx * 0.6), 1)
    const lines = Math.max(Math.ceil(textLen / charsPerLine), 1)
    const spaceBefore = style.space_before_hwpunit * HWPUNIT_TO_PX
    const spaceAfter = style.space_after_hwpunit * HWPUNIT_TO_PX
    return lines * lineH + spaceBefore + spaceAfter
  }

  // 페이지 분할
  const pages = useMemo(() => {
    const contentH = PAGE_H - marginTop - marginBottom
    const result: IRBlock[][] = []
    let page: IRBlock[] = []
    let used = 0

    for (const block of irBlocks) {
      const eType = effectiveType(block)
      // 페이지 나누기: 현재 페이지를 끊고 새 페이지 시작
      if (eType === 'pagebreak') {
        if (page.length > 0) result.push(page)
        page = []
        used = 0
        continue
      }
      const h = estimateHeight(block, eType)
      if (used + h > contentH && page.length > 0) {
        result.push(page)
        page = [block]
        used = h
      } else {
        page.push(block)
        used += h
      }
    }
    if (page.length > 0) result.push(page)
    if (result.length === 0) result.push([])
    return result
  }, [irBlocks, marginTop, marginBottom, presetVersion])

  const borderLW = (b: { width: string }) => {
    switch (b.width) { case '0.7 mm': return 2; case '0.4 mm': return 1.5; case '0.25 mm': return 1; default: return 0.5 }
  }
  const cssBdr = (b: { type: string; width: string }) => b.type === 'NONE' ? '0' : `${borderLW(b)}px solid black`

  const renderParagraph = (block: IRBlock, eType: string) => {
    const style = resolveStyle(block, eType)
    const indentPx = style.indent_left_hwpunit * HWPUNIT_TO_PX
    const spaceBeforePx = style.space_before_hwpunit * HWPUNIT_TO_PX
    const spaceAfterPx = style.space_after_hwpunit * HWPUNIT_TO_PX
    const lineSpacing = (style.line_height_percent - 100) / 100 * style.size_pt

    const text = useAppStore.getState().blockTextOverrides[block.id] ?? null

    return (
      <div
        style={{
          paddingLeft: marginLeft + indentPx,
          paddingRight: marginRight,
          paddingTop: spaceBeforePx,
          paddingBottom: spaceAfterPx,
          fontSize: style.size_pt * PT_TO_PX,
          fontWeight: style.bold ? 'bold' : 'normal',
          lineHeight: style.line_height_percent / 100,
          textAlign: style.align === 'justify' ? 'justify' : style.align,
          fontFamily: style.font + ', serif',
        }}
      >
        {text !== null ? (
          <span>{text || '\u00A0'}</span>
        ) : block.runs.length > 0 ? (
          block.runs.every(r => !r.text) ? <span>{'\u00A0'}</span> :
          block.runs.map((run, i) => (
            <span key={i} style={{ fontWeight: (run.bold || style.bold) ? 'bold' : 'normal' }}>
              {run.text}
            </span>
          ))
        ) : (
          <span>{block.text || '\u00A0'}</span>
        )}
      </div>
    )
  }

  const renderImagePlaceholder = (block: IRBlock) => {
    const altText = block.text || '이미지'
    return (
      <div
        style={{ paddingLeft: marginLeft, paddingRight: marginRight, paddingTop: 8, paddingBottom: 8 }}
      >
        <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded bg-gray-50 py-8">
          <svg className="w-8 h-8 text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
          </svg>
          <span className="text-xs text-gray-400">{altText}</span>
        </div>
      </div>
    )
  }

  const renderTable = (block: IRBlock) => {
    const rows = effectiveTableRows(block)
    const hasH = effectiveHasHeader(block)
    const colCount = Math.max(...rows.map(r => r.length), 1)
    const headerStyle = preset?.paragraph_styles.table_header
    const bodyStyle = preset?.paragraph_styles.table_body

    return (
      <div style={{ paddingLeft: marginLeft, paddingRight: marginRight, paddingTop: 4, paddingBottom: 4 }}>
        <table className="w-full border-collapse">
          <tbody>
            {rows.map((row, rIdx) => {
              const isHeader = hasH && rIdx === 0
              const style = isHeader ? headerStyle : bodyStyle
              return (
                <tr key={rIdx}>
                  {Array.from({ length: colCount }, (_, cIdx) => {
                    const cell = row[cIdx] ?? { runs: [], align: 'left', valign: 'center', bgColor: null, borders: { top: { type: 'SOLID', width: '0.12 mm' }, bottom: { type: 'SOLID', width: '0.12 mm' }, left: { type: 'SOLID', width: '0.12 mm' }, right: { type: 'SOLID', width: '0.12 mm' } } }
                    if (cell.merged) return null
                    const cs = cell.colspan ?? 1
                    const rs = cell.rowspan ?? 1
                    const bg = cell.bgColor ?? (isHeader ? tableHeadColor : undefined)
                    return (
                      <td key={cIdx} className="p-0"
                        colSpan={cs > 1 ? cs : undefined} rowSpan={rs > 1 ? rs : undefined}
                        style={{
                          backgroundColor: bg,
                          borderTop: cssBdr(cell.borders.top),
                          borderBottom: cssBdr(cell.borders.bottom),
                          borderLeft: cssBdr(cell.borders.left),
                          borderRight: cssBdr(cell.borders.right),
                        }}>
                        <div className="px-1 py-0.5" style={{
                          fontSize: (style?.size_pt ?? 10) * PT_TO_PX,
                          fontWeight: (cell.runs.some(r => r.bold) || style?.bold) ? 'bold' : 'normal',
                          textAlign: cell.align,
                          fontFamily: (style?.font ?? 'HCR Batang') + ', serif',
                        }}>
                          {cell.runs.map((r, i) => {
                            if (r.text === '\n') return <br key={i} />
                            const parts = r.text.split('\n')
                            return parts.map((part, pi) => (
                              <span key={`${i}-${pi}`}>
                                {pi > 0 && <br />}
                                <span style={{ fontWeight: r.bold ? 'bold' : undefined }}>{part}</span>
                              </span>
                            ))
                          })}
                          {cell.runs.length === 0 && '\u00A0'}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div ref={scrollContainerRef} className="h-full overflow-auto bg-[#eeeeee] p-6 relative">
      {hasOriginalStyle && (
        <div className="sticky top-0 z-10 flex justify-end pr-2 pb-2 pointer-events-none">
          <div className="inline-flex rounded-md border border-app-border text-[11px] overflow-hidden shadow-md pointer-events-auto bg-white/90 backdrop-blur-sm">
            <button onClick={() => setShowOriginal(false)}
              className={`px-3 py-1 transition-colors ${!showOriginal ? 'bg-navy-600 text-white' : 'text-navy-700 hover:bg-navy-50'}`}>
              적용
            </button>
            <button onClick={() => setShowOriginal(true)}
              className={`px-3 py-1 border-l border-app-border transition-colors ${showOriginal ? 'bg-navy-600 text-white' : 'text-navy-700 hover:bg-navy-50'}`}>
              원본
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-col items-center gap-4">
        {pages.map((pageBlocks, pageIdx) => (
          <div key={pageIdx}>
            <div
              className="bg-white shadow-md relative"
              style={{ width: PAGE_W, minHeight: PAGE_H, paddingTop: marginTop, paddingBottom: marginBottom }}
            >
              {/* 여백 꺾음 표시 */}
              <MarginCorners top={marginTop} bottom={marginBottom} left={marginLeft} right={marginRight} />
              {pageBlocks.map(block => {
                const eType = effectiveType(block)
                const isSelected = selectedBlockIDs.has(block.id)
                return (
                  <div key={block.id} data-preview-block={block.id} className={`relative ${isSelected ? 'bg-navy-100/40 rounded-sm' : ''}`}>
                    {isSelected && <div className="absolute left-0 top-0 bottom-0 w-[2.5px] rounded-r bg-navy-500" />}
                    {block.type === 'image' || eType === 'image'
                      ? renderImagePlaceholder(block)
                      : block.isTable
                        ? renderTable(block)
                        : renderParagraph(block, eType)}
                  </div>
                )
              })}
            </div>
            <p className="text-center text-xs text-app-muted mt-1">{pageIdx + 1}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

/** 한글 스타일 여백 꺾음 표시 (4 모서리, 바깥쪽으로 꺾임) */
function MarginCorners({ top, bottom, left, right }: { top: number; bottom: number; left: number; right: number }) {
  const L = 16
  const color = '#c0c0c0'
  const abs = { position: 'absolute' as const, pointerEvents: 'none' as const }

  return (
    <>
      {/* 좌상: ┘ 모양 (왼쪽+위쪽으로 꺾임) */}
      <div style={{ ...abs, top, left }}>
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: L, height: 1, backgroundColor: color }} />
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 1, height: L, backgroundColor: color }} />
      </div>
      {/* 우상: └ 모양 (오른쪽+위쪽으로 꺾임) */}
      <div style={{ ...abs, top, right }}>
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: L, height: 1, backgroundColor: color }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: 1, height: L, backgroundColor: color }} />
      </div>
      {/* 좌하: ┐ 모양 (왼쪽+아래쪽으로 꺾임) */}
      <div style={{ ...abs, bottom, left }}>
        <div style={{ position: 'absolute', top: 0, right: 0, width: L, height: 1, backgroundColor: color }} />
        <div style={{ position: 'absolute', top: 0, right: 0, width: 1, height: L, backgroundColor: color }} />
      </div>
      {/* 우하: ┌ 모양 (오른쪽+아래쪽으로 꺾임) */}
      <div style={{ ...abs, bottom, right }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: L, height: 1, backgroundColor: color }} />
        <div style={{ position: 'absolute', top: 0, left: 0, width: 1, height: L, backgroundColor: color }} />
      </div>
    </>
  )
}
