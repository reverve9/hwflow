import { useState, useCallback } from 'react'
import { useAppStore } from '@/store/useAppStore'
import type { IRBlock, IRTableCell, CellBorder, CellBorders, BorderPreset } from '@/store/types'
import { SOLID_BORDERS, DEFAULT_CELL_BORDER, NONE_CELL_BORDER, THICK_CELL_BORDER } from '@/store/types'

interface CellIndex { row: number; col: number }
function cellKey(c: CellIndex) { return `${c.row},${c.col}` }

interface Props { block: IRBlock }

const BG_COLORS: (string | null)[] = [
  null, '#D8D8D8', '#E8F5E9', '#FFF3E0', '#E3F2FD', '#FCE4EC',
  '#F3E5F5', '#FFF9C4', '#ECEFF1', '#F5F5F5', '#FFFFFF',
]

const PRESETS: { key: BorderPreset; label: string }[] = [
  { key: 'all', label: '전체' }, { key: 'outerThick', label: '윤곽굵게' },
  { key: 'innerOnly', label: '안쪽' }, { key: 'none', label: '없음' },
  { key: 'outerHorizontal', label: '윤곽+가로' }, { key: 'outerVertical', label: '윤곽+세로' },
  { key: 'horizontalOnly', label: '가로만' }, { key: 'verticalOnly', label: '세로만' },
  { key: 'topBottomH', label: '위아래+가로' }, { key: 'leftRightV', label: '좌우+세로' },
]

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
  const [hasHeader, setHasHeader] = useState(() => effectiveHasHeader(block))
  const [lineType, setLineType] = useState<CellBorder['type']>('SOLID')
  const [lineWidth, setLineWidth] = useState('0.12 mm')
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set())
  const [anchorCell, setAnchorCell] = useState<CellIndex | null>(null)
  const [editingCell, setEditingCell] = useState<CellIndex | null>(null)

  const rowCount = cellTexts.length
  const colCount = cellTexts[0]?.length ?? 0

  const close = () => setShowBlockModal(false)

  const apply = () => {
    const rows: IRTableCell[][] = []
    for (let r = 0; r < rowCount; r++) {
      const row: IRTableCell[] = []
      for (let c = 0; c < colCount; c++) {
        row.push({
          runs: [{ text: cellTexts[r][c], bold: cellBolds[r][c] }],
          align: cellAligns[r][c], valign: cellValigns[r][c],
          bgColor: cellBgColors[r][c], borders: cellBorders[r][c],
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

  const selectCell = (row: number, col: number, shift: boolean) => {
    const idx: CellIndex = { row, col }
    if (shift && anchorCell) {
      const rMin = Math.min(anchorCell.row, row), rMax = Math.max(anchorCell.row, row)
      const cMin = Math.min(anchorCell.col, col), cMax = Math.max(anchorCell.col, col)
      const next = new Set<string>()
      for (let r = rMin; r <= rMax; r++) for (let c = cMin; c <= cMax; c++) next.add(cellKey({ row: r, col: c }))
      setSelectedCells(next)
    } else {
      setSelectedCells(new Set([cellKey(idx)]))
      setAnchorCell(idx)
    }
    setEditingCell(null)
  }

  const primaryCell = (() => {
    if (anchorCell && selectedCells.has(cellKey(anchorCell))) return anchorCell
    const first = [...selectedCells][0]
    if (!first) return null
    const [r, c] = first.split(',').map(Number)
    return { row: r, col: c }
  })()

  // 행/열 추가/삭제
  const addRow = () => {
    setCellTexts(p => [...p, Array(colCount).fill('')])
    setCellBolds(p => [...p, Array(colCount).fill(false)])
    setCellAligns(p => [...p, Array(colCount).fill('left') as IRTableCell['align'][]])
    setCellValigns(p => [...p, Array(colCount).fill('center') as IRTableCell['valign'][]])
    setCellBgColors(p => [...p, Array(colCount).fill(null)])
    setCellBorders(p => [...p, Array.from({ length: colCount }, () => ({ ...SOLID_BORDERS, top: { ...DEFAULT_CELL_BORDER }, bottom: { ...DEFAULT_CELL_BORDER }, left: { ...DEFAULT_CELL_BORDER }, right: { ...DEFAULT_CELL_BORDER } }))])
  }
  const addCol = () => {
    setCellTexts(p => p.map(r => [...r, '']))
    setCellBolds(p => p.map(r => [...r, false]))
    setCellAligns(p => p.map(r => [...r, 'left' as const]))
    setCellValigns(p => p.map(r => [...r, 'center' as const]))
    setCellBgColors(p => p.map(r => [...r, null]))
    setCellBorders(p => p.map(r => [...r, { top: { ...DEFAULT_CELL_BORDER }, bottom: { ...DEFAULT_CELL_BORDER }, left: { ...DEFAULT_CELL_BORDER }, right: { ...DEFAULT_CELL_BORDER } }]))
  }

  // 테두리 프리셋 적용
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={close}>
      <div className="bg-white rounded-lg shadow-xl flex flex-col" style={{ width: 'min(90vw, 1050px)', height: 'min(85vh, 780px)' }} onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-center gap-3 p-4 border-b shrink-0">
          <h3 className="font-bold text-lg">표 편집</h3>
          <span className="text-sm text-gray-400">{rowCount} × {colCount}</span>
          {selectedCells.size === 1 && primaryCell && (
            <span className="text-xs bg-navy-100 text-navy-600 px-2 py-0.5 rounded">셀 [{primaryCell.row + 1}, {primaryCell.col + 1}]</span>
          )}
          {selectedCells.size > 1 && (
            <span className="text-xs bg-navy-100 text-navy-600 px-2 py-0.5 rounded">{selectedCells.size}개 셀 선택</span>
          )}
          <div className="flex-1" />
          <button onClick={apply} className="px-3 py-1.5 bg-navy-600 text-white text-sm rounded hover:bg-navy-700">적용</button>
          <button onClick={close} className="px-3 py-1.5 border border-gray-300 text-sm rounded hover:bg-gray-50">취소</button>
        </div>

        {/* 툴바 */}
        <div className="flex items-center gap-3 px-4 py-2 border-b text-sm shrink-0">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={hasHeader} onChange={e => setHasHeader(e.target.checked)} className="accent-navy-500" />
            첫 행 헤더
          </label>
          <div className="w-px h-4 bg-gray-300" />
          <button onClick={addRow} className="px-2 py-1 border rounded text-xs hover:bg-gray-50">+ 행</button>
          <button onClick={addCol} className="px-2 py-1 border rounded text-xs hover:bg-gray-50">+ 열</button>
          <div className="flex-1" />
          {selectedCells.size > 0 && (
            <button onClick={() => { setSelectedCells(new Set()); setAnchorCell(null); setEditingCell(null) }}
              className="text-xs text-gray-500 hover:underline">선택 해제</button>
          )}
        </div>

        {/* 본문 */}
        <div className="flex flex-1 min-h-0">
          {/* 표 그리드 */}
          <div className="flex-1 overflow-auto p-4" onClick={() => { setSelectedCells(new Set()); setEditingCell(null) }}>
            <table className="border-collapse" onClick={e => e.stopPropagation()}>
              <tbody>
                {Array.from({ length: rowCount }, (_, r) => (
                  <tr key={r}>
                    <td className="text-[10px] text-gray-400 pr-2 align-middle select-none">{r + 1}</td>
                    {Array.from({ length: colCount }, (_, c) => {
                      const isHeader = hasHeader && r === 0
                      const isEditing = editingCell?.row === r && editingCell?.col === c
                      const isSelected = selectedCells.has(cellKey({ row: r, col: c }))
                      const bold = cellBolds[r][c] || isHeader
                      const bg = cellBgColors[r][c] ?? (isHeader ? '#e5e7eb' : '#ffffff')
                      const borders = cellBorders[r][c]

                      return (
                        <td
                          key={c}
                          className={`relative min-w-[80px] p-0 ${isSelected ? 'ring-2 ring-navy-400 ring-inset z-10' : ''}`}
                          style={{ backgroundColor: bg }}
                          onClick={e => { e.stopPropagation(); selectCell(r, c, e.shiftKey) }}
                          onDoubleClick={e => { e.stopPropagation(); selectCell(r, c, false); setEditingCell({ row: r, col: c }) }}
                        >
                          {/* 테두리 */}
                          {borders.top.type !== 'NONE' && <div className="absolute top-0 left-0 right-0 bg-black/60" style={{ height: bdrW(borders.top) }} />}
                          {borders.bottom.type !== 'NONE' && <div className="absolute bottom-0 left-0 right-0 bg-black/60" style={{ height: bdrW(borders.bottom) }} />}
                          {borders.left.type !== 'NONE' && <div className="absolute top-0 left-0 bottom-0 bg-black/60" style={{ width: bdrW(borders.left) }} />}
                          {borders.right.type !== 'NONE' && <div className="absolute top-0 right-0 bottom-0 bg-black/60" style={{ width: bdrW(borders.right) }} />}

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

          {/* 인스펙터 패널 */}
          <div className="w-[220px] shrink-0 overflow-y-auto border-l bg-gray-50 p-3 space-y-4 text-sm">
            {/* 선 설정 */}
            <div>
              <h4 className="font-semibold mb-2">선</h4>
              <div className="flex gap-2">
                <div>
                  <label className="text-xs text-gray-400">종류</label>
                  <select value={lineType} onChange={e => setLineType(e.target.value as CellBorder['type'])}
                    className="w-full border rounded px-1.5 py-1 text-xs">
                    <option value="SOLID">실선</option><option value="DASHED">점선</option><option value="NONE">없음</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400">굵기</label>
                  <select value={lineWidth} onChange={e => setLineWidth(e.target.value)}
                    className="w-full border rounded px-1.5 py-1 text-xs">
                    <option value="0.12 mm">0.12</option><option value="0.25 mm">0.25</option>
                    <option value="0.4 mm">0.4</option><option value="0.7 mm">0.7</option>
                  </select>
                </div>
              </div>
            </div>

            <hr />

            {/* 테두리 프리셋 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold">테두리</h4>
                <span className="text-[10px] text-gray-400">{selectedCells.size > 0 ? '선택 영역' : '표 전체'}</span>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {PRESETS.map(p => (
                  <button key={p.key} onClick={() => applyPreset(p.key)}
                    className="py-1.5 px-1 bg-white border rounded text-[9px] hover:bg-gray-100 leading-tight">
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <hr />

            {/* 배경 */}
            <div>
              <h4 className="font-semibold mb-2">배경</h4>
              {primaryCell ? (
                <div className="grid grid-cols-6 gap-1">
                  {BG_COLORS.map((c, i) => {
                    const isSel = primaryCell && cellBgColors[primaryCell.row]?.[primaryCell.col] === c
                    return (
                      <button key={i}
                        onClick={() => forEachSelected((r, cc) => setCellBgColors(p => { const n = p.map(r => [...r]); n[r][cc] = c; return n }))}
                        className={`w-6 h-6 rounded border ${isSel ? 'ring-2 ring-navy-400' : 'border-gray-300'}`}
                        style={{ backgroundColor: c ?? '#fff' }}
                      >
                        {c === null && <span className="text-red-400 text-[10px]">∅</span>}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-400">셀을 선택하면 배경색 변경 가능</p>
              )}
            </div>

            {/* 셀 속성 */}
            {primaryCell && primaryCell.row < rowCount && primaryCell.col < colCount && (
              <>
                <hr />
                <div>
                  <h4 className="font-semibold mb-2">셀 속성{selectedCells.size > 1 ? ` (${selectedCells.size}개)` : ''}</h4>
                  <label className="flex items-center gap-1.5 mb-2 cursor-pointer">
                    <input type="checkbox" checked={cellBolds[primaryCell.row][primaryCell.col]}
                      onChange={e => forEachSelected((r, c) => setCellBolds(p => { const n = p.map(r => [...r]); n[r][c] = e.target.checked; return n }))}
                      className="accent-navy-500" />
                    <span className="text-xs">볼드</span>
                  </label>
                  <div className="mb-2">
                    <label className="text-xs text-gray-400">가로 정렬</label>
                    <div className="flex gap-1 mt-1">
                      {(['left', 'center', 'right', 'justify'] as const).map(a => (
                        <button key={a}
                          onClick={() => forEachSelected((r, c) => setCellAligns(p => { const n = p.map(r => [...r]); n[r][c] = a; return n }))}
                          className={`flex-1 py-1 text-[10px] rounded border ${cellAligns[primaryCell!.row][primaryCell!.col] === a ? 'bg-navy-100 border-navy-300' : 'hover:bg-gray-100'}`}>
                          {a === 'left' ? '좌' : a === 'center' ? '중' : a === 'right' ? '우' : '양'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">세로 정렬</label>
                    <div className="flex gap-1 mt-1">
                      {(['top', 'center', 'bottom'] as const).map(a => (
                        <button key={a}
                          onClick={() => forEachSelected((r, c) => setCellValigns(p => { const n = p.map(r => [...r]); n[r][c] = a; return n }))}
                          className={`flex-1 py-1 text-[10px] rounded border ${cellValigns[primaryCell!.row][primaryCell!.col] === a ? 'bg-navy-100 border-navy-300' : 'hover:bg-gray-100'}`}>
                          {a === 'top' ? '상' : a === 'center' ? '중' : '하'}
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
