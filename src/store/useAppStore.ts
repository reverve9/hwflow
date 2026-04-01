import { create } from 'zustand'
import type {
  IRBlock, IRTableCell, BlockStyleOverride, InputMode,
  ParagraphStyleData, StylePreset, DEFAULT_PARAGRAPH_STYLE,
} from './types'
import { STYLE_LABELS } from './types'
import { takeSnapshot, undo as histUndo, redo as histRedo, pushToRedo, canUndo, canRedo } from './history'
import type { EditSnapshot } from './history'

const PRESET_PREFIX = 'hwflow_preset_'

function loadPresetList(): Array<{ id: string; name: string; data: StylePreset }> {
  const list: Array<{ id: string; name: string; data: StylePreset }> = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith(PRESET_PREFIX)) continue
    const id = key.slice(PRESET_PREFIX.length)
    try {
      const data = JSON.parse(localStorage.getItem(key)!) as StylePreset
      list.push({ id, name: data.meta?.name ?? id, data })
    } catch {}
  }
  return list
}

function loadPresetData(id: string): StylePreset | null {
  try {
    const saved = localStorage.getItem(`hwflow_preset_${id}`)
    if (saved) return JSON.parse(saved) as StylePreset
  } catch {}
  return null
}

// nanoid-like
let _counter = 0
function uid(): string {
  return `blk_${Date.now()}_${++_counter}`
}

export function irBlockFromDict(dict: Record<string, unknown>): IRBlock {
  const type = (dict.type as string) ?? 'body'
  const isTable = type === 'table'
  let text = ''
  let tableRows: IRTableCell[][] = []
  const hasHeader = (dict.has_header as boolean) ?? false

  if (isTable) {
    const rows = dict.rows as unknown[][]
    if (rows) {
      tableRows = rows.map(row =>
        (row as Record<string, unknown>[]).map(item => {
          const cellRuns = (item.runs as Array<{ text: string; bold?: boolean }>)
            ?? [{ text: (item.text as string) ?? '', bold: (item.bold as boolean) ?? false }]
          return {
            runs: cellRuns.map(r => ({ text: r.text ?? '', bold: r.bold ?? false })),
            align: (item.align as IRTableCell['align']) ?? 'left',
            valign: (item.valign as IRTableCell['valign']) ?? 'center',
            bgColor: (item.bg_color as string) ?? null,
            borders: parseBorders(item.borders as Record<string, Record<string, string>> | undefined),
            colspan: (item.colspan as number) ?? 1,
            rowspan: (item.rowspan as number) ?? 1,
            merged: (item.merged as boolean) ?? false,
            ...(item.widthPct ? { widthPct: item.widthPct as number } : {}),
            ...(item.cellFont ? { cellFont: item.cellFont as string } : {}),
            ...(item.cellSize ? { cellSize: item.cellSize as number } : {}),
            ...(item.cellBold != null ? { cellBold: item.cellBold as boolean } : {}),
            ...(item.cellLineHeight ? { cellLineHeight: item.cellLineHeight as number } : {}),
          }
        })
      )
      if (tableRows[0]) {
        text = '[표] ' + tableRows[0].map(c => c.runs.map(r => r.text).join('')).join(' | ')
      }
    }
  } else {
    const runs = dict.runs as Array<{ text: string }> | undefined
    if (runs) {
      text = runs.map(r => r.text ?? '').join('')
    }
  }

  const block: IRBlock = {
    id: (dict.id as string) ?? uid(),
    type,
    text,
    runs: (dict.runs as IRBlock['runs']) ?? [],
    isTable,
    tableRows,
    hasHeader,
  }
  if (dict.align) block.align = dict.align as IRBlock['align']
  if (dict.indent_left_hwpunit) block.indent_left_hwpunit = dict.indent_left_hwpunit as number
  if (dict.space_before_hwpunit) block.space_before_hwpunit = dict.space_before_hwpunit as number
  if (dict.space_after_hwpunit) block.space_after_hwpunit = dict.space_after_hwpunit as number
  if (dict.originalStyle) block.originalStyle = dict.originalStyle as IRBlock['originalStyle']
  return block
}

