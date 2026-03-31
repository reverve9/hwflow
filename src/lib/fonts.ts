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
 * 시스템 폰트 감지
 *
 * 1차: document.fonts.check() — CSS Font Loading API
 * 2차: DOM span 실측 — 실제 렌더링 파이프라인 사용
 *
 * Canvas measureText는 Safari/Chrome fingerprinting 방어로
 * 시스템 폰트 감지가 안 되므로 사용하지 않는다.
 */
function detectFont(fontName: string): boolean {
  // 1) CSS Font Loading API
  try {
    if (document.fonts?.check(`72px "${fontName}"`, '가나다ABC')) {
      return true
    }
  } catch { /* 미지원 브라우저 무시 */ }

  // 2) DOM span 실측 (getBoundingClientRect)
  try {
    const testStr = '아버지가방에들어가신다ABCabc123'
    const span = document.createElement('span')
    span.style.cssText =
      'position:absolute;left:-9999px;top:-9999px;font-size:72px;' +
      'visibility:hidden;white-space:nowrap;'
    span.textContent = testStr
    document.body.appendChild(span)

    const baselines = ['serif', 'sans-serif', 'monospace'] as const
    let detected = false

    for (const base of baselines) {
      span.style.fontFamily = base
      const baseWidth = span.getBoundingClientRect().width

      span.style.fontFamily = `"${fontName}", ${base}`
      const testWidth = span.getBoundingClientRect().width

      if (Math.abs(baseWidth - testWidth) > 0.5) {
        detected = true
        break
      }
    }

    document.body.removeChild(span)
    return detected
  } catch { /* SSR 등 DOM 없는 환경 */ }

  return false
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
