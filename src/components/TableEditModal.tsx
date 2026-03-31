import { useState, useCallback } from 'react'
import { useAppStore } from '@/store/useAppStore'
import type { IRBlock, IRTableCell, CellBorder, CellBorders, BorderPreset } from '@/store/types'
import { SOLID_BORDERS, DEFAULT_CELL_BORDER, NONE_CELL_BORDER } from '@/store/types'

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
  'all', 'outerThick', 'innerOnly', 'none',
  'outerHorizontal', 'outerVertical', 'horizontalOnly', 'verticalOnly',
  'topBottomH', 'leftRightV',
]

/** 테두리 프리셋 아이콘 SVG */
function BorderIcon({ preset }: { preset: BorderPreset }) {
  const s = 36 // svg size
  const p = 4  // padding
  const m = s / 2 // midpoint
  const on = 'stroke-blue-500'
  const off = 'stroke-gray-300'
  const onW = '1.5'
  const offW = '0.8'
  const dash = '2,2'

  // 어떤 선이 활성인지
  const flags = getFlags(preset)
  const t = flags.outerTop, b = flags.outerBottom, l = flags.outerLeft, r = flags.outerRight
  const ih = flags.innerH, iv = flags.innerV
  const thick = flags.outerThick

  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} className="block">
      {/* top */}
      <line x1={p} y1={p} x2={s-p} y2={p}
        className={t ? on : off} strokeWidth={t && thick ? '2.5' : t ? onW : offW}
        strokeDasharray={t ? undefined : dash} />
      {/* bottom */}
      <line x1={p} y1={s-p} x2={s-p} y2={s-p}
        className={b ? on : off} strokeWidth={b && thick ? '2.5' : b ? onW : offW}
        strokeDasharray={b ? undefined : dash} />
      {/* left */}
      <line x1={p} y1={p} x2={p} y2={s-p}
        className={l ? on : off} strokeWidth={l && thick ? '2.5' : l ? onW : offW}
        strokeDasharray={l ? undefined : dash} />
      {/* right */}
      <line x1={s-p} y1={p} x2={s-p} y2={s-p}
        className={r ? on : off} strokeWidth={r && thick ? '2.5' : r ? onW : offW}
        strokeDasharray={r ? undefined : dash} />
      {/* inner horizontal */}
      <line x1={p} y1={m} x2={s-p} y2={m}
        className={ih ? on : off} strokeWidth={ih ? onW : offW}
        strokeDasharray={ih ? undefined : dash} />
      {/* inner vertical */}
      <line x1={m} y1={p} x2={m} y2={s-p}
        className={iv ? on : off} strokeWidth={iv ? onW : offW}
        strokeDasharray={iv ? undefined : dash} />
    </svg>
  )
}

