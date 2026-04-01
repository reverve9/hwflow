/**
 * projectFile.ts — .hwfl 프로젝트 파일 저장/불러오기
 */

import { useAppStore } from '@/store/useAppStore'

const FILE_VERSION = 1
const FILE_EXT = '.hwfl'

interface HwflFile {
  version: number
  savedAt: string
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
}

/** 현재 작업 상태를 .hwfl 파일로 다운로드 */
export function saveProjectFile() {
  const s = useAppStore.getState()
  if (s.irBlocks.length === 0) return

  const data: HwflFile = {
    version: FILE_VERSION,
    savedAt: new Date().toISOString(),
    documentTitle: s.documentTitle,
    selectedPreset: s.selectedPreset,
    selectedFileName: s.selectedFileName,
    irBlocks: s.irBlocks,
    blockOverrides: s.blockOverrides,
    blockTypeOverrides: s.blockTypeOverrides,
    blockTextOverrides: s.blockTextOverrides,
    tableRowOverrides: s.tableRowOverrides,
    tableHeaderOverrides: s.tableHeaderOverrides,
    styleMapping: s.styleMapping,
  }

  const json = JSON.stringify(data)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const filename = (s.documentTitle || s.selectedFileName || '문서').replace(/\.[^.]+$/, '') + FILE_EXT
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** .hwfl 파일을 열어서 작업 상태 복원 */
export function openProjectFile(): Promise<boolean> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = FILE_EXT
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) { resolve(false); return }

      const reader = new FileReader()
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result as string) as HwflFile
          if (!Array.isArray(data.irBlocks)) { resolve(false); return }
          useAppStore.getState().restoreDraft(data)
          resolve(true)
        } catch {
          resolve(false)
        }
      }
      reader.onerror = () => resolve(false)
      reader.readAsText(file)
    }
    input.click()
  })
}
