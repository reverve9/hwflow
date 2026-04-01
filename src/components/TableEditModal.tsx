import { useState, useCallback } from 'react'
import { useAppStore } from '@/store/useAppStore'
import type { IRBlock, IRTableCell, CellBorder, CellBorders, BorderPreset } from '@/store/types'
import { SOLID_BORDERS, DEFAULT_CELL_BORDER, NONE_CELL_BORDER } from '@/store/types'
import { Modal, ModalHeader, AlignIcon } from './Modal'

interface CellIndex { row: number; col: number }
function cellKey(c: CellIndex) { return `${c.row},${c.col}` }

interface Props { block: IRBlock }

interface MergeInfo {
  colspan: number
  rowspan: number
  merged: boolean // 다른 셀에 의해 가려진 셀
}

// 기본 색상 팔레트 (한글/오피스 기본 기준, 10열×5행)
const BG_COLORS: (string | null)[] = [
  null,      '#000000', '#1F497D', '#4F81BD', '#C0504D', '#9BBB59',
  '#F79646', '#8064A2', '#4BACC6', '#E36C09',
  '#FFFFFF', '#595959', '#C6D9F1', '#DBE5F1', '#F2DCDB', '#EBF1DE',
  '#FDE9D9', '#E5E0EC', '#DBEEF4', '#FCD5B5',
  '#F2F2F2', '#808080', '#8DB4E2', '#B9CDE5', '#E6B9B8', '#D7E4BD',
  '#FBD5B5', '#CCC1DA', '#B7DEE8', '#FAC090',
  '#D9D9D9', '#A6A6A6', '#548DD4', '#95B3D7', '#D99694', '#C2D69B',
  '#FAC08F', '#B3A2C7', '#93CDDD', '#F9A15A',
  '#BFBFBF', '#C0C0C0', '#17375E', '#376092', '#953735', '#76923C',
  '#E46C0A', '#60497A', '#31859C', '#C76E16',
]

const PRESETS: BorderPreset[] = [
  'all', 'outer', 'innerOnly', 'none',
  'topOnly', 'bottomOnly', 'leftOnly', 'rightOnly',
  'innerH', 'innerV',
]

/** 테두리 프리셋 아이콘 — 2×2 격자, 활성=실선 비활성=점선 */
function BorderIcon({ preset }: { preset: BorderPreset }) {
  const s = 36, p = 4, m = s / 2
  const flags = getFlags(preset)
  const t = flags.outerTop
  const b = flags.outerBottom
  const l = flags.outerLeft
  const r = flags.outerRight
  const ih = flags.innerH
  const iv = flags.innerV

  const isNone = preset === 'none'

  const Line = ({ x1, y1, x2, y2, active }: { x1: number; y1: number; x2: number; y2: number; active: boolean }) => {
    if (isNone) return null // "없음"은 선 자체 안 보임
    return (
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        className={active ? 'stroke-blue-500' : 'stroke-gray-300'}
        strokeWidth={active ? '1' : '0.7'}
        strokeDasharray={active ? undefined : '2,2'} />
    )
  }

  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} className="block">
      {isNone ? (
        <text x={m} y={m + 1} textAnchor="middle" dominantBaseline="middle" className="fill-gray-300" fontSize="10">∅</text>
      ) : (
        <>
          <Line x1={p} y1={p} x2={s-p} y2={p} active={t} />
          <Line x1={p} y1={s-p} x2={s-p} y2={s-p} active={b} />
          <Line x1={p} y1={p} x2={p} y2={s-p} active={l} />
          <Line x1={s-p} y1={p} x2={s-p} y2={s-p} active={r} />
          <Line x1={p} y1={m} x2={s-p} y2={m} active={ih} />
          <Line x1={m} y1={p} x2={m} y2={s-p} active={iv} />
        </>
      )}
    </svg>
  )
}

