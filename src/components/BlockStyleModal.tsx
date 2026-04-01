import { useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import type { IRBlock, ParagraphStyleData } from '@/store/types'
import { STYLE_LABELS } from '@/store/types'
import { useFontList } from '@/lib/fonts'
import { Modal, ModalHeader, ModalSection, FieldLabel, inputClass, AlignIcon } from './Modal'

interface Props {
  block: IRBlock
}

export function BlockStyleModal({ block }: Props) {
  const {
    setShowBlockModal, blockOverrides, blockTypeOverrides, blockTextOverrides,
    setBlockOverride, setBlockTypeOverride, setBlockTextOverride,
    availableStyleKeys, displayName, styleFor,
  } = useAppStore()

  const [selectedType, setSelectedType] = useState(blockTypeOverrides[block.id] ?? block.type)
  const [editedText, setEditedText] = useState(blockTextOverrides[block.id] ?? block.text)
  const [useStyleOverride, setUseStyleOverride] = useState(!!blockOverrides[block.id])
  const [overrideStyle, setOverrideStyle] = useState<ParagraphStyleData>(
    blockOverrides[block.id]?.style ?? styleFor(selectedType)
  )

  const close = () => setShowBlockModal(false)

  const apply = () => {
    if (editedText !== block.text) setBlockTextOverride(block.id, editedText)
    else setBlockTextOverride(block.id, null)
    if (selectedType !== block.type) setBlockTypeOverride(block.id, selectedType)
    else setBlockTypeOverride(block.id, null)
    if (useStyleOverride) setBlockOverride(block.id, { style: overrideStyle })
    else setBlockOverride(block.id, null)
    close()
  }

  const updateStyle = (patch: Partial<ParagraphStyleData>) =>
    setOverrideStyle(prev => ({ ...prev, ...patch }))

  const loadDefaultForType = () => setOverrideStyle(styleFor(selectedType))

  return (
    <Modal onClose={close} width="500px" height="auto">
        <ModalHeader title="블록 수정" subtitle={block.text.slice(0, 60)} onClose={close} onApply={apply} />

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* 내용 */}
          <section>
            <SectionLabel>내용</SectionLabel>
            <textarea
              value={editedText}
              onChange={e => setEditedText(e.target.value)}
              className="w-full bg-white border border-app-border rounded-lg px-3 py-2 font-mono text-[12px] text-navy-800 min-h-[56px] max-h-[120px] resize-y outline-none focus:ring-1 focus:ring-navy-300 transition-shadow"
            />
          </section>

          {/* 단락 스타일 */}
          <section>
            <SectionLabel>단락 스타일</SectionLabel>
            <div className="bg-white rounded-lg border border-app-border p-3">
              {selectedType !== block.type && (
                <div className="flex items-center gap-2 text-[11px] text-app-muted mb-3 pb-2 border-b border-app-border/50">
                  <span>{STYLE_LABELS[block.type] ?? block.type}</span>
                  <svg className="w-3 h-3 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                  <span className="font-medium text-orange-500">{displayName(selectedType)}</span>
                </div>
              )}
              <div className="grid grid-cols-5 gap-1">
                {availableStyleKeys.map(key => (
                  <button
                    key={key}
                    onClick={() => { setSelectedType(key); if (!useStyleOverride) setOverrideStyle(styleFor(key)) }}
                    className={`py-1.5 text-[11px] rounded-md transition-colors ${
                      selectedType === key
                        ? 'bg-navy-600 text-white shadow-sm'
                        : 'text-navy-600 hover:bg-navy-50'
                    }`}
                  >
                    {displayName(key).replace(/ \(.*\)/, '')}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* 세부 스타일 */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <SectionLabel noMargin>세부 스타일</SectionLabel>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <div className={`w-8 h-[18px] rounded-full transition-colors relative ${useStyleOverride ? 'bg-navy-500' : 'bg-gray-300'}`}
                  onClick={() => setUseStyleOverride(!useStyleOverride)}>
                  <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform ${useStyleOverride ? 'translate-x-[16px]' : 'translate-x-[2px]'}`} />
                </div>
              </label>
            </div>

            {useStyleOverride && (
              <div className="bg-white rounded-lg border border-app-border p-4 space-y-4">
                {/* 폰트 */}
                <div>
                  <div className="text-[10px] font-semibold text-app-muted uppercase tracking-wider mb-2">폰트</div>
                  <div className="grid grid-cols-4 gap-2.5">
                    <FieldGroup label="서체">
                      <BlockFontSelect value={overrideStyle.font} onChange={v => updateStyle({ font: v })} />
                    </FieldGroup>
                    <FieldGroup label="크기(pt)">
                      <input type="number" value={overrideStyle.size_pt}
                        onChange={e => updateStyle({ size_pt: +e.target.value })}
                        className="w-full bg-[#f5f5f5] border border-app-border rounded-md px-2 py-1.5 text-[11px] text-navy-800 outline-none" />
                    </FieldGroup>
                    <FieldGroup label="굵기">
                      <button
                        onClick={() => updateStyle({ bold: !overrideStyle.bold })}
                        className={`w-full py-1.5 text-[11px] rounded-md border transition-colors ${
                          overrideStyle.bold
                            ? 'bg-navy-600 text-white border-navy-600'
                            : 'bg-[#f5f5f5] text-navy-600 border-app-border hover:bg-navy-50'
                        }`}
                      >
                        <strong>B</strong>
                      </button>
                    </FieldGroup>
                    <FieldGroup label="정렬">
                      <div className="flex border border-app-border rounded-md overflow-hidden">
                        {(['left', 'center', 'right', 'justify'] as const).map(a => (
                          <button key={a}
                            onClick={() => updateStyle({ align: a })}
                            className={`flex-1 py-1.5 text-[10px] transition-colors ${
                              overrideStyle.align === a ? 'bg-navy-600 text-white' : 'bg-[#f5f5f5] text-navy-600 hover:bg-navy-50'
                            }`}
                          >
                            {a === 'left' ? '←' : a === 'center' ? '↔' : a === 'right' ? '→' : '⇔'}
                          </button>
                        ))}
                      </div>
                    </FieldGroup>
                  </div>
                </div>

                {/* 단락 */}
                <div>
                  <div className="text-[10px] font-semibold text-app-muted uppercase tracking-wider mb-2">단락</div>
                  <div className="grid grid-cols-4 gap-2.5">
                    <FieldGroup label="줄간격(%)">
                      <input type="number" value={overrideStyle.line_height_percent}
                        onChange={e => updateStyle({ line_height_percent: +e.target.value })}
                        className="w-full bg-[#f5f5f5] border border-app-border rounded-md px-2 py-1.5 text-[11px] text-navy-800 outline-none" />
                    </FieldGroup>
                    <FieldGroup label="들여쓰기(pt)">
                      <input type="number" value={Math.round(overrideStyle.indent_left_hwpunit / 100)}
                        onChange={e => updateStyle({ indent_left_hwpunit: +e.target.value * 100 })}
                        className="w-full bg-[#f5f5f5] border border-app-border rounded-md px-2 py-1.5 text-[11px] text-navy-800 outline-none" />
                    </FieldGroup>
                    <FieldGroup label="단락 전(pt)">
                      <input type="number" value={Math.round(overrideStyle.space_before_hwpunit / 100)}
                        onChange={e => updateStyle({ space_before_hwpunit: +e.target.value * 100 })}
                        className="w-full bg-[#f5f5f5] border border-app-border rounded-md px-2 py-1.5 text-[11px] text-navy-800 outline-none" />
                    </FieldGroup>
                    <FieldGroup label="단락 후(pt)">
                      <input type="number" value={Math.round(overrideStyle.space_after_hwpunit / 100)}
                        onChange={e => updateStyle({ space_after_hwpunit: +e.target.value * 100 })}
                        className="w-full bg-[#f5f5f5] border border-app-border rounded-md px-2 py-1.5 text-[11px] text-navy-800 outline-none" />
                    </FieldGroup>
                  </div>
                </div>

                <button onClick={loadDefaultForType}
                  className="text-[11px] text-app-muted hover:text-navy-600 transition-colors">
                  프리셋 기본값으로 초기화
                </button>
              </div>
            )}
          </section>
        </div>
    </Modal>
  )
}

function SectionLabel({ children, noMargin }: { children: React.ReactNode; noMargin?: boolean }) {
  return (
    <div className={`text-[11px] font-semibold text-navy-700 ${noMargin ? '' : 'mb-2'}`}>
      {children}
    </div>
  )
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] text-app-muted mb-1">{label}</div>
      {children}
    </div>
  )
}

function BlockFontSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { getPresetData } = useAppStore()
  const allFonts = useFontList()

  const presetFontNames = new Set<string>()
  const ps = (getPresetData() as any)?.paragraph_styles ?? {}
  for (const sty of Object.values(ps) as any[]) {
    if (sty?.font) presetFontNames.add(sty.font)
  }

  const presetFonts = allFonts.filter(f => presetFontNames.has(f.name))
  const otherFonts = allFonts.filter(f => !presetFontNames.has(f.name))

  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full bg-[#f5f5f5] border border-app-border rounded-md px-2 py-1.5 text-[11px] text-navy-800 outline-none">
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
