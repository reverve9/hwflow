import { useAppStore, irBlockFromDict } from '@/store/useAppStore'
// @ts-ignore
import { parseMarkdown } from '@/lib/parser_markdown'

export function PasteInput() {
  const { pasteText, setPasteText, setIRBlocks, setDocumentTitle, setConversionMessage } = useAppStore()

  const handlePreview = () => {
    if (!pasteText.trim()) return
    try {
      const blocks = parseMarkdown(pasteText)
      const irBlocks = blocks.map((b: Record<string, unknown>) => irBlockFromDict(b))
      setIRBlocks(irBlocks)
      if (irBlocks.length > 0 && !useAppStore.getState().documentTitle) {
        setDocumentTitle(irBlocks[0].text.slice(0, 30))
      }
      setConversionMessage(`파싱 완료: ${irBlocks.length}개 블록`)
    } catch (e) {
      setConversionMessage(`파싱 오류: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      <textarea
        value={pasteText}
        onChange={e => setPasteText(e.target.value)}
        placeholder="마크다운 텍스트를 붙여넣으세요..."
        className="flex-1 p-4 font-mono text-[13px] resize-none border-none outline-none bg-app-surface text-navy-800 placeholder:text-app-muted"
      />
      <div className="flex items-center justify-between px-3 py-2 bg-app-subtle border-t border-app-border">
        <span className="text-xs text-app-muted">{pasteText.length}자</span>
        <button
          onClick={handlePreview}
          disabled={!pasteText.trim()}
          className="px-3 py-1.5 rounded text-sm bg-navy-600 text-white hover:bg-navy-700 disabled:opacity-40"
        >
          미리보기
        </button>
      </div>
    </div>
  )
}
