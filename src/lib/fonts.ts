/**
 * fonts.ts — 시스템 폰트 열거 및 감지
 *
 * 1차: queryLocalFonts() API — 시스템 설치 폰트 전체 열거
 * 2차: 기본 목록 + document.fonts.check() / DOM 실측 fallback
 */

import { useState, useEffect } from 'react'

// ─── 타입 ─────────────────────────────────────────────────
export interface FontItem {
  name: string
  available: boolean
}

// ─── 기본 폰트 (queryLocalFonts 미지원 시 fallback) ──────
const FALLBACK_FONTS = [
  '함초롬바탕', '함초롬돋움', '맑은 고딕', '굴림체', '바탕체', '문체부 바탕체',
]

// ─── 한글 판별 ────────────────────────────────────────────
const RE_KOREAN = /[\uAC00-\uD7AF\u3131-\u3163]/

// ─── queryLocalFonts 타입 ─────────────────────────────────
interface FontData { family: string; fullName: string; postscriptName: string; style: string }
declare global {
  interface Window { queryLocalFonts?: () => Promise<FontData[]> }
}

// ─── 감지 (fallback용) ───────────────────────────────────
function detectFont(fontName: string): boolean {
  try {
    if (document.fonts?.check(`72px "${fontName}"`, '가나다ABC')) return true
  } catch {}
  try {
    const testStr = '아버지가방에들어가신다ABCabc123'
    const span = document.createElement('span')
    span.style.cssText = 'position:absolute;left:-9999px;top:-9999px;font-size:72px;visibility:hidden;white-space:nowrap'
    span.textContent = testStr
    document.body.appendChild(span)
    let detected = false
    for (const base of ['serif', 'sans-serif', 'monospace']) {
      span.style.fontFamily = base
      const bw = span.getBoundingClientRect().width
      span.style.fontFamily = `"${fontName}", ${base}`
      if (Math.abs(bw - span.getBoundingClientRect().width) > 0.5) { detected = true; break }
    }
    document.body.removeChild(span)
    return detected
  } catch {}
  return false
}

// ─── 캐시 ─────────────────────────────────────────────────
let _cache: FontItem[] | null = null
let _loading = false
let _listeners: Array<(fonts: FontItem[]) => void> = []

function notify(fonts: FontItem[]) {
  _cache = fonts
  _loading = false
  for (const fn of _listeners) fn(fonts)
  _listeners = []
}

/** fallback 목록 (동기) */
function getFallbackFonts(): FontItem[] {
  return FALLBACK_FONTS.map(name => ({ name, available: detectFont(name) }))
}

/** 시스템 폰트 로드 시작 */
function loadSystemFonts() {
  if (_cache || _loading) return
  _loading = true

  if (!window.queryLocalFonts) {
    notify(getFallbackFonts())
    return
  }

  window.queryLocalFonts().then(fonts => {
    const families = new Set<string>()
    for (const f of fonts) families.add(f.family)

    const korean: string[] = []
    const other: string[] = []
    for (const name of families) {
      if (RE_KOREAN.test(name)) korean.push(name)
      else other.push(name)
    }
    korean.sort()
    other.sort()

    notify([
      ...korean.map(name => ({ name, available: true })),
      ...other.map(name => ({ name, available: true })),
    ])
  }).catch(() => {
    notify(getFallbackFonts())
  })
}

// ─── React hook ───────────────────────────────────────────
/** 시스템 폰트 목록을 반환하는 hook (한글 폰트 우선 정렬) */
export function useFontList(): FontItem[] {
  const [fonts, setFonts] = useState<FontItem[]>(() => {
    if (_cache) return _cache
    return getFallbackFonts()
  })

  useEffect(() => {
    if (_cache) { setFonts(_cache); return }
    _listeners.push(setFonts)
    loadSystemFonts()
  }, [])

  return fonts
}

// ─── 유틸 (변환 시 사용) ──────────────────────────────────
/** 특정 폰트가 시스템에 설치되어 있는지 확인 */
export function isFontAvailable(fontName: string): boolean {
  if (_cache) {
    const entry = _cache.find(f => f.name === fontName)
    if (entry) return entry.available
  }
  return detectFont(fontName)
}

/** HWPX 변환 시 사용 폰트 검증 + 경고 로그 */
export function validateFontsForExport(usedFonts: string[]): { available: string[]; missing: string[] } {
  const available: string[] = []
  const missing: string[] = []
  for (const font of usedFonts) {
    if (isFontAvailable(font)) {
      available.push(font)
    } else {
      missing.push(font)
      console.warn(`[HWFlow] 폰트 "${font}"이(가) 이 시스템에 설치되어 있지 않습니다.`)
    }
  }
  return { available, missing }
}