function getFlags(p: BorderPreset) {
  const f = { outerTop: false, outerBottom: false, outerLeft: false, outerRight: false, innerH: false, innerV: false, outerThick: false }
  switch (p) {
    case 'all': return { ...f, outerTop: true, outerBottom: true, outerLeft: true, outerRight: true, innerH: true, innerV: true }
    case 'outerThick': return { ...f, outerTop: true, outerBottom: true, outerLeft: true, outerRight: true, innerH: true, innerV: true, outerThick: true }
    case 'innerOnly': return { ...f, innerH: true, innerV: true }
    case 'none': return f
    case 'outerHorizontal': return { ...f, outerTop: true, outerBottom: true, outerLeft: true, outerRight: true, innerH: true }
    case 'outerVertical': return { ...f, outerTop: true, outerBottom: true, outerLeft: true, outerRight: true, innerV: true }
    case 'horizontalOnly': return { ...f, innerH: true }
    case 'verticalOnly': return { ...f, innerV: true }
    case 'topBottomH': return { ...f, outerTop: true, outerBottom: true, innerH: true }
    case 'leftRightV': return { ...f, outerLeft: true, outerRight: true, innerV: true }
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
    const outer: CellBorder = f.outerThick ? { type: lineType, width: '0.4 mm' } : line

    let rRange: [number, number], cRange: [number, number]
    if (selectedCells.size === 0) {
      rRange = [0, rowCount - 1]; cRange = [0, colCount - 1]
    } else {
      const cells = [...selectedCells].map(k => k.split(',').map(Number))
      rRange = [Math.min(...cells.map(c => c[0])), Math.max(...cells.map(c => c[0]))]
      cRange = [Math.min(...cells.map(c => c[1])), Math.max(...cells.map(c => c[1]))]
    }

    setCellBorders(prev => {
      const next = prev.map(r => r.map(c => ({ ...c })))
      for (let r = rRange[0]; r <= rRange[1]; r++)
        for (let c = cRange[0]; c <= cRange[1]; c++)
          next[r][c] = { top: { ...NONE_CELL_BORDER }, bottom: { ...NONE_CELL_BORDER }, left: { ...NONE_CELL_BORDER }, right: { ...NONE_CELL_BORDER } }

      if (f.outerTop) for (let c = cRange[0]; c <= cRange[1]; c++) next[rRange[0]][c].top = { ...outer }
      if (f.outerBottom) for (let c = cRange[0]; c <= cRange[1]; c++) next[rRange[1]][c].bottom = { ...outer }
      if (f.outerLeft) for (let r = rRange[0]; r <= rRange[1]; r++) next[r][cRange[0]].left = { ...outer }
      if (f.outerRight) for (let r = rRange[0]; r <= rRange[1]; r++) next[r][cRange[1]].right = { ...outer }
      if (f.innerH && rRange[1] > rRange[0])
        for (let r = rRange[0]; r < rRange[1]; r++)
          for (let c = cRange[0]; c <= cRange[1]; c++) { next[r][c].bottom = { ...line }; next[r + 1][c].top = { ...line } }
      if (f.innerV && cRange[1] > cRange[0])
        for (let c = cRange[0]; c < cRange[1]; c++)
          for (let r = rRange[0]; r <= rRange[1]; r++) { next[r][c].right = { ...line }; next[r][c + 1].left = { ...line } }
      return next
    })
  }

  const bdrW = (b: CellBorder) => {
    switch (b.width) { case '0.7 mm': return 3; case '0.4 mm': return 2; case '0.25 mm': return 1.5; default: return 1 }
  }

  // ─── 렌더링 ────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={close}>
      <div className="bg-[#f5f5f5] rounded-xl shadow-2xl flex flex-col" style={{ width: 'min(90vw, 1050px)', height: 'min(85vh, 780px)' }} onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-app-border shrink-0">
          <div className="min-w-0">
            <h3 className="text-[13px] font-semibold text-navy-800">표 편집</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[11px] text-app-muted">{rowCount} × {colCount}</span>
              {selectedCells.size >= 1 && primaryCell && !cellMerge[primaryCell.row][primaryCell.col].merged && (
                <span className="text-[10px] bg-navy-100 text-navy-600 px-1.5 py-0.5 rounded-md">
                  {cellMerge[primaryCell.row][primaryCell.col].colspan > 1 || cellMerge[primaryCell.row][primaryCell.col].rowspan > 1
                    ? `병합 셀 [${primaryCell.row + 1},${primaryCell.col + 1}] ${cellMerge[primaryCell.row][primaryCell.col].rowspan}×${cellMerge[primaryCell.row][primaryCell.col].colspan}`
                    : selectedCells.size > 1
                      ? `${selectedCells.size}개 셀 선택`
                      : `셀 [${primaryCell.row + 1}, ${primaryCell.col + 1}]`
                  }
                </span>
              )}
            </div>
          </div>
          <div className="flex-1" />
          <div className="flex gap-2 shrink-0">
            <button onClick={close} className="px-3 py-1 text-[12px] rounded-md border border-app-border text-navy-600 hover:bg-white transition-colors">취소</button>
            <button onClick={apply} className="px-3 py-1 text-[12px] rounded-md bg-navy-600 text-white hover:bg-navy-700 transition-colors shadow-sm">적용</button>
          </div>
        </div>

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
                            {borders.top.type !== 'NONE' && <div className="absolute top-0 left-0 right-0 bg-black/60" style={{ height: bdrW(borders.top) }} />}
                            {borders.bottom.type !== 'NONE' && <div className="absolute bottom-0 left-0 right-0 bg-black/60" style={{ height: bdrW(borders.bottom) }} />}
                            {borders.left.type !== 'NONE' && <div className="absolute top-0 left-0 bottom-0 bg-black/60" style={{ width: bdrW(borders.left) }} />}
                            {borders.right.type !== 'NONE' && <div className="absolute top-0 right-0 bottom-0 bg-black/60" style={{ width: bdrW(borders.right) }} />}

                            {/* 병합 표시 */}
                            {isMerged && (
                              <div className="absolute top-0.5 right-1 text-[8px] text-navy-400 select-none">
                                {merge.rowspan}×{merge.colspan}
                              </div>
                            )}

                            {isEditing ? (
                              <input
                                autoFocus
                                value={cellTexts[r][c]}
                                onChange={e => setCellTexts(p => { const n = p.map(r => [...r]); n[r][c] = e.target.value; return n })}
                                onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditingCell(null) }}
                                className={`w-full px-1.5 py-1 text-[11px] outline-none bg-transparent ${bold ? 'font-bold' : ''}`}
                                style={{ textAlign: cellAligns[r][c] }}
                              />
                            ) : (
                              <div className={`px-1.5 py-1 text-[11px] min-h-[28px] ${bold ? 'font-bold' : ''}`}
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
                <span className="text-[10px] text-app-muted">{selectedCells.size > 0 ? '선택 영역' : '표 전체'}</span>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {PRESETS.map(p => (
                  <button key={p} onClick={() => applyPreset(p)}
                    className="flex items-center justify-center bg-white border border-app-border rounded-md hover:bg-navy-50 transition-colors p-0.5">
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
      </div>
    </div>
  )
}