/** 파싱된 블록 배열을 IR로 변환 */
export function irBlocksFromDicts(dicts: Record<string, unknown>[]): IRBlock[] {
  return dicts.map(b => irBlockFromDict(b))
}

function parseBorders(bd?: Record<string, Record<string, string>>): IRTableCell['borders'] {
  const solid = { type: 'SOLID' as const, width: '0.12 mm' }
  if (!bd) return { top: { ...solid }, bottom: { ...solid }, left: { ...solid }, right: { ...solid } }
  const parse = (d?: Record<string, string>) => d
    ? { type: (d.type ?? 'SOLID') as 'SOLID', width: d.width ?? '0.12 mm' }
    : { ...solid }
  return { top: parse(bd.top), bottom: parse(bd.bottom), left: parse(bd.left), right: parse(bd.right) }
}

interface AppState {
  // 입력
  inputMode: InputMode
  pasteText: string
  selectedFileName: string
  documentTitle: string

  // IR
  irBlocks: IRBlock[]
  selectedBlockIDs: Set<string>
  anchorBlockID: string | null

  // UI 상태
  presetVersion: number // 프리셋 저장 시 증가 → 미리보기 재렌더링 트리거
  isConverting: boolean
  conversionMessage: string
  showInspector: boolean
  showSplitPreview: boolean
  showStyleSettings: boolean
  showBlockModal: boolean

  // 스타일
  selectedPreset: string
  availablePresets: Array<{ id: string; name: string }>
  blockOverrides: Record<string, BlockStyleOverride>
  blockTypeOverrides: Record<string, string>
  blockTextOverrides: Record<string, string>
  tableRowOverrides: Record<string, IRTableCell[][]>
  tableHeaderOverrides: Record<string, boolean>
  availableStyleKeys: string[]
  styleDisplayNames: Record<string, string>
  styleMapping: Record<string, string>

  // 헬퍼
  getPresetData: () => StylePreset | null
  selectedBlock: () => IRBlock | undefined
  selectedBlocks: () => IRBlock[]
  effectiveType: (block: IRBlock) => string
  effectiveText: (block: IRBlock) => string
  effectiveTableRows: (block: IRBlock) => IRTableCell[][]
  effectiveHasHeader: (block: IRBlock) => boolean
  displayName: (key: string) => string
  styleFor: (type: string) => ParagraphStyleData

  // 액션
  setInputMode: (mode: InputMode) => void
  setPasteText: (text: string) => void
  setSelectedFileName: (name: string) => void
  setDocumentTitle: (title: string) => void
  setIRBlocks: (blocks: IRBlock[]) => void
  setConversionMessage: (msg: string) => void
  setIsConverting: (v: boolean) => void
  setShowInspector: (v: boolean) => void
  setShowSplitPreview: (v: boolean) => void
  setShowStyleSettings: (v: boolean) => void
  setShowBlockModal: (v: boolean) => void
  setSelectedPreset: (id: string) => void
  setStyleMapping: (mapping: Record<string, string>) => void
  setBlockTypeOverride: (blockId: string, type: string | null) => void
  setBlockTextOverride: (blockId: string, text: string | null) => void
  setBlockOverride: (blockId: string, override: BlockStyleOverride | null) => void
  setTableRowOverride: (blockId: string, rows: IRTableCell[][] | null) => void
  setTableHeaderOverride: (blockId: string, hasHeader: boolean | null) => void
  setTypeForSelectedBlocks: (type: string) => void

  // 블록 선택
  selectBlock: (id: string, opts?: { command?: boolean; shift?: boolean }) => void
  clearBlockSelection: () => void

  // 블록 조작
  moveBlockUp: (id: string) => void
  moveBlockDown: (id: string) => void
  deleteBlock: (id: string) => void
  deleteSelectedBlocks: () => void
  addBlock: (afterId?: string, type?: string, text?: string) => void

  // 스타일 키 관리
  setAvailableStyleKeys: (keys: string[]) => void
  setStyleDisplayNames: (names: Record<string, string>) => void
  reloadPresets: () => void

