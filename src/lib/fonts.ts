/**
 * fonts.ts — 폰트 목록 및 시스템 폰트 감지
 *
 * 유료/저작권 폰트 제외, 시스템 기본 또는 무료 배포 폰트만 포함
 */

export interface FontEntry {
  name: string
  category: 'serif' | 'sans-serif'
}

/** 지원 폰트 목록 (무료/시스템 폰트만) */
export const SUPPORTED_FONTS: FontEntry[] = [
  { name: '함초롬바탕', category: 'serif' },
  { name: '함초롬돋움', category: 'sans-serif' },
  { name: '맑은 고딕', category: 'sans-serif' },
  { name: '굴림체', category: 'sans-serif' },
  { name: '바탕체', category: 'serif' },
  { name: '문체부 바탕체', category: 'serif' },
]

/**
 * Canvas 기반 시스템 폰트 감지 (3-baseline 비교)
 *
 * 단일 fallback과 비교하면 한글 텍스트의 fallback 치환이
 * 동일한 폰트로 되어 false-negative가 발생한다.
 * serif, sans-serif, monospace 3개 baseline과 비교하여
 * 하나라도 width가 다르면 해당 폰트가 설치된 것으로 판정.
 */
function detectFont(fontName: string): boolean {
  try {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return false

    const testStr = '아버지가방에들어가신다ABCabc123'
    const size = '72px'
    const baselines = ['serif', 'sans-serif', 'monospace'] as const

    for (const base of baselines) {
      ctx.font = `${size} ${base}`
      const baseWidth = ctx.measureText(testStr).width

      ctx.font = `${size} "${fontName}", ${base}`
      const testWidth = ctx.measureText(testStr).width

      if (Math.abs(baseWidth - testWidth) > 0.1) return true
    }

    return false
  } catch {
    return false
  }
}

export interface FontAvailability {
  name: string
  category: FontEntry['category']
  available: boolean
}

let _cache: FontAvailability[] | null = null

/** 지원 폰트의 설치 여부를 감지하여 반환 (결과 캐시됨) */
export function checkFontAvailability(): FontAvailability[] {
  if (_cache) return _cache
  _cache = SUPPORTED_FONTS.map(f => ({
    ...f,
    available: detectFont(f.name),
  }))
  return _cache
}

/** 캐시 초기화 (폰트 설치 후 재검사 등) */
export function resetFontCache() {
  _cache = null
}

/** 특정 폰트가 시스템에 설치되어 있는지 확인 */
export function isFontAvailable(fontName: string): boolean {
  const list = checkFontAvailability()
  const entry = list.find(f => f.name === fontName)
  if (entry) return entry.available
  return detectFont(fontName)
}

/** HWPX 변환 시 사용하는 폰트들의 가용성을 검증하고 경고 로그 출력 */
export function validateFontsForExport(usedFonts: string[]): { available: string[]; missing: string[] } {
  const available: string[] = []
  const missing: string[] = []
  for (const font of usedFonts) {
    if (isFontAvailable(font)) {
      available.push(font)
    } else {
      missing.push(font)
      console.warn(`[HWFlow] 폰트 "${font}"이(가) 이 시스템에 설치되어 있지 않습니다. 출력 시 대체 폰트로 표시될 수 있습니다.`)
    }
  }
  return { available, missing }
}
