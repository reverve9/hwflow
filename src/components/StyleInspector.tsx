import { useAppStore } from '@/store/useAppStore'
import { STYLE_LABELS } from '@/store/types'

function hwpunitToMM(value: number): string {
  return (value / 283.46).toFixed(1) + 'mm'
}

const ALIGN_LABELS: Record<string, string> = {
  left: '왼쪽', center: '가운데', right: '오른쪽', justify: '양쪽 정렬',
}

export function StyleInspector() {
  const {
    selectedBlock: getSelected, effectiveType, displayName, setShowInspector,
    styleFor,
  } = useAppStore()

  const block = getSelected()

  return (
    <div className="h-full flex flex-col bg-[#f5f5f5]">
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-3 py-3.5 bg-[#f5f5f5] border-b border-app-border">
        <svg className="w-3.5 h-3.5 text-app-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <span className="text-[13px] font-semibold text-navy-800">스타일 인스펙터</span>
        <div className="flex-1" />
        <button onClick={() => setShowInspector(false)} className="text-app-muted hover:text-navy-600 transition-colors">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {block ? (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* 단락 스타일 */}
          <Section title="단락 스타일">
            <Row label="원본" value={displayName(block.type)} />
            {(() => {
              const eType = effectiveType(block)
              return eType !== block.type
                ? <Row label="적용" value={displayName(eType)} highlight />
                : <Row label="적용" value={displayName(eType)} />
            })()}
          </Section>

          {/* 폰트 */}
          {(() => {
            const eType = effectiveType(block)
            const style = styleFor(eType)
            return (
              <>
                <Section title="폰트">
                  <Row label="서체" value={style.font} />
                  <Row label="크기" value={`${style.size_pt}pt`} />
                  <Row label="굵기" value={style.bold ? 'Bold' : 'Regular'} />
                </Section>
                <Section title="단락">
                  <Row label="정렬" value={ALIGN_LABELS[style.align] ?? style.align} />
                  <Row label="줄간격" value={`${style.line_height_percent}%`} />
                  <Row label="들여쓰기" value={hwpunitToMM(style.indent_left_hwpunit)} />
                  <Row label="단락 전" value={hwpunitToMM(style.space_before_hwpunit)} />
                  <Row label="단락 후" value={hwpunitToMM(style.space_after_hwpunit)} />
                </Section>
              </>
            )
          })()}

          {/* 내용 미리보기 */}
          <Section title="내용 미리보기">
            <p className="text-[11px] text-app-muted leading-relaxed line-clamp-5">{block.text}</p>
          </Section>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-app-muted gap-3 px-4">
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
              d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59" />
          </svg>
          <p className="text-[12px] text-center leading-relaxed">단락을 클릭하면<br />스타일 정보가 여기에 표시됩니다</p>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[10px] font-semibold text-app-muted uppercase tracking-wider mb-1.5">{title}</h4>
      <div className="bg-white rounded-md p-2.5 space-y-0.5 border border-app-border/50 shadow-sm">
        {children}
      </div>
    </div>
  )
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center text-[12px]">
      <span className="text-app-muted w-14 shrink-0">{label}</span>
      <span className={`font-medium ${highlight ? 'text-orange-500' : 'text-navy-700'}`}>{value}</span>
    </div>
  )
}