  // Undo/Redo
  saveSnapshot: () => void
  undo: () => void
  redo: () => void

  // 임시저장 복원
  restoreDraft: (draft: unknown) => void
}

export const useAppStore = create<AppState>((set, get) => {
  const presetList = loadPresetList()
  const defaultPreset = presetList[0]?.id ?? ''

  return {
    inputMode: 'file',
    pasteText: '',
    selectedFileName: '',
    documentTitle: '',
    irBlocks: [],
    selectedBlockIDs: new Set(),
    anchorBlockID: null,
    presetVersion: 0,
    isConverting: false,
    conversionMessage: '',
    showInspector: true,
    showSplitPreview: true,
    showStyleSettings: false,
    showBlockModal: false,
    selectedPreset: defaultPreset,
    availablePresets: presetList.map(p => ({ id: p.id, name: p.name })),
    blockOverrides: {},
    blockTypeOverrides: {},
    blockTextOverrides: {},
    tableRowOverrides: {},
    tableHeaderOverrides: {},
    availableStyleKeys: ['heading1', 'heading2', 'heading3', 'heading4', 'body'],
    styleDisplayNames: {},
    styleMapping: {},

    // 헬퍼
    getPresetData: () => loadPresetData(get().selectedPreset),

    selectedBlock: () => {
      const { irBlocks, anchorBlockID, selectedBlockIDs } = get()
      const id = anchorBlockID ?? [...selectedBlockIDs][0]
      return id ? irBlocks.find(b => b.id === id) : undefined
    },

    selectedBlocks: () => {
      const { irBlocks, selectedBlockIDs } = get()
      return irBlocks.filter(b => selectedBlockIDs.has(b.id))
    },

    effectiveType: (block) => {
      const { blockTypeOverrides, styleMapping } = get()
      if (blockTypeOverrides[block.id]) return blockTypeOverrides[block.id]
      if (styleMapping[block.type] && styleMapping[block.type] !== block.type) return styleMapping[block.type]
      return block.type
    },

    effectiveText: (block) => {
      const state = get()
      if (block.isTable) {
        const rows = state.effectiveTableRows(block)
        if (rows.length === 1 && rows[0].length === 1) {
          return '[표] ' + rows[0][0].runs.map(r => r.text).join('')
        }
        return '[표]\n' + rows.map(r => r.map(c => c.runs.map(r => r.text).join('')).join(' | ')).join('\n')
      }
      return state.blockTextOverrides[block.id] ?? block.text
    },

    effectiveTableRows: (block) => get().tableRowOverrides[block.id] ?? block.tableRows,
    effectiveHasHeader: (block) => get().tableHeaderOverrides[block.id] ?? block.hasHeader,

    displayName: (key) => {
      const { styleDisplayNames } = get()
      return styleDisplayNames[key] ?? STYLE_LABELS[key] ?? key
    },

    styleFor: (type) => {
      const preset = get().getPresetData()
      if (preset?.paragraph_styles[type]) return preset.paragraph_styles[type]
      return {
        font: 'HCR Batang', size_pt: 10, bold: false, align: 'justify',
        indent_left_hwpunit: 0, space_before_hwpunit: 0, space_after_hwpunit: 0,
        line_height_percent: 160,
      }
    },

    // 세터
    setInputMode: (mode) => set({ inputMode: mode }),
    setPasteText: (text) => set({ pasteText: text }),
    setSelectedFileName: (name) => set({ selectedFileName: name }),
    setDocumentTitle: (title) => set({ documentTitle: title }),
    setIRBlocks: (blocks) => { get().saveSnapshot(); set({ irBlocks: blocks }) },
    setConversionMessage: (msg) => set({ conversionMessage: msg }),
    setIsConverting: (v) => set({ isConverting: v }),
    setShowInspector: (v) => set({ showInspector: v }),
    setShowSplitPreview: (v) => set({ showSplitPreview: v }),
    setShowStyleSettings: (v) => set({ showStyleSettings: v }),
    setShowBlockModal: (v) => set({ showBlockModal: v }),
    setSelectedPreset: (id) => set({ selectedPreset: id }),
    setStyleMapping: (mapping) => set({ styleMapping: mapping }),

    setBlockTypeOverride: (blockId, type) => set(s => {
      const next = { ...s.blockTypeOverrides }
      if (type === null) delete next[blockId]; else next[blockId] = type
      return { blockTypeOverrides: next }
    }),

    setBlockTextOverride: (blockId, text) => set(s => {
      const next = { ...s.blockTextOverrides }
      if (text === null) delete next[blockId]; else next[blockId] = text
      return { blockTextOverrides: next }
    }),

    setBlockOverride: (blockId, override) => set(s => {
      const next = { ...s.blockOverrides }
      if (override === null) delete next[blockId]; else next[blockId] = override
      return { blockOverrides: next }
    }),

    setTableRowOverride: (blockId, rows) => set(s => {
      const next = { ...s.tableRowOverrides }
      if (rows === null) delete next[blockId]; else next[blockId] = rows
      return { tableRowOverrides: next }
    }),

    setTableHeaderOverride: (blockId, hasHeader) => set(s => {
      const next = { ...s.tableHeaderOverrides }
      if (hasHeader === null) delete next[blockId]; else next[blockId] = hasHeader
      return { tableHeaderOverrides: next }
    }),

    setTypeForSelectedBlocks: (type) => set(s => {
      const next = { ...s.blockTypeOverrides }
      for (const id of s.selectedBlockIDs) next[id] = type
      return { blockTypeOverrides: next }
    }),

    // 블록 선택
    selectBlock: (id, opts) => set(s => {
      const { irBlocks, anchorBlockID, selectedBlockIDs } = s
      if (opts?.shift && anchorBlockID) {
        const anchorIdx = irBlocks.findIndex(b => b.id === anchorBlockID)
        const clickIdx = irBlocks.findIndex(b => b.id === id)
        if (anchorIdx >= 0 && clickIdx >= 0) {
          const lo = Math.min(anchorIdx, clickIdx)
          const hi = Math.max(anchorIdx, clickIdx)
          return { selectedBlockIDs: new Set(irBlocks.slice(lo, hi + 1).map(b => b.id)) }
        }
      }
      if (opts?.command) {
        const next = new Set(selectedBlockIDs)
        if (next.has(id)) next.delete(id); else next.add(id)
        return { selectedBlockIDs: next, anchorBlockID: id }
      }
      return { selectedBlockIDs: new Set([id]), anchorBlockID: id }
    }),

    clearBlockSelection: () => set({ selectedBlockIDs: new Set(), anchorBlockID: null }),

    // 블록 조작
    moveBlockUp: (id) => { get().saveSnapshot(); set(s => {
      const idx = s.irBlocks.findIndex(b => b.id === id)
      if (idx <= 0) return s
      const blocks = [...s.irBlocks]
      ;[blocks[idx - 1], blocks[idx]] = [blocks[idx], blocks[idx - 1]]
      return { irBlocks: blocks }
    }) },

    moveBlockDown: (id) => { get().saveSnapshot(); set(s => {
      const idx = s.irBlocks.findIndex(b => b.id === id)
      if (idx < 0 || idx >= s.irBlocks.length - 1) return s
      const blocks = [...s.irBlocks]
      ;[blocks[idx], blocks[idx + 1]] = [blocks[idx + 1], blocks[idx]]
      return { irBlocks: blocks }
    }) },

    deleteBlock: (id) => { get().saveSnapshot(); set(s => {
      const next = new Set(s.selectedBlockIDs)
      next.delete(id)
      const { [id]: _bo, ...blockOverrides } = s.blockOverrides
      const { [id]: _bt, ...blockTypeOverrides } = s.blockTypeOverrides
      const { [id]: _bx, ...blockTextOverrides } = s.blockTextOverrides
      const { [id]: _tr, ...tableRowOverrides } = s.tableRowOverrides
      const { [id]: _th, ...tableHeaderOverrides } = s.tableHeaderOverrides
      return {
        irBlocks: s.irBlocks.filter(b => b.id !== id),
        selectedBlockIDs: next,
        anchorBlockID: s.anchorBlockID === id ? null : s.anchorBlockID,
        blockOverrides, blockTypeOverrides, blockTextOverrides,
        tableRowOverrides, tableHeaderOverrides,
      }
    }) },

    deleteSelectedBlocks: () => {
      const ids = get().selectedBlockIDs
      for (const id of ids) get().deleteBlock(id)
    },

    addBlock: (afterId, type = 'body', text = '') => { get().saveSnapshot(); set(s => {
      const newBlock: IRBlock = {
        id: uid(), type, text, runs: [], isTable: false, tableRows: [], hasHeader: false,
      }
      const blocks = [...s.irBlocks]
      if (afterId) {
        const idx = blocks.findIndex(b => b.id === afterId)
        blocks.splice(idx + 1, 0, newBlock)
      } else {
        blocks.push(newBlock)
      }
      return {
        irBlocks: blocks,
        selectedBlockIDs: new Set([newBlock.id]),
        anchorBlockID: newBlock.id,
      }
    }) },

    setAvailableStyleKeys: (keys) => set({ availableStyleKeys: keys }),
    setStyleDisplayNames: (names) => set({ styleDisplayNames: names }),

    reloadPresets: () => {
      const list = loadPresetList()
      set(s => ({ availablePresets: list.map(p => ({ id: p.id, name: p.name })), presetVersion: s.presetVersion + 1 }))
    },

    // Undo/Redo
    saveSnapshot: () => {
      const s = get()
      takeSnapshot({
        irBlocks: s.irBlocks,
        blockOverrides: s.blockOverrides,
        blockTypeOverrides: s.blockTypeOverrides,
        blockTextOverrides: s.blockTextOverrides,
        tableRowOverrides: s.tableRowOverrides,
        tableHeaderOverrides: s.tableHeaderOverrides,
        styleMapping: s.styleMapping,
      })
    },

    undo: () => {
      const s = get()
      const current: EditSnapshot = {
        irBlocks: s.irBlocks,
        blockOverrides: s.blockOverrides,
        blockTypeOverrides: s.blockTypeOverrides,
        blockTextOverrides: s.blockTextOverrides,
        tableRowOverrides: s.tableRowOverrides,
        tableHeaderOverrides: s.tableHeaderOverrides,
        styleMapping: s.styleMapping,
      }
      const prev = histUndo()
      if (!prev) return
      pushToRedo(current)
      set(prev)
    },

    redo: () => {
      const s = get()
      const current: EditSnapshot = {
        irBlocks: s.irBlocks,
        blockOverrides: s.blockOverrides,
        blockTypeOverrides: s.blockTypeOverrides,
        blockTextOverrides: s.blockTextOverrides,
        tableRowOverrides: s.tableRowOverrides,
        tableHeaderOverrides: s.tableHeaderOverrides,
        styleMapping: s.styleMapping,
      }
      const next = histRedo()
      if (!next) return
      takeSnapshot(current)
      set(next)
    },

    restoreDraft: (draft: unknown) => {
      const d = draft as Record<string, unknown>
      if (!d || !Array.isArray(d.irBlocks)) return
      const blocks = (d.irBlocks as Record<string, unknown>[]).map(b => irBlockFromDict(b))
      set({
        irBlocks: blocks,
        documentTitle: (d.documentTitle as string) ?? '',
        selectedPreset: (d.selectedPreset as string) ?? get().selectedPreset,
        selectedFileName: (d.selectedFileName as string) ?? '',
        blockOverrides: (d.blockOverrides as Record<string, BlockStyleOverride>) ?? {},
        blockTypeOverrides: (d.blockTypeOverrides as Record<string, string>) ?? {},
        blockTextOverrides: (d.blockTextOverrides as Record<string, string>) ?? {},
        tableRowOverrides: (d.tableRowOverrides as Record<string, IRTableCell[][]>) ?? {},
        tableHeaderOverrides: (d.tableHeaderOverrides as Record<string, boolean>) ?? {},
        styleMapping: (d.styleMapping as Record<string, string>) ?? {},
        selectedBlockIDs: new Set(),
        anchorBlockID: null,
      })
    },
  }
})
