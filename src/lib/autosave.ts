/**
 * autosave.ts — 임시저장 (자동/수동)
 */

const STORAGE_KEY = 'hwflow_draft'
const SETTINGS_KEY = 'hwflow_settings'

export interface AppSettings {
  autoSave: boolean
  autoSaveInterval: number // 초
}

export const DEFAULT_SETTINGS: AppSettings = {
  autoSave: true,
  autoSaveInterval: 30,
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

export interface DraftData {
  documentTitle: string
  selectedPreset: string
  selectedFileName: string
  irBlocks: unknown[]
  blockOverrides: Record<string, unknown>
  blockTypeOverrides: Record<string, string>
  blockTextOverrides: Record<string, string>
  tableRowOverrides: Record<string, unknown>
  tableHeaderOverrides: Record<string, boolean>
  styleMapping: Record<string, string>
  savedAt: string
}

export function saveDraft(data: Omit<DraftData, 'savedAt'>) {
  const draft: DraftData = { ...data, savedAt: new Date().toISOString() }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
}

export function loadDraft(): DraftData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function clearDraft() {
  localStorage.removeItem(STORAGE_KEY)
}

export function hasDraft(): boolean {
  return !!localStorage.getItem(STORAGE_KEY)
}

export function formatDraftTime(iso: string): string {
  try {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  } catch {
    return iso
  }
}
