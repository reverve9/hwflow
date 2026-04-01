// IR 중간표현 타입 (Swift AppState.swift 기반)

export interface IRTableRun {
  text: string
  bold: boolean
}

export interface CellBorder {
  type: 'SOLID' | 'NONE' | 'DASHED' | 'DOTTED'
  width: string // "0.12 mm", "0.4 mm" 등
}

export interface CellBorders {
  top: CellBorder
  bottom: CellBorder
  left: CellBorder
  right: CellBorder
}

export interface IRTableCell {
  runs: IRTableRun[]
  align: 'left' | 'center' | 'right' | 'justify'
  valign: 'top' | 'center' | 'bottom'
  bgColor: string | null // "#RRGGBB" or null
  borders: CellBorders
  colspan?: number  // default 1
  rowspan?: number  // default 1
  merged?: boolean  // true = 다른 셀의 span에 의해 가려진 셀
  widthPct?: number // 셀 너비 (표 전체 대비 %)
}

export type BlockType = 'heading1' | 'heading2' | 'heading3' | 'heading4' | 'body' | 'table' | string

export interface IRBlock {
  id: string
  type: BlockType
  text: string
  runs: Array<{ text: string; bold?: boolean; [key: string]: unknown }>
  isTable: boolean
  tableRows: IRTableCell[][]
  hasHeader: boolean
  // 파싱된 단락 스타일 (프리셋 기본값 위에 오버라이드)
  align?: 'left' | 'center' | 'right' | 'justify'
  indent_left_hwpunit?: number
  space_before_hwpunit?: number
  space_after_hwpunit?: number
  // 원본 문서 스타일 (DOCX 등에서 추출, 인스펙터용)
  originalStyle?: {
    font?: string
    size_pt?: number
    bold?: boolean
    align?: string
    line_height_percent?: number
    indent_left_hwpunit?: number
    space_before_hwpunit?: number
    space_after_hwpunit?: number
  }
}

export interface ParagraphStyleData {
  font: string
  size_pt: number
  bold: boolean
  align: 'left' | 'center' | 'right' | 'justify'
  indent_left_hwpunit: number
  space_before_hwpunit: number
  space_after_hwpunit: number
  line_height_percent: number
  display_name?: string
}

export interface StylePreset {
  meta: {
    name: string
    version: string
    description: string
  }
  page: {
    size: string
    width_mm: number
    height_mm: number
    margin: {
      top_mm: number
      bottom_mm: number
      left_mm: number
      right_mm: number
    }
    header_height_mm: number
    footer_height_mm: number
  }
  colors: {
    primary: string
    table_head: string
    [key: string]: string
  }
  paragraph_styles: Record<string, ParagraphStyleData>
  character_styles: Record<string, Record<string, unknown>>
  table_style: {
    border_type: string
    border_width: string
    border_color: string
    header_fill: string
    cell_margin_left: number
    cell_margin_right: number
    cell_margin_top: number
    cell_margin_bottom: number
  }
  style_mapping?: Record<string, string>
}

export interface BlockStyleOverride {
  style: ParagraphStyleData
}

export type InputMode = 'file' | 'paste'

// 테두리 프리셋 enum
export type BorderPreset =
  | 'all' | 'outer' | 'innerOnly' | 'none'
  | 'topOnly' | 'bottomOnly' | 'leftOnly' | 'rightOnly'
  | 'innerH' | 'innerV'

// 기본값 팩토리
export const DEFAULT_CELL_BORDER: CellBorder = { type: 'SOLID', width: '0.12 mm' }
export const NONE_CELL_BORDER: CellBorder = { type: 'NONE', width: '0.1 mm' }
export const THICK_CELL_BORDER: CellBorder = { type: 'SOLID', width: '0.4 mm' }

export const SOLID_BORDERS: CellBorders = {
  top: { ...DEFAULT_CELL_BORDER },
  bottom: { ...DEFAULT_CELL_BORDER },
  left: { ...DEFAULT_CELL_BORDER },
  right: { ...DEFAULT_CELL_BORDER },
}

export const DEFAULT_PARAGRAPH_STYLE: ParagraphStyleData = {
  font: 'HCR Batang',
  size_pt: 10,
  bold: false,
  align: 'justify',
  indent_left_hwpunit: 0,
  space_before_hwpunit: 0,
  space_after_hwpunit: 0,
  line_height_percent: 160,
}

export const STYLE_LABELS: Record<string, string> = {
  heading1: '제목 1 (H1)',
  heading2: '제목 2 (H2)',
  heading3: '제목 3 (H3)',
  heading4: '제목 4 (H4)',
  body: '본문',
  table_header: '표 헤더',
  table_body: '표 본문',
}

export const NUMBERING_OPTIONS: Record<string, string> = {
  heading1: 'I, II, III',
  heading2: '1, 2, 3',
  heading3: '가, 나, 다',
  heading4: '1), 2), 3)',
}
