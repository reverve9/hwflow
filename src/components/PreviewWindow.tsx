import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DocumentPreview } from './DocumentPreview'

interface Props {
  onClose: () => void
}

export function PreviewWindow({ onClose }: Props) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const popupRef = useRef<Window | null>(null)
  const closedByUs = useRef(false)

  useEffect(() => {
    // 이미 열린 창이 있으면 재사용
    let popup = popupRef.current
    if (!popup || popup.closed) {
      popup = window.open('', 'hwflow-preview', 'width=860,height=1150')
      popupRef.current = popup
    }
    if (!popup) return

    popup.document.title = 'HWFlow — 미리보기'

    // 기존 내용 초기화
    popup.document.head.innerHTML = ''
    popup.document.body.innerHTML = ''

    // Tailwind CSS 복사
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach(s => {
      popup!.document.head.appendChild(s.cloneNode(true))
    })

    popup.document.body.style.margin = '0'
    popup.document.body.style.overflow = 'hidden'

    const root = popup.document.createElement('div')
    root.id = 'preview-root'
    root.style.height = '100vh'
    popup.document.body.appendChild(root)

    setContainer(root)

    const handleUnload = () => {
      if (!closedByUs.current) onClose()
    }
    popup.addEventListener('beforeunload', handleUnload)

    return () => {
      popup!.removeEventListener('beforeunload', handleUnload)
    }
  }, [onClose])

  // 컴포넌트 언마운트 시 창 닫기
  useEffect(() => {
    return () => {
      closedByUs.current = true
      popupRef.current?.close()
    }
  }, [])

  if (!container) return null

  return createPortal(
    <div className="h-screen">
      <DocumentPreview />
    </div>,
    container,
  )
}
