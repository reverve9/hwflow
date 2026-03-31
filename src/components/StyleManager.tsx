import { useState, useEffect } from 'react'
import { useAppStore } from '@/store/useAppStore'
import type { ParagraphStyleData } from '@/store/types'
import { STYLE_LABELS, NUMBERING_OPTIONS } from '@/store/types'
import { useFontList } from '@/lib/fonts'

interface EditableStyle {
  id: string
  key: string
  displayName: string
  data: ParagraphStyleData
  isBuiltin: boolean
}

const BUILTIN_KEYS = ['heading1', 'heading2', 'heading3', 'heading4', 'body', 'table_header', 'table_body']
const PARSER_KEYS = ['heading1', 'heading2', 'heading3', 'heading4', 'body']

export function StyleManager() {
  const {
    setShowStyleSettings, selectedPreset, setSelectedPreset, availablePresets,
    getPresetData, setAvailableStyleKeys, setStyleDisplayNames,
    styleMapping, setStyleMapping,
  } = useAppStore()

  const [styles, setStyles] = useState<EditableStyle[]>([])
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(null)
  const [showMapping, setShowMapping] = useState(false)
  const [pageMargin, setPageMargin] = useState({ top: 20, bottom: 15, left: 15, right: 15 })
  const [saveMessage, setSaveMessage] = useState('')

  // 프리셋 로드
  useEffect(() => {
    const preset = getPresetData()
    if (!preset) return
    const margin = preset.page?.margin
    if (margin) setPageMargin({ top: margin.top_mm, bottom: margin.bottom_mm, left: margin.left_mm, right: margin.right_mm })

    const loaded: EditableStyle[] = []
    const ps = preset.paragraph_styles ?? {}
    for (const key of BUILTIN_KEYS) {
      if (ps[key]) {
        loaded.push({
          id: key, key, displayName: ps[key].display_name ?? STYLE_LABELS[key] ?? key,
          data: { ...ps[key] }, isBuiltin: true,
        })
      }
    }
    for (const [key, data] of Object.entries(ps)) {
      if (!BUILTIN_KEYS.includes(key)) {
        loaded.push({ id: key, key, displayName: data.display_name ?? key, data: { ...data }, isBuiltin: false })
      }
    }
    setStyles(loaded)
    setAvailableStyleKeys(loaded.map(s => s.key))
    setStyleDisplayNames(Object.fromEntries(loaded.map(s => [s.key, s.displayName])))
    if (preset.style_mapping) setStyleMapping(preset.style_mapping)
  }, [selectedPreset])

  const close = () => setShowStyleSettings(false)

  const selectedStyle = styles.find(s => s.id === selectedStyleId)

  const updateStyleData = (id: string, patch: Partial<ParagraphStyleData>) => {
    setStyles(prev => prev.map(s => s.id === id ? { ...s, data: { ...s.data, ...patch } } : s))
  }

  const addStyle = (name: string, baseKey: string) => {
    const base = styles.find(s => s.key === baseKey)?.data
    const key = name.toLowerCase().replace(/\s+/g, '_')
    const newStyle: EditableStyle = {
      id: key, key, displayName: name,
      data: base ? { ...base } : { font: '함초롬바탕', size_pt: 10, bold: false, align: 'justify', indent_left_hwpunit: 0, space_before_hwpunit: 0, space_after_hwpunit: 0, line_height_percent: 160 },
      isBuiltin: false,
    }
    setStyles(prev => [...prev, newStyle])
    setSelectedStyleId(newStyle.id)
    setShowMapping(false)
  }

  const deleteStyle = (id: string) => {
    setStyles(prev => prev.filter(s => s.id !== id))
    if (selectedStyleId === id) setSelectedStyleId(null)
  }

  const handleSave = () => {
    // 웹에서는 localStorage에 저장
    const preset = getPresetData()
    if (!preset) return
    const paragraphStyles: Record<string, ParagraphStyleData & { display_name?: string }> = {}
    for (const s of styles) {
      paragraphStyles[s.key] = { ...s.data }
      if (s.displayName !== (STYLE_LABELS[s.key] ?? s.key) || !s.isBuiltin) {
        paragraphStyles[s.key].display_name = s.displayName
      }
    }
    const data = {
      ...preset,
      page: { ...preset.page, margin: { top_mm: pageMargin.top, bottom_mm: pageMargin.bottom, left_mm: pageMargin.left, right_mm: pageMargin.right } },
      paragraph_styles: paragraphStyles,
      style_mapping: styleMapping,
    }
    localStorage.setItem(`hwflow_preset_${selectedPreset}`, JSON.stringify(data))
    setAvailableStyleKeys(styles.map(s => s.key))
    setStyleDisplayNames(Object.fromEntries(styles.map(s => [s.key, s.displayName])))
    setSaveMessage('저장 완료')
    setTimeout(() => setSaveMessage(''), 2000)
  }

  const handleExport = () => {
    const preset = getPresetData()
    if (!preset) return
    const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${selectedPreset}.json`; a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = '.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const json = JSON.parse(text)
        if (!json.paragraph_styles) { setSaveMessage('유효한 스타일 파일이 아닙니다'); return }
        const name = json.meta?.name ?? file.name.replace('.json', '')
        localStorage.setItem(`hwflow_preset_${name}`, text)
        setSelectedPreset(name)
        setSaveMessage(`'${name}' 가져오기 완료`)
        setTimeout(() => setSaveMessage(''), 2000)
      } catch { setSaveMessage('가져오기 실패') }
    }
    input.click()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={close}>
      <div className="bg-white rounded-lg shadow-xl flex flex-col" style={{ width: 680, height: 600 }} onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="p-4 border-b space-y-2 shrink-0">
          <div className="flex items-center">
            <h2 className="text-lg font-bold">스타일 매니저</h2>
            <div className="flex-1" />
            {saveMessage && <span className={`text-xs ${saveMessage.includes('완료') ? 'text-green-600' : 'text-red-500'}`}>{saveMessage}</span>}
            <button onClick={close} className="ml-3 px-3 py-1.5 border rounded text-sm hover:bg-gray-50">닫기</button>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">프리셋:</span>
            <select value={selectedPreset} onChange={e => setSelectedPreset(e.target.value)}
              className="border rounded px-2 py-1 text-sm">
              {availablePresets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button onClick={handleSave} className="px-2 py-1 bg-navy-600 text-white rounded text-xs hover:bg-navy-700">저장</button>
            <div className="flex-1" />
            <button onClick={handleExport} className="text-xs text-gray-500 hover:underline">내보내기</button>
            <button onClick={handleImport} className="text-xs text-gray-500 hover:underline">가져오기</button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* 좌측: 목록 */}
          <div className="w-[200px] shrink-0 flex flex-col bg-gray-50 border-r">
            <button
              onClick={() => { setSelectedStyleId(null); setShowMapping(false) }}
              className={`text-left px-3 py-2 text-sm flex items-center gap-2 ${!showMapping && !selectedStyleId ? 'bg-navy-50' : 'hover:bg-gray-100'}`}
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              페이지 설정
            </button>
            <button
              onClick={() => { setShowMapping(true); setSelectedStyleId(null) }}
              className={`text-left px-3 py-2 text-sm flex items-center gap-2 ${showMapping ? 'bg-navy-50' : 'hover:bg-gray-100'}`}
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
              </svg>
              스타일 매핑
            </button>

            <hr className="my-1" />

            <div className="flex-1 overflow-y-auto">
              {styles.map(s => (
                <button key={s.id}
                  onClick={() => { setSelectedStyleId(s.id); setShowMapping(false) }}
                  className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 ${selectedStyleId === s.id ? 'bg-navy-50' : 'hover:bg-gray-100'}`}>
                  <span className={`w-2 h-2 rounded-full ${s.isBuiltin ? 'bg-navy-400' : 'bg-orange-400'}`} />
                  <span className="truncate flex-1">{s.displayName}</span>
                  {s.isBuiltin && <span className="text-[10px] text-gray-400">기본</span>}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 p-2 border-t">
              <button onClick={() => addStyle('새 스타일', 'body')} className="p-1 rounded hover:bg-gray-200">
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
              </button>
              {selectedStyle && !selectedStyle.isBuiltin && (
                <button onClick={() => deleteStyle(selectedStyle.id)} className="p-1 rounded hover:bg-gray-200">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* 우측: 편집 */}
          <div className="flex-1 overflow-y-auto p-5">
            {showMapping ? (
              <MappingPanel styles={styles} />
            ) : selectedStyle ? (
              <StyleEditForm style={selectedStyle} onUpdate={(patch) => updateStyleData(selectedStyle.id, patch)}
                onRename={name => setStyles(prev => prev.map(s => s.id === selectedStyle.id ? { ...s, displayName: name } : s))}
                onKeyChange={key => setStyles(prev => prev.map(s => s.id === selectedStyle.id ? { ...s, key } : s))} />
            ) : (
              <PageSettingsForm margin={pageMargin} onChange={setPageMargin} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function PageSettingsForm({ margin, onChange }: { margin: { top: number; bottom: number; left: number; right: number }; onChange: (m: typeof margin) => void }) {
  return (
    <div>
      <h3 className="text-lg font-bold mb-4">페이지 설정</h3>
      <div className="grid grid-cols-4 gap-4">
        {(['top', 'bottom', 'left', 'right'] as const).map(side => (
          <div key={side}>
            <label className="text-xs text-gray-400 block mb-1">{side === 'top' ? '상단' : side === 'bottom' ? '하단' : side === 'left' ? '좌측' : '우측'} 여백(mm)</label>
            <input type="number" value={margin[side]}
              onChange={e => onChange({ ...margin, [side]: +e.target.value })}
              className="w-full border rounded px-2 py-1 text-sm" />
          </div>
        ))}
      </div>
    </div>
  )
}

function StyleEditForm({ style, onUpdate, onRename, onKeyChange }: {
  style: EditableStyle; onUpdate: (patch: Partial<ParagraphStyleData>) => void
  onRename: (name: string) => void; onKeyChange: (key: string) => void
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">스타일 편집</h3>
        {!style.isBuiltin && <span className="text-xs text-orange-500">커스텀</span>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-gray-400 block mb-1">표시 이름</label>
          <input value={style.displayName} onChange={e => onRename(e.target.value)}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">키 (내부 ID)</label>
          {style.isBuiltin ? (
            <span className="text-sm text-gray-400">{style.key}</span>
          ) : (
            <input value={style.key} onChange={e => onKeyChange(e.target.value)}
              className="w-full border rounded px-2 py-1 text-sm" />
          )}
        </div>
      </div>

      <hr />

      <div>
        <h4 className="text-sm font-semibold mb-3 bg-navy-50 px-2 py-1 rounded inline-block">폰트</h4>
        <div className="grid grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1">서체</label>
            <FontSelect value={style.data.font} onChange={v => onUpdate({ font: v })} />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">크기(pt)</label>
            <input type="number" value={style.data.size_pt} onChange={e => onUpdate({ size_pt: +e.target.value })}
              className="w-full border rounded px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">굵기</label>
            <label className="flex items-center gap-1.5 mt-1 text-sm cursor-pointer">
              <input type="checkbox" checked={style.data.bold} onChange={e => onUpdate({ bold: e.target.checked })} className="accent-navy-500" />
              Bold
            </label>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">정렬</label>
            <select value={style.data.align} onChange={e => onUpdate({ align: e.target.value as ParagraphStyleData['align'] })}
              className="w-full border rounded px-2 py-1 text-sm">
              <option value="left">왼쪽</option><option value="center">가운데</option>
              <option value="right">오른쪽</option><option value="justify">양쪽</option>
            </select>
          </div>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold mb-3 bg-navy-50 px-2 py-1 rounded inline-block">단락</h4>
        <div className="grid grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1">줄간격(%)</label>
            <input type="number" value={style.data.line_height_percent} onChange={e => onUpdate({ line_height_percent: +e.target.value })}
              className="w-full border rounded px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">들여쓰기</label>
            <input type="number" value={style.data.indent_left_hwpunit} onChange={e => onUpdate({ indent_left_hwpunit: +e.target.value })}
              className="w-full border rounded px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">단락 전</label>
            <input type="number" value={style.data.space_before_hwpunit} onChange={e => onUpdate({ space_before_hwpunit: +e.target.value })}
              className="w-full border rounded px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">단락 후</label>
            <input type="number" value={style.data.space_after_hwpunit} onChange={e => onUpdate({ space_after_hwpunit: +e.target.value })}
              className="w-full border rounded px-2 py-1 text-sm" />
          </div>
        </div>
      </div>

      {NUMBERING_OPTIONS[style.key] && (
        <div>
          <h4 className="text-sm font-semibold mb-2 bg-navy-50 px-2 py-1 rounded inline-block">번호 매기기</h4>
          <p className="text-sm text-gray-500">{NUMBERING_OPTIONS[style.key]}</p>
        </div>
      )}
    </div>
  )
}

function MappingPanel({ styles }: { styles: EditableStyle[] }) {
  const { styleMapping, setStyleMapping, displayName } = useAppStore()
  const mapping = { ...styleMapping }

  return (
    <div className="space-y-5">
      <h3 className="text-lg font-bold">스타일 매핑</h3>
      <p className="text-sm text-gray-500">파서가 판단한 스타일을 원하는 스타일로 일괄 변환합니다.</p>

      <div className="bg-gray-50 rounded-lg p-4 space-y-3">
        {PARSER_KEYS.map(key => (
          <div key={key} className="flex items-center gap-3">
            <span className="w-24 text-right text-sm">{STYLE_LABELS[key] ?? key}</span>
            <span className="text-gray-400">→</span>
            <select
              value={mapping[key] ?? key}
              onChange={e => {
                const next = { ...mapping }
                if (e.target.value === key) delete next[key]; else next[key] = e.target.value
                setStyleMapping(next)
              }}
              className="border rounded px-2 py-1 text-sm flex-1"
            >
              {styles.map(s => <option key={s.key} value={s.key}>{s.displayName}</option>)}
            </select>
            {mapping[key] && mapping[key] !== key && (
              <>
                <svg className="w-3.5 h-3.5 text-orange-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M21.731 2.269a2.625 2.625 0 00-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 000-3.712zM19.513 8.199l-3.712-3.712-12.15 12.15a5.25 5.25 0 00-1.32 2.214l-.8 2.685a.75.75 0 00.933.933l2.685-.8a5.25 5.25 0 002.214-1.32L19.513 8.2z" />
                </svg>
                <button onClick={() => { const next = { ...mapping }; delete next[key]; setStyleMapping(next) }}
                  className="text-xs text-gray-400 hover:text-gray-600">↩</button>
              </>
            )}
          </div>
        ))}
      </div>

      <button onClick={() => setStyleMapping({})}
        disabled={Object.keys(styleMapping).length === 0}
        className="text-xs text-navy-500 hover:underline disabled:opacity-40">
        모든 매핑 초기화
      </button>
    </div>
  )
}

function FontSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { getPresetData } = useAppStore()
  const allFonts = useFontList()

  // 프리셋에서 사용 중인 폰트 수집
  const presetFontNames = new Set<string>()
  const ps = (getPresetData() as any)?.paragraph_styles ?? {}
  for (const sty of Object.values(ps) as any[]) {
    if (sty?.font) presetFontNames.add(sty.font)
  }

  const presetFonts = allFonts.filter(f => presetFontNames.has(f.name))
  const otherFonts = allFonts.filter(f => !presetFontNames.has(f.name))

  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full border rounded px-2 py-1 text-sm">
      {presetFonts.length > 0 && (
        <optgroup label="프리셋 폰트">
          {presetFonts.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
        </optgroup>
      )}
      <optgroup label="시스템 폰트">
        {otherFonts.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
      </optgroup>
    </select>
  )
}
