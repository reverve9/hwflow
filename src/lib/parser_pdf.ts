/**
 * parser_pdf.ts — PDF → IR 블록 변환
 *
 * pdf.js로 텍스트+폰트크기 추출 → 폰트 크기 기반 헤딩/본문 분류
 * 대상: Claude 생성 PDF, 한글→PDF, Word→PDF (구조화된 문서)
 */

import * as pdfjsLib from 'pdfjs-dist'

// Worker 설정
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString()

interface TextItem {
  str: string
  transform: number[] // [scaleX, skewX, skewY, scaleY, x, y]
  fontName: string
  hasEOL: boolean
}

interface CellItem {
  text: string
  fontSize: number
  bold: boolean
  x: number
  width: number
}

interface LineGroup {
  text: string
  fontSize: number
  bold: boolean
  y: number
  x: number
  items: Array<{ text: string; fontSize: number; bold: boolean }>
  cells: CellItem[] // X좌표별 개별 텍스트 조각
}

interface PageElement {
  type: 'line' | 'image'
  y: number
  line?: LineGroup
}

export async function parsePdf(arrayBuffer: ArrayBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const allElements: PageElement[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const pageElements: PageElement[] = []

    // 텍스트 추출
    const content = await page.getTextContent({ includeMarkedContent: false } as any)
    const lines = groupIntoLines(deduplicateItems(content.items as TextItem[]))
    for (const line of lines) {
      pageElements.push({ type: 'line', y: line.y, line })
    }

    // 이미지 위치 추출
    const ops = await page.getOperatorList()
    const OPS = pdfjsLib.OPS
    for (let j = 0; j < ops.fnArray.length; j++) {
      if (ops.fnArray[j] === OPS.paintImageXObject || ops.fnArray[j] === (OPS as any).paintJpegXObject) {
        let imgY = 0
        for (let k = j - 1; k >= Math.max(0, j - 5); k--) {
          if (ops.fnArray[k] === OPS.transform) {
            const t = ops.argsArray[k] as number[]
            imgY = t[5] ?? 0
            break
          }
        }
        pageElements.push({ type: 'image', y: imgY })
      }
    }

    // 페이지 내에서만 Y좌표 정렬 (PDF는 아래→위이므로 역순)
    pageElements.sort((a, b) => b.y - a.y)
    allElements.push(...pageElements)
  }

  return classifyBlocksWithImages(allElements)
}

