import { useCallback, useState, useRef } from 'react'
import { useAppStore, irBlockFromDict } from '@/store/useAppStore'
// @ts-ignore
import { parseMarkdown } from '@/lib/parser_markdown'
// @ts-ignore
import { parseDocx } from '@/lib/parser_docx'

export function FileInput() {
  const { setIRBlocks, setDocumentTitle, setSelectedFileName, setConversionMessage } = useAppStore()
  const [isDragging, setIsDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    console.log('[HWFlow] 파일 선택:', file.name, file.type, file.size)
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!['md', 'txt', 'markdown', 'docx', 'pdf'].includes(ext)) {
      setConversionMessage('지원하지 않는 파일 형식입니다. (.md, .txt, .docx, .pdf)')
      return
    }

    setSelectedFileName(file.name)
    setConversionMessage(`파싱 중: ${file.name}`)

    try {
      let blocks: Record<string, unknown>[]

      if (ext === 'pdf') {
        const { parsePdf } = await import('@/lib/parser_pdf')
        const arrayBuffer = await file.arrayBuffer()
        blocks = await parsePdf(arrayBuffer) as Record<string, unknown>[]
      } else if (ext === 'docx') {
        const arrayBuffer = await file.arrayBuffer()
        const bytes = new Uint8Array(arrayBuffer)
        let binary = ''
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
        const base64 = btoa(binary)
        blocks = parseDocx(base64)
      } else {
        const text = await file.text()
        blocks = parseMarkdown(text)
      }

      if (!blocks || blocks.length === 0) {
        setConversionMessage('파싱 실패: 결과가 비어있습니다.')
        return
      }

      const irBlocks = blocks.map(b => irBlockFromDict(b))
      setIRBlocks(irBlocks)
      setDocumentTitle(file.name.replace(/\.[^.]+$/, ''))
      setConversionMessage('')
    } catch (e) {
      console.error('[HWFlow] 파싱 오류:', e)
      setConversionMessage(`파싱 오류: ${e instanceof Error ? e.message : String(e)}`)
    }
  }, [setIRBlocks, setDocumentTitle, setSelectedFileName, setConversionMessage])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const onFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  return (
    <div
      className="flex-1 flex flex-col items-center justify-center gap-4 p-8 bg-[#eeeeee]"
      onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
    >
      <div className={`w-full max-w-md p-12 rounded-lg border-2 border-dashed transition-colors text-center ${
        isDragging ? 'border-navy-400 bg-navy-50' : 'border-app-border bg-app-surface'
      }`}>
        <svg className="w-12 h-12 mx-auto mb-4 text-navy-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
        <p className="text-base text-navy-400 mb-1">파일을 드래그하거나 클릭하여 선택</p>
        <p className="text-sm text-app-muted">.docx, .md, .txt, .pdf</p>
        <p className="text-[10px] text-app-muted mb-4">PDF는 Chrome/Edge 브라우저에서만 지원됩니다</p>
        <button
          onClick={() => fileRef.current?.click()}
          className="px-4 py-2 rounded-lg border border-app-border bg-app-surface text-[13px] text-navy-600 hover:bg-navy-50 transition-colors"
        >
          파일 선택
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".md,.txt,.markdown,.docx,.pdf"
          onChange={onFileSelect}
          className="hidden"
        />
      </div>
    </div>
  )
}
