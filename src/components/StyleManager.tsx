import { useState, useEffect } from 'react'
import { useAppStore } from '@/store/useAppStore'
import type { ParagraphStyleData } from '@/store/types'
import { STYLE_LABELS, NUMBERING_OPTIONS } from '@/store/types'
import { useFontList } from '@/lib/fonts'
import { Modal, ModalHeader, ModalSection, FieldLabel, inputClass, selectClass, AlignIcon } from './Modal'

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
    styleMapping, setStyleMapping, reloadPresets,
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
    const baseId = name.toLowerCase().replace(/\s+/g, '_')
    // 중복 ID 방지
    let key = baseId
    let n = 1
    while (styles.some(s => s.id === key)) {
      key = `${baseId}_${++n}`
    }
    const newStyle: EditableStyle = {
      id: key, key, displayName: n > 1 ? `${name} ${n}` : name,
      data: base ? { ...base } : { font: 'HCR Batang', size_pt: 10, bold: false, align: 'justify', indent_left_hwpunit: 0, space_before_hwpunit: 0, space_after_hwpunit: 0, line_height_percent: 160 },
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
    reloadPresets() // 미리보기 즉시 반영
    setSaveMessage('저장 완료')
    setTimeout(() => setSaveMessage(''), 3000)
  }

  const handleNewPreset = () => {
    const preset = getPresetData()
    const baseName = preset?.meta?.name ?? selectedPreset
    const name = prompt('새 프리셋 이름:', `${baseName} 복사본`)
    if (!name?.trim()) return
    const id = name.trim().replace(/\s+/g, '_')
    // 현재 편집 중인 스타일로 복제
    const paragraphStyles: Record<string, ParagraphStyleData & { display_name?: string }> = {}
    for (const s of styles) {
      paragraphStyles[s.key] = { ...s.data }
      if (s.displayName !== (STYLE_LABELS[s.key] ?? s.key) || !s.isBuiltin) {
        paragraphStyles[s.key].display_name = s.displayName
      }
    }
    const data = {
      ...(preset ?? {}),
      meta: { ...(preset?.meta ?? {}), name: name.trim() },
      page: { ...(preset?.page ?? {}), margin: { top_mm: pageMargin.top, bottom_mm: pageMargin.bottom, left_mm: pageMargin.left, right_mm: pageMargin.right } },
      paragraph_styles: paragraphStyles,
      style_mapping: styleMapping,
    }
    localStorage.setItem(`hwflow_preset_${id}`, JSON.stringify(data))
    reloadPresets()
    setSelectedPreset(id)
    setSaveMessage(`'${name.trim()}' 복제 완료`)
    setTimeout(() => setSaveMessage(''), 2000)
  }

  const handleDeletePreset = () => {
    const key = `hwflow_preset_${selectedPreset}`
    if (!localStorage.getItem(key)) {
      setSaveMessage('기본 프리셋은 삭제할 수 없습니다')
      setTimeout(() => setSaveMessage(''), 2000)
      return
    }
    if (!confirm(`'${availablePresets.find(p => p.id === selectedPreset)?.name ?? selectedPreset}' 프리셋을 삭제하시겠습니까?`)) return
    localStorage.removeItem(key)
    reloadPresets()
    setSelectedPreset(availablePresets[0]?.id ?? '공문서_표준')
    setSaveMessage('삭제 완료')
    setTimeout(() => setSaveMessage(''), 2000)
  }

  const handleRenamePreset = () => {
    const key = `hwflow_preset_${selectedPreset}`
    const raw = localStorage.getItem(key)
    if (!raw) { setSaveMessage('이름을 변경할 수 없는 프리셋입니다'); setTimeout(() => setSaveMessage(''), 2000); return }
    const current = availablePresets.find(p => p.id === selectedPreset)?.name ?? selectedPreset
    const name = prompt('프리셋 이름:', current)
    if (!name?.trim() || name.trim() === current) return
    try {
      const data = JSON.parse(raw)
      data.meta = { ...(data.meta ?? {}), name: name.trim() }
      localStorage.setItem(key, JSON.stringify(data))
      reloadPresets()
      setSaveMessage('이름 변경 완료')
      setTimeout(() => setSaveMessage(''), 2000)
    } catch {}
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
    <Modal onClose={close} width="680px" height="600px">
        {/* 헤더 */}
        <ModalHeader title="스타일 매니저" onClose={close} onApply={handleSave} applyLabel="저장"
          extra={
            <div className="flex items-center gap-2 ml-3">
              {saveMessage && (
                <span className={`text-[11px] px-2 py-0.5 rounded-md ${saveMessage.includes('완료') ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                  {saveMessage.includes('완료') ? '✓ ' : ''}{saveMessage}
                </span>
              )}
            </div>
          }
        />
        {/* 프리셋 바 */}
        <div className="flex items-center gap-1.5 px-5 py-2 border-b border-app-border/50 shrink-0">
          <select value={selectedPreset} onChange={e => setSelectedPreset(e.target.value)}
            className={`${selectClass} w-auto max-w-[140px]`}>
            {availablePresets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button onClick={handleNewPreset} className="text-[11px] text-app-muted hover:text-navy-600 transition-colors" title="새 프리셋">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button onClick={handleDeletePreset} className="text-[11px] text-app-muted hover:text-navy-600 transition-colors" title="프리셋 삭제">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
            </svg>
          </button>
          <button onClick={handleRenamePreset} className="text-[11px] text-app-muted hover:text-navy-600 transition-colors" title="이름 변경">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
            </svg>
          </button>
          <div className="flex-1" />
          <button onClick={handleExport} className="text-[11px] text-app-muted hover:text-navy-600 transition-colors">내보내기</button>
          <button onClick={handleImport} className="text-[11px] text-app-muted hover:text-navy-600 transition-colors">가져오기</button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* 좌측: 목록 */}
          <div className="w-[200px] shrink-0 flex flex-col border-r border-app-border">
            <button
              onClick={() => { setSelectedStyleId(null); setShowMapping(false) }}
              className={`text-left px-3 py-2 text-[11px] text-navy-700 flex items-center gap-2 ${!showMapping && !selectedStyleId ? 'bg-navy-50' : 'hover:bg-white'} transition-colors`}
            >
              <svg className="w-3.5 h-3.5 text-app-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              페이지 설정
            </button>
            <button
              onClick={() => { setShowMapping(true); setSelectedStyleId(null) }}
              className={`text-left px-3 py-2 text-[11px] text-navy-700 flex items-center gap-2 ${showMapping ? 'bg-navy-50' : 'hover:bg-white'} transition-colors`}
            >
              <svg className="w-3.5 h-3.5 text-app-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
              </svg>
              스타일 매핑
              {Object.keys(styleMapping).length > 0 && (
                <span className="ml-auto text-[10px] text-orange-500">{Object.keys(styleMapping).length}</span>
              )}
            </button>

            <hr className="border-app-border/50" />

            <div className="flex-1 overflow-y-auto">
              {styles.map(s => (
                <button key={s.id}
                  onClick={() => { setSelectedStyleId(s.id); setShowMapping(false) }}
                  className={`w-full text-left px-3 py-1.5 text-[11px] text-navy-700 flex items-center gap-2 ${selectedStyleId === s.id ? 'bg-navy-50' : 'hover:bg-white'} transition-colors`}>
                  <span className={`w-2 h-2 rounded-full ${s.isBuiltin ? 'bg-navy-400' : 'bg-orange-400'}`} />
                  <span className="truncate flex-1">{s.displayName}</span>
                  {s.isBuiltin && <span className="text-[10px] text-app-muted">기본</span>}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 p-2 border-t border-app-border/50">
              <button onClick={() => addStyle('새 스타일', 'body')} className="p-1 rounded hover:bg-white transition-colors">
                <svg className="w-3.5 h-3.5 text-app-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
              </button>
              {selectedStyle && !selectedStyle.isBuiltin && (
                <button onClick={() => deleteStyle(selectedStyle.id)} className="p-1 rounded hover:bg-white transition-colors">
                  <svg className="w-3.5 h-3.5 text-app-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
    </Modal>
  )
}

function PageSettingsForm({ margin, onChange }: { margin: { top: number; bottom: number; left: number; right: number }; onChange: (m: typeof margin) => void }) {
  return (
    <div>
      <ModalSection label="페이지 여백">
        <div className="grid grid-cols-4 gap-3">
          {(['top', 'bottom', 'left', 'right'] as const).map(side => (
            <div key={side}>
              <FieldLabel>{side === 'top' ? '상단' : side === 'bottom' ? '하단' : side === 'left' ? '좌측' : '우측'} (mm)</FieldLabel>
              <input type="number" value={margin[side]}
                onChange={e => onChange({ ...margin, [side]: +e.target.value })}
                className={inputClass} />
            </div>
          ))}
        </div>
      </ModalSection>
    </div>
  )
}

function StyleEditForm({ style, onUpdate, onRename, onKeyChange }: {
  style: EditableStyle; onUpdate: (patch: Partial<ParagraphStyleData>) => void
  onRename: (name: string) => void; onKeyChange: (key: string) => void
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-semibold text-navy-800">스타일 편집</div>
        {!style.isBuiltin && <span className="text-[10px] text-orange-500">커스텀</span>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>표시 이름</FieldLabel>
          <input value={style.displayName} onChange={e => onRename(e.target.value)} className={inputClass} />
        </div>
        <div>
          <FieldLabel>키 (내부 ID)</FieldLabel>
          {style.isBuiltin ? (
            <span className="text-[11px] text-app-muted">{style.key}</span>
          ) : (
            <input value={style.key} onChange={e => onKeyChange(e.target.value)} className={inputClass} />
          )}
        </div>
      </div>

      <hr className="border-app-border/50" />

      <ModalSection label="폰트">
        <div className="grid grid-cols-4 gap-3">
          <div>
            <FieldLabel>서체</FieldLabel>
            <FontSelect value={style.data.font} onChange={v => onUpdate({ font: v })} />
          </div>
          <div>
            <FieldLabel>크기(pt)</FieldLabel>
            <input type="number" value={style.data.size_pt} onChange={e => onUpdate({ size_pt: +e.target.value })} className={inputClass} />
          </div>
          <div>
            <FieldLabel>굵기</FieldLabel>
            <button
              onClick={() => onUpdate({ bold: !style.data.bold })}
              className={`w-full py-1.5 text-[11px] rounded-md border transition-colors ${
                style.data.bold ? 'bg-navy-600 text-white border-navy-600' : 'bg-white text-navy-600 border-app-border hover:bg-navy-50'
              }`}
            ><strong>B</strong></button>
          </div>
          <div>
            <FieldLabel>정렬</FieldLabel>
            <div className="flex border border-app-border rounded-md overflow-hidden">
              {(['left', 'center', 'right', 'justify'] as const).map(a => (
                <button key={a} onClick={() => onUpdate({ align: a })}
                  className={`flex-1 py-1.5 text-[10px] transition-colors ${style.data.align === a ? 'bg-navy-600 text-white' : 'bg-white text-navy-600 hover:bg-navy-50'}`}>
                  {a === 'left' ? '←' : a === 'center' ? '↔' : a === 'right' ? '→' : '⇔'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </ModalSection>

      <ModalSection label="단락">
        <div className="grid grid-cols-4 gap-3">
          <div>
            <FieldLabel>줄간격(%)</FieldLabel>
            <input type="number" value={style.data.line_height_percent} onChange={e => onUpdate({ line_height_percent: +e.target.value })} className={inputClass} />
          </div>
          <div>
            <FieldLabel>들여쓰기(pt)</FieldLabel>
            <input type="number" value={Math.round(style.data.indent_left_hwpunit / 100)} onChange={e => onUpdate({ indent_left_hwpunit: +e.target.value * 100 })} className={inputClass} />
          </div>
          <div>
            <FieldLabel>단락 전(pt)</FieldLabel>
            <input type="number" value={Math.round(style.data.space_before_hwpunit / 100)} onChange={e => onUpdate({ space_before_hwpunit: +e.target.value * 100 })} className={inputClass} />
          </div>
          <div>
            <FieldLabel>단락 후(pt)</FieldLabel>
            <input type="number" value={Math.round(style.data.space_after_hwpunit / 100)} onChange={e => onUpdate({ space_after_hwpunit: +e.target.value * 100 })} className={inputClass} />
          </div>
        </div>
      </ModalSection>

      {NUMBERING_OPTIONS[style.key] && (
        <ModalSection label="번호 매기기">
          <p className="text-[11px] text-app-muted">{NUMBERING_OPTIONS[style.key]}</p>
        </ModalSection>
      )}
    </div>
  )
}

function MappingPanel({ styles }: { styles: EditableStyle[] }) {
  const { styleMapping, setStyleMapping, irBlocks } = useAppStore()

  // 파싱된 블록에서 실제 사용된 타입 (table, image 제외)
  const parsedTypes = [...new Set(irBlocks.map(b => b.type).filter(t => !['table', 'image'].includes(t)))]
  // 수동으로 추가된 매핑 (파싱 타입에 없는 것)
  const manualKeys = Object.keys(styleMapping).filter(k => !parsedTypes.includes(k) && PARSER_KEYS.includes(k))
  // 전체 표시 키: 파싱된 타입 + 수동 추가
  const visibleKeys = [...parsedTypes, ...manualKeys]
  // 추가 가능한 키
  const addableKeys = PARSER_KEYS.filter(k => !visibleKeys.includes(k))

  const handleAdd = () => {
    if (addableKeys.length === 0) return
    const key = addableKeys[0]
    const target = styles.find(s => s.key !== key)?.key ?? key
    setStyleMapping({ ...styleMapping, [key]: target })
  }

  const handleRemove = (key: string) => {
    const next = { ...styleMapping }
    delete next[key]
    setStyleMapping(next)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[13px] font-semibold text-navy-800">스타일 매핑</div>
          <p className="text-[11px] text-app-muted mt-1">파서가 판단한 스타일을 다른 스타일로 변환합니다.</p>
        </div>
        <button onClick={handleAdd} disabled={addableKeys.length === 0}
          className="text-[11px] px-2.5 py-1 rounded-md bg-navy-600 text-white hover:bg-navy-700 disabled:opacity-30 transition-colors">
          + 추가
        </button>
      </div>

      {visibleKeys.length === 0 ? (
        <div className="bg-white rounded-lg border border-app-border p-6 text-center">
          <p className="text-[11px] text-app-muted">매핑이 없습니다.</p>
          <p className="text-[10px] text-app-muted mt-1">문서를 불러오면 파싱된 스타일이 자동 표시됩니다.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-app-border p-4 space-y-3">
          {visibleKeys.map(key => {
            const isParsed = parsedTypes.includes(key)
            const isChanged = styleMapping[key] && styleMapping[key] !== key
            return (
              <div key={key} className="flex items-center gap-3">
                <span className={`text-[11px] w-[120px] shrink-0 flex items-center gap-1.5 ${isParsed ? 'text-navy-700' : 'text-app-muted'}`}>
                  {isParsed && <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" title="파싱됨" />}
                  {STYLE_LABELS[key] ?? key}
                </span>
                <span className="text-app-muted">→</span>
                <select value={styleMapping[key] ?? key} onChange={e => {
                  const val = e.target.value
                  const next = { ...styleMapping }
                  if (val === key) delete next[key]; else next[key] = val
                  setStyleMapping(next)
                }} className={`${selectClass} flex-1`}>
                  {styles.map(s => <option key={s.key} value={s.key}>{s.displayName}</option>)}
                </select>
                {/* 파싱된 항목: 변경됐으면 초기화, 수동 항목: 삭제 */}
                {isParsed ? (
                  isChanged && (
                    <button onClick={() => handleRemove(key)}
                      className="p-1 rounded hover:bg-red-50 transition-colors" title="기본값으로 초기화">
                      <svg className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )
                ) : (
                  <button onClick={() => handleRemove(key)}
                    className="p-1 rounded hover:bg-red-50 transition-colors" title="매핑 삭제">
                    <svg className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {Object.keys(styleMapping).length > 0 && (
        <button onClick={() => setStyleMapping({})}
          className="text-[11px] text-app-muted hover:text-red-500 transition-colors">
          모든 매핑 초기화
        </button>
      )}
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
