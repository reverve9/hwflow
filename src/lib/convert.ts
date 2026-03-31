/**
 * 변환 + 다운로드 모듈
 * AppStore의 상태를 받아 오버라이드 반영된 IR을 구성하고 HWPX로 변환 후 다운로드
 */
// @ts-ignore
import { HwpxWriter } from './hwpx_writer.js'

import type { IRBlock, IRTableCell } from '@/store/types'
import { validateFontsForExport } from './fonts'

interface StoreState {
  irBlocks: IRBlock[]
  documentTitle: string
  selectedPreset: string
  blockTypeOverrides: Record<string, string>
  blockTextOverrides: Record<string, string>
  blockOverrides: Record<string, { style: unknown }>
  tableRowOverrides: Record<string, IRTableCell[][]>
  tableHeaderOverrides: Record<string, boolean>
  styleMapping: Record<string, string>
  effectiveType: (block: IRBlock) => string
  effectiveText: (block: IRBlock) => string
  effectiveTableRows: (block: IRBlock) => IRTableCell[][]
  effectiveHasHeader: (block: IRBlock) => boolean
  getPresetData: () => unknown
  setIsConverting: (v: boolean) => void
  setConversionMessage: (msg: string) => void
}

export async function convertToHwpx(store: StoreState) {
  const {
    irBlocks, documentTitle, getPresetData,
    effectiveType, effectiveText, effectiveTableRows, effectiveHasHeader,
    blockTextOverrides, blockTypeOverrides, blockOverrides,
    tableRowOverrides, tableHeaderOverrides,
    setIsConverting, setConversionMessage,
  } = store

  if (irBlocks.length === 0) {
    setConversionMessage('변환할 내용이 없습니다.')
    return
  }

  setIsConverting(true)
  setConversionMessage('')

  try {
    const styleConfig = getPresetData()
    if (!styleConfig) throw new Error('스타일 프리셋을 찾을 수 없습니다.')

    // 오버라이드 반영된 IR 블록 생성
    const blocks = irBlocks.map(block => {
      const eType = effectiveType(block)
      const isTable = block.isTable

      if (isTable) {
        const rows = effectiveTableRows(block)
        const hasHeader = effectiveHasHeader(block)
        return {
          type: 'table',
          has_header: hasHeader,
          rows: rows.map((row: unknown[]) =>
            row.map((cell: any) => ({
              runs: cell.runs,
              align: cell.align,
              valign: cell.valign,
              bg_color: cell.bgColor,
              borders: cell.borders,
            }))
          ),
        }
      }

      // 단락 블록
      const textOverride = blockTextOverrides[block.id]
      const runs = textOverride
        ? [{ text: textOverride, bold: false }]
        : block.runs.length > 0
          ? block.runs
          : [{ text: block.text, bold: false }]

      return {
        type: eType,
        runs,
      }
    })

    // 사용 폰트 검증
    const usedFonts = new Set<string>()
    const ps = (styleConfig as any).paragraph_styles || {}
    for (const sty of Object.values(ps) as any[]) {
      if (sty.font) usedFonts.add(sty.font)
    }
    const { missing } = validateFontsForExport([...usedFonts])
    if (missing.length > 0) {
      setConversionMessage(`경고: 미설치 폰트 [${missing.join(', ')}] — 출력 시 대체될 수 있습니다.`)
    }

    const title = documentTitle || '문서'
    const writer = new HwpxWriter(styleConfig, title)
    const zipBytes: Uint8Array = writer.write(blocks)

    // Blob 다운로드
    const blob = new Blob([new Uint8Array(zipBytes)], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title}.hwpx`
    a.click()
    URL.revokeObjectURL(url)

    const fontWarning = missing.length > 0 ? ` (미설치 폰트: ${missing.join(', ')})` : ''
    setConversionMessage(`변환 완료: ${title}.hwpx${fontWarning}`)
  } catch (e) {
    setConversionMessage(`변환 실패: ${e instanceof Error ? e.message : String(e)}`)
  } finally {
    setIsConverting(false)
  }
}
