/**
 * Undo/Redo 히스토리 관리
 * 편집 관련 상태만 스냅샷 (UI 상태 제외)
 */

import type { IRBlock, IRTableCell, BlockStyleOverride } from './types'

export interface EditSnapshot {
  irBlocks: IRBlock[]
  blockOverrides: Record<string, BlockStyleOverride>
  blockTypeOverrides: Record<string, string>
  blockTextOverrides: Record<string, string>
  tableRowOverrides: Record<string, IRTableCell[][]>
  tableHeaderOverrides: Record<string, boolean>
  styleMapping: Record<string, string>
}

const MAX_HISTORY = 50

let undoStack: EditSnapshot[] = []
let redoStack: EditSnapshot[] = []

export function takeSnapshot(state: EditSnapshot) {
  undoStack.push(structuredClone(state))
  if (undoStack.length > MAX_HISTORY) undoStack.shift()
  redoStack = [] // 새 편집 시 redo 초기화
}

export function undo(): EditSnapshot | null {
  if (undoStack.length === 0) return null
  return undoStack.pop()!
}

export function redo(): EditSnapshot | null {
  if (redoStack.length === 0) return null
  return redoStack.pop()!
}

export function pushToRedo(state: EditSnapshot) {
  redoStack.push(structuredClone(state))
}

export function canUndo() { return undoStack.length > 0 }
export function canRedo() { return redoStack.length > 0 }
