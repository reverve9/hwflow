import { useState, useCallback } from 'react'
import { useAppStore } from '@/store/useAppStore'
import type { IRBlock, IRTableCell, CellBorder, CellBorders, BorderPreset } from '@/store/types'
import { SOLID_BORDERS, DEFAULT_CELL_BORDER, NONE_CELL_BORDER } from '@/store/types'
import { Modal, ModalHeader } from './Modal'

interface CellIndex { row: number; col: number }
function cellKey(c: CellIndex) { return `${c.row},${c.col}` }

interface Props { block: IRBlock }

interface MergeInfo {
  colspan: number
  rowspan: number
  merged: boolean // 다른 셀에 의해 가려진 셀
}

const BG_COLORS: (string | null)[] = [
  null, '#D8D8D8', '#E8F5E9', '#FFF3E0', '#E3F2FD', '#FCE4EC',
  '#F3E5F5', '#FFF9C4', '#ECEFF1', '#F5F5F5', '#FFFFFF',
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
  const t = flags.outerTop || flags.allTop
  const b = flags.outerBottom || flags.allBottom
  const l = flags.outerLeft || flags.allLeft
  const r = flags.outerRight || flags.allRight
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
  const f = { outerTop: false, outerBottom: false, outerLeft: false, outerRight: false, innerH: false, innerV: false, allTop: false, allBottom: false, allLeft: false, allRight: false }
  switch (p) {
    case 'all': return { ...f, outerTop: true, outerBottom: true, outerLeft: true, outerRight: true, innerH: true, innerV: true }
    case 'outer': return { ...f, outerTop: true, outerBottom: true, outerLeft: true, outerRight: true }
    case 'innerOnly': return { ...f, innerH: true, innerV: true }
    case 'none': return f
    case 'topOnly': return { ...f, allTop: true }
    case 'bottomOnly': return { ...f, allBottom: true }
    case 'leftOnly': return { ...f, allLeft: true }
    case 'rightOnly': return { ...f, allRight: true }
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
  const applyPreset = (preset: BorderPreset) => {
    const f = getFlags(preset)
    const line: CellBorder = { type: lineType, width: lineWidth }
    const outer = line

    if (selectedCells.size === 0) return
    const cells = [...selectedCells].map(k => k.split(',').map(Number))
    const rRange: [number, number] = [Math.min(...cells.map(c => c[0])), Math.max(...cells.map(c => c[0]))]
    const cRange: [number, number] = [Math.min(...cells.map(c => c[1])), Math.max(...cells.map(c => c[1]))]

    setCellBorders(prev => {
      const next = prev.map(r => r.map(c => ({ ...c })))
      const on = { ...line }
      const off = { ...NONE_CELL_BORDER }

      // 외곽선
      for (let c = cRange[0]; c <= cRange[1]; c++) next[rRange[0]][c].top = f.outerTop ? { ...on } : { ...off }
      for (let c = cRange[0]; c <= cRange[1]; c++) next[rRange[1]][c].bottom = f.outerBottom ? { ...on } : { ...off }
      for (let r = rRange[0]; r <= rRange[1]; r++) next[r][cRange[0]].left = f.outerLeft ? { ...on } : { ...off }
      for (let r = rRange[0]; r <= rRange[1]; r++) next[r][cRange[1]].right = f.outerRight ? { ...on } : { ...off }

      // 개별 방향: 모든 셀의 해당 변
      if (f.allTop) for (let r = rRange[0]; r <= rRange[1]; r++) for (let c = cRange[0]; c <= cRange[1]; c++) next[r][c].top = { ...on }
      if (f.allBottom) for (let r = rRange[0]; r <= rRange[1]; r++) for (let c = cRange[0]; c <= cRange[1]; c++) next[r][c].bottom = { ...on }
      if (f.allLeft) for (let r = rRange[0]; r <= rRange[1]; r++) for (let c = cRange[0]; c <= cRange[1]; c++) next[r][c].left = { ...on }
      if (f.allRight) for (let r = rRange[0]; r <= rRange[1]; r++) for (let c = cRange[0]; c <= cRange[1]; c++) next[r][c].right = { ...on }

      // 내부선: 한쪽만 적용 (bottom/right만, 겹침 방지)
      if (rRange[1] > rRange[0]) {
        for (let r = rRange[0]; r < rRange[1]; r++)
          for (let c = cRange[0]; c <= cRange[1]; c++)
            next[r][c].bottom = f.innerH ? { ...on } : { ...off }
      }
      if (cRange[1] > cRange[0]) {
        for (let c = cRange[0]; c < cRange[1]; c++)
          for (let r = rRange[0]; r <= rRange[1]; r++)
            next[r][c].right = f.innerV ? { ...on } : { ...off }
      }
      return next
    })
  }

  const bdrW = (b: CellBorder) => {
    switch (b.width) { case '0.7 mm': return 3; case '0.4 mm': return 2; case '0.25 mm': return 1.5; default: return 1 }
  }

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
              <table className="border-collapse w-full table-fixed" onClick={e => e.stopPropagation()}>
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
                            style={{ backgroundColor: bg }}
                            onClick={e => { e.stopPropagation(); selectCell(r, c, e.shiftKey) }}
                            onDoubleClick={e => { e.stopPropagation(); selectCell(r, c, false); setEditingCell({ row: r, col: c }) }}
                          >
                            {r === 0 && borders.top.type !== 'NONE' && <div className="absolute top-0 left-0 right-0 bg-black/60" style={{ height: bdrW(borders.top) }} />}
                            {borders.bottom.type !== 'NONE' && <div className="absolute bottom-0 left-0 right-0 bg-black/60" style={{ height: bdrW(borders.bottom) }} />}
                            {c === 0 && borders.left.type !== 'NONE' && <div className="absolute top-0 left-0 bottom-0 bg-black/60" style={{ width: bdrW(borders.left) }} />}
                            {borders.right.type !== 'NONE' && <div className="absolute top-0 right-0 bottom-0 bg-black/60" style={{ width: bdrW(borders.right) }} />}

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
                  <button key={p} onClick={() => applyPreset(p)}
                    disabled={selectedCells.size === 0}
                    className="flex items-center justify-center bg-white border border-app-border rounded-md hover:bg-navy-50 transition-colors p-0.5 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white">
                    <BorderIcon preset={p} />
                  </button>
                ))}
              </div>
            </div>

            <hr className="border-app-border/50" />

            {/* 배경 */}
            <div>
              <div className="text-[10px] font-semibold text-app-muted uppercase tracking-wider mb-2">배경</div>
              {primaryCell ? (
                <div className="grid grid-cols-6 gap-1">
                  {BG_COLORS.map((c, i) => {
                    const isSel = primaryCell && cellBgColors[primaryCell.row]?.[primaryCell.col] === c
                    return (
                      <button key={i}
                        onClick={() => forEachSelected((r, cc) => setCellBgColors(p => { const n = p.map(r => [...r]); n[r][cc] = c; return n }))}
                        className={`w-6 h-6 rounded-md border transition-shadow ${isSel ? 'ring-2 ring-navy-400' : 'border-app-border hover:shadow-sm'}`}
                        style={{ backgroundColor: c ?? '#fff' }}
                      >
                        {c === null && <span className="text-red-400 text-[10px]">∅</span>}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-app-muted">셀을 선택하면 배경색 변경 가능</p>
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