/** 동일 좌표에 겹친 중복 텍스트 제거 */
function deduplicateItems(items: TextItem[]): TextItem[] {
  const seen = new Set<string>()
  return items.filter(item => {
    const key = `${Math.round(item.transform[4])},${Math.round(item.transform[5])},${item.str}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** 같은 Y좌표의 텍스트를 한 줄로 그룹핑 */
function groupIntoLines(items: TextItem[]): LineGroup[] {
  const lines: LineGroup[] = []
  const Y_THRESHOLD = 2

  for (const item of items) {
    if (!item.str.trim() && !item.hasEOL) continue

    const fontSize = Math.abs(item.transform[0]) || Math.abs(item.transform[3])

    // 히든 텍스트 필터링: 폰트 크기 0이거나 극소, 또는 스케일이 0인 텍스트 무시
    if (fontSize < 1) continue
    // transform이 비정상(크기 0 매트릭스)인 경우 무시
    if (item.transform[0] === 0 && item.transform[3] === 0) continue

    const y = item.transform[5]
    const x = item.transform[4]
    // 페이지 바깥 좌표(음수 또는 극단값) 무시
    if (x < -100 || y < -100 || x > 2000 || y > 2000) continue

    const width = item.str.length * fontSize * 0.5
    const bold = item.fontName?.toLowerCase().includes('bold') ?? false

    const lastLine = lines[lines.length - 1]
    if (lastLine && Math.abs(lastLine.y - y) < Y_THRESHOLD) {
      lastLine.text += item.str
      lastLine.items.push({ text: item.str, fontSize, bold })
      lastLine.cells.push({ text: item.str, fontSize, bold, x, width })
      if (fontSize > lastLine.fontSize) {
        lastLine.fontSize = fontSize
        lastLine.bold = bold
      }
    } else {
      lines.push({
        text: item.str,
        fontSize: Math.round(fontSize * 10) / 10,
        bold,
        y,
        x,
        items: [{ text: item.str, fontSize, bold }],
        cells: [{ text: item.str, fontSize, bold, x, width }],
      })
    }
  }

  return lines
}

/**
 * 표 감지: 연속된 줄들이 비슷한 X좌표 패턴(컬럼)을 가지면 표로 인식
 * 최소 2행, 2열 이상이어야 표로 판정
 */
function detectTables(elements: PageElement[]): PageElement[] {
  const result: PageElement[] = []
  let i = 0

  while (i < elements.length) {
    const el = elements[i]
    if (el.type !== 'line' || !el.line) { result.push(el); i++; continue }

    // 셀이 2개 이상이면 표 행 후보
    const cells = mergeAdjacentCells(el.line.cells)
    if (cells.length < 2) { result.push(el); i++; continue }

    // 연속된 줄 중 비슷한 컬럼 수 + 컬럼 X좌표가 정렬된 것들만 모음
    const tableRows: PageElement[] = [el]
    let j = i + 1
    while (j < elements.length) {
      const next = elements[j]
      if (next.type !== 'line' || !next.line) break
      const nextCells = mergeAdjacentCells(next.line.cells)
      if (nextCells.length < 2) break
      // 컬럼 수 일치 + 첫 번째 컬럼 X좌표가 비슷해야 함
      const xAligned = Math.abs(nextCells[0].x - cells[0].x) < 20
      if (Math.abs(nextCells.length - cells.length) <= 1 && xAligned) {
        tableRows.push(next)
        j++
      } else {
        break
      }
    }

    // 최소 2행 이상이어야 표로 인식
    if (tableRows.length >= 2) {
      result.push({
        type: 'line' as const,
        y: el.y,
        line: {
          ...el.line,
          text: '__TABLE__',
          _tableData: tableRows.map(r => {
            const rc = mergeAdjacentCells(r.line!.cells)
            return rc.map(c => ({ text: c.text.trim(), bold: c.bold }))
          }),
        } as any,
      })
      i = j
    } else {
      result.push(el)
      i++
    }
  }

  return result
}

/** 인접한 셀(X좌표 차이가 작은)을 병합 */
function mergeAdjacentCells(cells: CellItem[]): CellItem[] {
  if (cells.length <= 1) return cells
  const sorted = [...cells].sort((a, b) => a.x - b.x)
  const merged: CellItem[] = [{ ...sorted[0] }]
  const GAP_THRESHOLD = 30 // 셀 간 최소 간격 (이전 5 → 30으로 상향)

  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1]
    const curr = sorted[i]
    const gap = curr.x - (prev.x + prev.width)
    if (gap < GAP_THRESHOLD) {
      prev.text += curr.text
      prev.width = (curr.x + curr.width) - prev.x
    } else {
      merged.push({ ...curr })
    }
  }

  return merged
}

/** 폰트 크기 분포 분석 → 헤딩/본문 자동 분류 */
function classifyBlocks(lines: LineGroup[]) {
  if (lines.length === 0) return []

  // 폰트 크기별 빈도 수집
  const sizeCount: Record<number, number> = {}
  for (const line of lines) {
    const sz = Math.round(line.fontSize)
    sizeCount[sz] = (sizeCount[sz] ?? 0) + line.text.length
  }

  // 가장 많이 쓰인 크기 = 본문
  const bodySize = +Object.entries(sizeCount)
    .sort((a, b) => b[1] - a[1])[0][0]

  // 본문보다 큰 크기들을 정렬 → 헤딩 레벨 매핑
  const headingSizes = [...new Set(
    lines.map(l => Math.round(l.fontSize)).filter(s => s > bodySize)
  )].sort((a, b) => b - a) // 큰 순

  function getType(fontSize: number, text: string): string {
    const sz = Math.round(fontSize)
    if (sz <= bodySize) return 'body'
    const idx = headingSizes.indexOf(sz)
    if (idx === 0) return 'heading1'
    if (idx === 1) return 'heading2'
    if (idx === 2) return 'heading3'
    if (idx >= 3) return 'heading4'
    return 'body'
  }

  // 줄들을 단락으로 병합 (같은 타입의 연속 줄)
  const blocks: Array<{ type: string; runs: Array<{ text: string; bold: boolean }> }> = []
  let currentBlock: typeof blocks[0] | null = null
  let prevY = 0

  for (const line of lines) {
    const trimmed = line.text.trim()
    if (!trimmed) {
      // 빈 줄 → 현재 블록 종료
      currentBlock = null
      continue
    }

    const type = getType(line.fontSize, trimmed)
    const isHeading = type !== 'body'
    const lineGap = prevY > 0 ? Math.abs(prevY - line.y) : 0
    const bigGap = lineGap > line.fontSize * 1.8
    const mediumGap = lineGap > line.fontSize * 1.3

    // 큰 줄간격 → 빈 블록 삽입 (여백 표현)
    if (bigGap && prevY > 0) {
      currentBlock = null
      blocks.push({ type: 'body', runs: [{ text: '', bold: false }] })
    }

    const prevBold = currentBlock?.runs[currentBlock.runs.length - 1]?.bold ?? false
    const boldChanged = currentBlock && line.bold !== prevBold

    if (isHeading || !currentBlock || currentBlock.type !== type || bigGap || mediumGap || boldChanged) {
      currentBlock = {
        type,
        runs: [{ text: trimmed, bold: line.bold || isHeading }],
      }
      blocks.push(currentBlock)
    } else {
      const lastRun = currentBlock.runs[currentBlock.runs.length - 1]
      if (lastRun.bold === line.bold) {
        lastRun.text += ' ' + trimmed
      } else {
        currentBlock.runs.push({ text: ' ' + trimmed, bold: line.bold })
      }
    }

    prevY = line.y
  }

  return blocks
}

/** 텍스트 + 이미지를 Y좌표 순서로 통합 분류 */
function classifyBlocksWithImages(elements: PageElement[]) {
  // 표 감지 적용
  elements = detectTables(elements)

  // 텍스트 줄만 뽑아서 폰트 크기 분석
  const lines = elements.filter(e => e.type === 'line').map(e => e.line!).filter(l => l.text !== '__TABLE__')

  if (lines.length === 0 && elements.some(e => e.type === 'image')) {
    return elements.filter(e => e.type === 'image').map(() => ({
      type: 'image', runs: [{ text: '이미지', bold: false }],
    }))
  }
  if (lines.length === 0) return []

  // 폰트 크기별 빈도
  const sizeCount: Record<number, number> = {}
  for (const line of lines) {
    const sz = Math.round(line.fontSize)
    sizeCount[sz] = (sizeCount[sz] ?? 0) + line.text.length
  }
  const bodySize = +Object.entries(sizeCount).sort((a, b) => b[1] - a[1])[0][0]
  const headingSizes = [...new Set(
    lines.map(l => Math.round(l.fontSize)).filter(s => s > bodySize)
  )].sort((a, b) => b - a)

  function getType(fontSize: number): string {
    const sz = Math.round(fontSize)
    if (sz <= bodySize) return 'body'
    const idx = headingSizes.indexOf(sz)
    if (idx === 0) return 'heading1'
    if (idx === 1) return 'heading2'
    if (idx === 2) return 'heading3'
    if (idx >= 3) return 'heading4'
    return 'body'
  }

  const blocks: Array<{ type: string; runs: Array<{ text: string; bold: boolean }> }> = []
  let currentBlock: typeof blocks[0] | null = null
  let prevY = 0

  for (const el of elements) {
    if (el.type === 'image') {
      currentBlock = null
      blocks.push({ type: 'image', runs: [{ text: '이미지', bold: false }] })
      continue
    }

    const line = el.line!

    // 표 블록 처리
    if (line.text === '__TABLE__' && (line as any)._tableData) {
      currentBlock = null
      const tableData = (line as any)._tableData as Array<Array<{ text: string; bold: boolean }>>
      const rows = tableData.map(row =>
        row.map(cell => ({ runs: [{ text: cell.text, bold: cell.bold }] }))
      )
      // 첫 행이 bold면 헤더로 추정
      const hasHeader = rows.length > 0 && rows[0].every(cell =>
        cell.runs.every(r => r.bold || !r.text.trim())
      )
      blocks.push({ type: 'table', rows, has_header: hasHeader } as any)
      continue
    }

    const trimmed = line.text.trim()
    if (!trimmed) { currentBlock = null; continue }

    const type = getType(line.fontSize)
    const isHeading = type !== 'body'
    const lineGap = prevY > 0 ? Math.abs(prevY - line.y) : 0
    const bigGap = lineGap > line.fontSize * 1.8
    const mediumGap = lineGap > line.fontSize * 1.3

    // 큰 줄간격 → 빈 블록 삽입 (여백 표현)
    if (bigGap && prevY > 0) {
      currentBlock = null
      blocks.push({ type: 'body', runs: [{ text: '', bold: false }] })
    }

    // bold 변경도 새 블록으로 분리
    const prevBold = currentBlock?.runs[currentBlock.runs.length - 1]?.bold ?? false
    const boldChanged = currentBlock && line.bold !== prevBold

    if (isHeading || !currentBlock || currentBlock.type !== type || bigGap || mediumGap || boldChanged) {
      currentBlock = { type, runs: [{ text: trimmed, bold: line.bold || isHeading }] }
      blocks.push(currentBlock)
    } else {
      const lastRun = currentBlock.runs[currentBlock.runs.length - 1]
      if (lastRun.bold === line.bold) {
        lastRun.text += ' ' + trimmed
      } else {
        currentBlock.runs.push({ text: ' ' + trimmed, bold: line.bold })
      }
    }
    prevY = line.y
  }

  return blocks
}