function getFlags(p: BorderPreset) {
  const f = { outerTop: false, outerBottom: false, outerLeft: false, outerRight: false, innerH: false, innerV: false }
  switch (p) {
    case 'all': return { ...f, outerTop: true, outerBottom: true, outerLeft: true, outerRight: true, innerH: true, innerV: true }
    case 'outer': return { ...f, outerTop: true, outerBottom: true, outerLeft: true, outerRight: true }
    case 'innerOnly': return { ...f, innerH: true, innerV: true }
    case 'none': return f
    case 'topOnly': return { ...f, outerTop: true }
    case 'bottomOnly': return { ...f, outerBottom: true }
    case 'leftOnly': return { ...f, outerLeft: true }
    case 'rightOnly': return { ...f, outerRight: true }
    case 'innerH': return { ...f, innerH: true }
    case 'innerV': return { ...f, innerV: true }
  }
}

export function TableEditModal({ block }: Props) {
  const { setShowBlockModal, setTableRowOverride, setTableHeaderOverride, effectiveTableRows, effectiveHasHeader } = useAppStore()

  const initRows = effectiveTableRows(block)
  const [cellTexts, setCellTexts] = useState(() => initRows.map(r => r.map(c => c.runs.map(r => r.text).join(''))))
  const [cellBolds, setCellBolds] = useState(() => initRows.map(r => r.map(c => c.runs.some(r => r.bold))))
  const [cellAligns, setCellAligns] = useState(() => initRows.map(r => r.map(c => c.align)))
  const [cellValigns, setCellValigns] = useState(() => initRows.map(r => r.map(c => c.valign)))
  const [cellBgColors, setCellBgColors] = useState(() => initRows.map(r => r.map(c => c.bgColor)))
  const [cellBorders, setCellBorders] = useState(() => initRows.map(r => r.map(c => ({ ...c.borders }))))
  const [cellMerge, setCellMerge] = useState<MergeInfo[][]>(() =>
    initRows.map(r => r.map(c => ({
      colspan: c.colspan ?? 1,
      rowspan: c.rowspan ?? 1,
      merged: c.merged ?? false,
    })))
  )
  const [hasHeader, setHasHeader] = useState(() => effectiveHasHeader(block))
  const [lineType, setLineType] = useState<CellBorder['type']>('SOLID')
  const [lineWidth, setLineWidth] = useState('0.12 mm')
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set())
  const [anchorCell, setAnchorCell] = useState<CellIndex | null>(null)
  const [editingCell, setEditingCell] = useState<CellIndex | null>(null)
  const [activePresets, setActivePresets] = useState<Set<BorderPreset>>(new Set())

  const rowCount = cellTexts.length
  const colCount = cellTexts[0]?.length ?? 0

  const close = () => setShowBlockModal(false)

  // ─── 적용 ──────────────────────────────────────────────
  const apply = () => {
    const rows: IRTableCell[][] = []
    for (let r = 0; r < rowCount; r++) {
      const row: IRTableCell[] = []
      for (let c = 0; c < colCount; c++) {
        const m = cellMerge[r][c]
        row.push({
          runs: [{ text: cellTexts[r][c], bold: cellBolds[r][c] }],
          align: cellAligns[r][c], valign: cellValigns[r][c],
          bgColor: cellBgColors[r][c], borders: cellBorders[r][c],
          colspan: m.colspan, rowspan: m.rowspan, merged: m.merged,
        })
      }
      rows.push(row)
    }
    setTableRowOverride(block.id, rows)
    setTableHeaderOverride(block.id, hasHeader)
    close()
  }

  const forEachSelected = useCallback((fn: (r: number, c: number) => void) => {
    for (const key of selectedCells) {
      const [r, c] = key.split(',').map(Number)
      if (r < rowCount && c < colCount) fn(r, c)
    }
  }, [selectedCells, rowCount, colCount])

  // ─── 셀 선택 (merged 셀 클릭 시 owner로 리다이렉트) ───
  const findOwner = (row: number, col: number): CellIndex => {
    if (!cellMerge[row][col].merged) return { row, col }
    for (let r = row; r >= 0; r--) {
      for (let c = col; c >= 0; c--) {
        const m = cellMerge[r][c]
        if (!m.merged && r + m.rowspan > row && c + m.colspan > col) return { row: r, col: c }
      }
    }
    return { row, col }
  }

  const selectCell = (row: number, col: number, shift: boolean) => {
    const owner = findOwner(row, col)
    if (shift && anchorCell) {
      const rMin = Math.min(anchorCell.row, owner.row), rMax = Math.max(anchorCell.row, owner.row)
      const cMin = Math.min(anchorCell.col, owner.col), cMax = Math.max(anchorCell.col, owner.col)
      // 병합 영역에 걸치면 확장
      const [eRMin, eRMax, eCMin, eCMax] = expandSelectionToMerge(rMin, rMax, cMin, cMax)
      const next = new Set<string>()
      for (let r = eRMin; r <= eRMax; r++) for (let c = eCMin; c <= eCMax; c++) next.add(cellKey({ row: r, col: c }))
      setSelectedCells(next)
    } else {
      // 단일 클릭: owner의 전체 span 영역 선택
      const m = cellMerge[owner.row][owner.col]
      const next = new Set<string>()
      for (let r = owner.row; r < owner.row + m.rowspan; r++)
        for (let c = owner.col; c < owner.col + m.colspan; c++)
          next.add(cellKey({ row: r, col: c }))
      setSelectedCells(next)
      setAnchorCell(owner)
    }
    setEditingCell(null)
  }

  // 선택 영역이 병합 셀에 걸치면 확장
  const expandSelectionToMerge = (rMin: number, rMax: number, cMin: number, cMax: number): [number, number, number, number] => {
    let changed = true
    let [r0, r1, c0, c1] = [rMin, rMax, cMin, cMax]
    while (changed) {
      changed = false
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const owner = findOwner(r, c)
          const m = cellMerge[owner.row][owner.col]
          if (owner.row < r0) { r0 = owner.row; changed = true }
          if (owner.row + m.rowspan - 1 > r1) { r1 = owner.row + m.rowspan - 1; changed = true }
          if (owner.col < c0) { c0 = owner.col; changed = true }
          if (owner.col + m.colspan - 1 > c1) { c1 = owner.col + m.colspan - 1; changed = true }
        }
      }
    }
    return [r0, r1, c0, c1]
  }

  const primaryCell = (() => {
    if (anchorCell && selectedCells.has(cellKey(anchorCell))) return anchorCell
    const first = [...selectedCells][0]
    if (!first) return null
    const [r, c] = first.split(',').map(Number)
    return findOwner(r, c)
  })()

  // ─── 병합 / 분할 ──────────────────────────────────────
  const getSelectionBounds = (): [number, number, number, number] | null => {
    if (selectedCells.size === 0) return null
    const cells = [...selectedCells].map(k => k.split(',').map(Number))
    return [
      Math.min(...cells.map(c => c[0])), Math.max(...cells.map(c => c[0])),
      Math.min(...cells.map(c => c[1])), Math.max(...cells.map(c => c[1])),
    ]
  }

  const canMerge = (): boolean => {
    const bounds = getSelectionBounds()
    if (!bounds) return false
    const [rMin, rMax, cMin, cMax] = bounds
    const expectedCount = (rMax - rMin + 1) * (cMax - cMin + 1)
    if (selectedCells.size !== expectedCount || expectedCount <= 1) return false
    return true
  }

  const canSplit = (): boolean => {
    if (!primaryCell) return false
    const m = cellMerge[primaryCell.row][primaryCell.col]
    return (m.colspan > 1 || m.rowspan > 1) && !m.merged
  }

  const mergeCells = () => {
    const bounds = getSelectionBounds()
    if (!bounds) return
    const [rMin, rMax, cMin, cMax] = bounds

    // 텍스트 합치기 (비어있지 않은 셀만)
    const texts: string[] = []
    for (let r = rMin; r <= rMax; r++)
      for (let c = cMin; c <= cMax; c++) {
        const t = cellTexts[r][c].trim()
        if (t) texts.push(t)
      }

    setCellTexts(p => {
      const n = p.map(r => [...r])
      n[rMin][cMin] = texts.join(' ')
      for (let r = rMin; r <= rMax; r++)
        for (let c = cMin; c <= cMax; c++)
          if (r !== rMin || c !== cMin) n[r][c] = ''
      return n
    })

    setCellMerge(p => {
      const n = p.map(r => r.map(c => ({ ...c })))
      n[rMin][cMin] = { colspan: cMax - cMin + 1, rowspan: rMax - rMin + 1, merged: false }
      for (let r = rMin; r <= rMax; r++)
        for (let c = cMin; c <= cMax; c++)
          if (r !== rMin || c !== cMin) n[r][c] = { colspan: 1, rowspan: 1, merged: true }
      return n
    })

    // anchor 셀만 선택
    const next = new Set<string>()
    for (let r = rMin; r <= rMax; r++)
      for (let c = cMin; c <= cMax; c++) next.add(cellKey({ row: r, col: c }))
    setSelectedCells(next)
    setAnchorCell({ row: rMin, col: cMin })
  }

  const splitCells = () => {
    if (!primaryCell) return
    const m = cellMerge[primaryCell.row][primaryCell.col]
    const { row: rMin, col: cMin } = primaryCell
    const rMax = rMin + m.rowspan - 1
    const cMax = cMin + m.colspan - 1

    setCellMerge(p => {
      const n = p.map(r => r.map(c => ({ ...c })))
      for (let r = rMin; r <= rMax; r++)
        for (let c = cMin; c <= cMax; c++)
          n[r][c] = { colspan: 1, rowspan: 1, merged: false }
      return n
    })

    setSelectedCells(new Set([cellKey(primaryCell)]))
  }

  // ─── 행/열 추가 ────────────────────────────────────────
  const addRow = () => {
    setCellTexts(p => [...p, Array(colCount).fill('')])
    setCellBolds(p => [...p, Array(colCount).fill(false)])
    setCellAligns(p => [...p, Array(colCount).fill('left') as IRTableCell['align'][]])
    setCellValigns(p => [...p, Array(colCount).fill('center') as IRTableCell['valign'][]])
    setCellBgColors(p => [...p, Array(colCount).fill(null)])
    setCellBorders(p => [...p, Array.from({ length: colCount }, () => ({ top: { ...DEFAULT_CELL_BORDER }, bottom: { ...DEFAULT_CELL_BORDER }, left: { ...DEFAULT_CELL_BORDER }, right: { ...DEFAULT_CELL_BORDER } }))])
    setCellMerge(p => [...p, Array.from({ length: colCount }, () => ({ colspan: 1, rowspan: 1, merged: false }))])
  }
  const addCol = () => {
    setCellTexts(p => p.map(r => [...r, '']))
    setCellBolds(p => p.map(r => [...r, false]))
    setCellAligns(p => p.map(r => [...r, 'left' as const]))
    setCellValigns(p => p.map(r => [...r, 'center' as const]))
    setCellBgColors(p => p.map(r => [...r, null]))
    setCellBorders(p => p.map(r => [...r, { top: { ...DEFAULT_CELL_BORDER }, bottom: { ...DEFAULT_CELL_BORDER }, left: { ...DEFAULT_CELL_BORDER }, right: { ...DEFAULT_CELL_BORDER } }]))
    setCellMerge(p => p.map(r => [...r, { colspan: 1, rowspan: 1, merged: false }]))
  }

  // ─── 테두리 프리셋 ────────────────────────────────────
  const togglePreset = (preset: BorderPreset) => {
    if (selectedCells.size === 0) return

    // 토글: "없음"은 전체 해제, 그 외는 개별 토글
    const next = new Set(activePresets)
    if (preset === 'none') {
      next.clear()
      next.add('none')
    } else {
      next.delete('none')
      if (next.has(preset)) next.delete(preset)
      else next.add(preset)
    }
    setActivePresets(next)

    // 활성화된 프리셋들의 flags 합산
    const merged = { outerTop: false, outerBottom: false, outerLeft: false, outerRight: false, innerH: false, innerV: false }
    for (const p of next) {
      if (p === 'none') continue
      const f = getFlags(p)
      if (f.outerTop) merged.outerTop = true
      if (f.outerBottom) merged.outerBottom = true
      if (f.outerLeft) merged.outerLeft = true
      if (f.outerRight) merged.outerRight = true
      if (f.innerH) merged.innerH = true
      if (f.innerV) merged.innerV = true
    }

    const line: CellBorder = { type: lineType, width: lineWidth }
    const cells = [...selectedCells].map(k => k.split(',').map(Number))
    const rRange: [number, number] = [Math.min(...cells.map(c => c[0])), Math.max(...cells.map(c => c[0]))]
    const cRange: [number, number] = [Math.min(...cells.map(c => c[1])), Math.max(...cells.map(c => c[1]))]

    setCellBorders(prev => {
      const n = prev.map(r => r.map(c => ({ ...c })))
      const on = { ...line }
      const off = { ...NONE_CELL_BORDER }

      for (let r = rRange[0]; r <= rRange[1]; r++) {
        for (let c = cRange[0]; c <= cRange[1]; c++) {
          const isTop = r === rRange[0], isBottom = r === rRange[1]
          const isLeft = c === cRange[0], isRight = c === cRange[1]

          // 외곽 top: 해당 프리셋이 관여하면 설정, 아니면 기존 유지
          if (merged.outerTop || next.has('none')) n[r][c].top = (isTop && merged.outerTop) ? { ...on } : (!isTop && merged.innerH) ? { ...on } : next.has('none') ? { ...off } : n[r][c].top
          if (merged.outerBottom || next.has('none')) n[r][c].bottom = (isBottom && merged.outerBottom) ? { ...on } : (!isBottom && merged.innerH) ? { ...on } : next.has('none') ? { ...off } : n[r][c].bottom
          if (merged.outerLeft || next.has('none')) n[r][c].left = (isLeft && merged.outerLeft) ? { ...on } : (!isLeft && merged.innerV) ? { ...on } : next.has('none') ? { ...off } : n[r][c].left
          if (merged.outerRight || next.has('none')) n[r][c].right = (isRight && merged.outerRight) ? { ...on } : (!isRight && merged.innerV) ? { ...on } : next.has('none') ? { ...off } : n[r][c].right

          // 내부선
          if (merged.innerH) {
            if (!isTop) n[r][c].top = { ...on }
            if (!isBottom) n[r][c].bottom = { ...on }
          }
          if (merged.innerV) {
            if (!isLeft) n[r][c].left = { ...on }
            if (!isRight) n[r][c].right = { ...on }
          }
        }
      }
      return n
    })
  }

  const bdrPx = (b: CellBorder) => {
    switch (b.width) { case '0.7 mm': return 3; case '0.4 mm': return 2; case '0.25 mm': return 1.5; default: return 1 }
  }
  const cssBorder = (b: CellBorder) => b.type === 'NONE' ? '0' : `${bdrPx(b)}px solid black`

  // ─── 렌더링 ────────────────────────────────────────────
  const cellInfoText = (() => {
    if (!primaryCell || selectedCells.size === 0) return undefined
    if (cellMerge[primaryCell.row]?.[primaryCell.col]?.merged) return undefined
    const m = cellMerge[primaryCell.row][primaryCell.col]
    if (m.colspan > 1 || m.rowspan > 1) return `병합 셀 [${primaryCell.row + 1},${primaryCell.col + 1}] ${m.rowspan}×${m.colspan}`
    if (selectedCells.size > 1) return `${selectedCells.size}개 셀 선택`
    return `셀 [${primaryCell.row + 1}, ${primaryCell.col + 1}]`
  })()

  return (
    <Modal onClose={close} width="880px" height="720px">
        <ModalHeader title="표 편집" subtitle={`${rowCount} × ${colCount}${cellInfoText ? `  —  ${cellInfoText}` : ''}`}
          onClose={close} onApply={apply} />

        {/* 툴바 */}
        <div className="flex items-center gap-2 px-5 py-2 border-b border-app-border/50 shrink-0">
          <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-navy-700">
            <input type="checkbox" checked={hasHeader} onChange={e => setHasHeader(e.target.checked)} className="accent-navy-500" />
            첫 행 헤더
          </label>
          <div className="w-px h-4 bg-app-border" />
          {canMerge() && (
            <button onClick={mergeCells} className="px-2 py-1 bg-navy-600 text-white rounded-md text-[11px] hover:bg-navy-700 transition-colors">셀 병합</button>
          )}
          {canSplit() && (
            <button onClick={splitCells} className="px-2 py-1 bg-orange-500 text-white rounded-md text-[11px] hover:bg-orange-600 transition-colors">셀 분할</button>
          )}
          <div className="w-px h-4 bg-app-border" />
          <button onClick={addRow} className="px-2 py-1 border border-app-border rounded-md text-[11px] text-navy-600 hover:bg-white transition-colors">+ 행</button>
          <button onClick={addCol} className="px-2 py-1 border border-app-border rounded-md text-[11px] text-navy-600 hover:bg-white transition-colors">+ 열</button>
          <div className="flex-1" />
          {selectedCells.size > 0 && (
            <button onClick={() => { setSelectedCells(new Set()); setAnchorCell(null); setEditingCell(null) }}
              className="text-[11px] text-app-muted hover:text-navy-600 transition-colors">선택 해제</button>
          )}
        </div>

        {/* 본문 */}
        <div className="flex flex-1 min-h-0">
          {/* 표 그리드 */}
          <div className="flex-1 overflow-auto p-4" onClick={() => { setSelectedCells(new Set()); setEditingCell(null) }}>
            <div className="bg-white rounded-lg border border-app-border p-3">
              <table className="border-collapse w-full table-fixed select-none" onClick={e => e.stopPropagation()}>
                <tbody>
                  {Array.from({ length: rowCount }, (_, r) => (
                    <tr key={r}>
                      <td className="text-[10px] text-app-muted pr-2 align-middle select-none w-6">{r + 1}</td>
                      {Array.from({ length: colCount }, (_, c) => {
                        const merge = cellMerge[r][c]
                        if (merge.merged) return null

                        const isHeader = hasHeader && r === 0
                        const isEditing = editingCell?.row === r && editingCell?.col === c
                        const isSelected = selectedCells.has(cellKey({ row: r, col: c }))
                        const bold = cellBolds[r][c] || isHeader
                        const bg = cellBgColors[r][c] ?? (isHeader ? '#e5e7eb' : '#ffffff')
                        const borders = cellBorders[r][c]
                        const isMerged = merge.colspan > 1 || merge.rowspan > 1

                        return (
                          <td
                            key={c}
                            colSpan={merge.colspan > 1 ? merge.colspan : undefined}
                            rowSpan={merge.rowspan > 1 ? merge.rowspan : undefined}
                            className={`relative p-0 ${isSelected ? 'ring-2 ring-navy-400 ring-inset z-10' : ''}`}
                            style={{
                              backgroundColor: bg,
                              borderTop: cssBorder(borders.top),
                              borderBottom: cssBorder(borders.bottom),
                              borderLeft: cssBorder(borders.left),
                              borderRight: cssBorder(borders.right),
                            }}
                            onClick={e => { e.stopPropagation(); selectCell(r, c, e.shiftKey) }}
                            onDoubleClick={e => { e.stopPropagation(); selectCell(r, c, false); setEditingCell({ row: r, col: c }) }}
                          >

                            {/* 병합 표시 */}
                            {isMerged && (
                              <div className="absolute top-0.5 right-1 text-[8px] text-navy-400 select-none">
                                {merge.rowspan}×{merge.colspan}
                              </div>
                            )}

                            {isEditing ? (
                              <textarea
                                autoFocus
                                value={cellTexts[r][c]}
                                onChange={e => setCellTexts(p => { const n = p.map(r => [...r]); n[r][c] = e.target.value; return n })}
                                onKeyDown={e => { if (e.key === 'Escape') setEditingCell(null) }}
                                rows={Math.max(cellTexts[r][c].split('\n').length, 2)}
                                className={`w-full px-1.5 py-1 text-[11px] outline-none bg-transparent resize-none ${bold ? 'font-bold' : ''}`}
                                style={{ textAlign: cellAligns[r][c] }}
                              />
                            ) : (
                              <div className={`px-1.5 py-1 text-[11px] min-h-[28px] whitespace-pre-wrap ${bold ? 'font-bold' : ''}`}
                                style={{ textAlign: cellAligns[r][c] }}>
                                {cellTexts[r][c] || '\u00A0'}
                              </div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 인스펙터 패널 */}
          <div className="w-[220px] shrink-0 overflow-y-auto border-l border-app-border p-3 space-y-3">
            {/* 선 설정 */}
            <div>
              <div className="text-[10px] font-semibold text-app-muted uppercase tracking-wider mb-2">선</div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <div className="text-[10px] text-app-muted mb-1">종류</div>
                  <select value={lineType} onChange={e => setLineType(e.target.value as CellBorder['type'])}
                    className="w-full bg-white border border-app-border rounded-md px-1.5 py-1 text-[11px] text-navy-800 outline-none">
                    <option value="SOLID">실선</option><option value="DASHED">점선</option><option value="NONE">없음</option>
                  </select>
                </div>
                <div className="flex-1">
                  <div className="text-[10px] text-app-muted mb-1">굵기</div>
                  <select value={lineWidth} onChange={e => setLineWidth(e.target.value)}
                    className="w-full bg-white border border-app-border rounded-md px-1.5 py-1 text-[11px] text-navy-800 outline-none">
                    <option value="0.12 mm">0.12</option><option value="0.25 mm">0.25</option>
                    <option value="0.4 mm">0.4</option><option value="0.7 mm">0.7</option>
                  </select>
                </div>
              </div>
            </div>

            <hr className="border-app-border/50" />

            {/* 테두리 프리셋 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] font-semibold text-app-muted uppercase tracking-wider">테두리</div>
                {selectedCells.size > 0
                  ? <span className="text-[10px] text-app-muted">선택 영역</span>
                  : <span className="text-[10px] text-orange-400">셀을 선택하세요</span>
                }
              </div>
              <div className="grid grid-cols-5 gap-1">
                {PRESETS.map(p => (
                  <button key={p} onClick={() => togglePreset(p)}
                    disabled={selectedCells.size === 0}
                    className={`flex items-center justify-center border rounded-md transition-colors p-0.5 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 ${
                      activePresets.has(p) && selectedCells.size > 0
                        ? 'bg-navy-100 border-navy-400 shadow-inner'
                        : 'bg-white border-app-border hover:bg-navy-50'
                    }`}>
                    <BorderIcon preset={p} />
                  </button>
                ))}
              </div>
            </div>

            <hr className="border-app-border/50" />

            {/* 배경색 */}
            <div>
              <div className="text-[10px] font-semibold text-app-muted uppercase tracking-wider mb-2">배경</div>
              {primaryCell ? (
                <div>
                  <div className="grid grid-cols-10 gap-0.5">
                    {BG_COLORS.map((c, i) => {
                      const isSel = primaryCell && cellBgColors[primaryCell.row]?.[primaryCell.col] === c
                      return (
                        <button key={i}
                          onClick={() => forEachSelected((r, cc) => setCellBgColors(p => { const n = p.map(r => [...r]); n[r][cc] = c; return n }))}
                          className={`w-[18px] h-[18px] rounded-sm border transition-shadow ${isSel ? 'ring-1.5 ring-navy-400 ring-offset-1' : 'border-gray-200 hover:border-gray-400'}`}
                          style={{ backgroundColor: c ?? '#fff' }}
                          title={c ?? '색 없음'}
                        >
                          {c === null && <span className="text-red-400 text-[8px]">∅</span>}
                        </button>
                      )
                    })}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <input type="color"
                      value={cellBgColors[primaryCell.row]?.[primaryCell.col] ?? '#ffffff'}
                      onChange={e => forEachSelected((r, cc) => setCellBgColors(p => { const n = p.map(r => [...r]); n[r][cc] = e.target.value; return n }))}
                      className="w-5 h-5 rounded-sm border border-gray-200 cursor-pointer p-0"
                    />
                    <span className="text-[10px] text-app-muted">다른 색</span>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-app-muted">셀을 선택하세요</p>
              )}
            </div>

            {/* 셀 속성 */}
            {primaryCell && primaryCell.row < rowCount && primaryCell.col < colCount && !cellMerge[primaryCell.row][primaryCell.col].merged && (
              <>
                <hr className="border-app-border/50" />
                <div>
                  <div className="text-[10px] font-semibold text-app-muted uppercase tracking-wider mb-2">셀 속성</div>
                  <label className="flex items-center gap-1.5 mb-2.5 cursor-pointer">
                    <input type="checkbox" checked={cellBolds[primaryCell.row][primaryCell.col]}
                      onChange={e => forEachSelected((r, c) => setCellBolds(p => { const n = p.map(r => [...r]); n[r][c] = e.target.checked; return n }))}
                      className="accent-navy-500" />
                    <span className="text-[11px] text-navy-700">볼드</span>
                  </label>
                  <div className="mb-2.5">
                    <div className="text-[10px] text-app-muted mb-1">가로 정렬</div>
                    <div className="flex border border-app-border rounded-md overflow-hidden">
                      {(['left', 'center', 'right', 'justify'] as const).map(a => (
                        <button key={a}
                          onClick={() => forEachSelected((r, c) => setCellAligns(p => { const n = p.map(r => [...r]); n[r][c] = a; return n }))}
                          className={`flex-1 py-1 text-[10px] transition-colors ${cellAligns[primaryCell!.row][primaryCell!.col] === a ? 'bg-navy-600 text-white' : 'bg-white text-navy-600 hover:bg-navy-50'}`}>
                          {a === 'left' ? '←' : a === 'center' ? '↔' : a === 'right' ? '→' : '⇔'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-app-muted mb-1">세로 정렬</div>
                    <div className="flex border border-app-border rounded-md overflow-hidden">
                      {(['top', 'center', 'bottom'] as const).map(a => (
                        <button key={a}
                          onClick={() => forEachSelected((r, c) => setCellValigns(p => { const n = p.map(r => [...r]); n[r][c] = a; return n }))}
                          className={`flex-1 py-1 text-[10px] transition-colors ${cellValigns[primaryCell!.row][primaryCell!.col] === a ? 'bg-navy-600 text-white' : 'bg-white text-navy-600 hover:bg-navy-50'}`}>
                          {a === 'top' ? '↑' : a === 'center' ? '↕' : '↓'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
    </Modal>
  )
}
