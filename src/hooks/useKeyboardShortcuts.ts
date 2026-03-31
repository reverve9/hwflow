import { useEffect } from 'react'
import { useAppStore } from '@/store/useAppStore'

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

      // Ctrl/Cmd+Z — Undo (텍스트 입력 중이면 브라우저 기본 동작)
      if (mod && e.key === 'z' && !e.shiftKey && !isInput) {
        e.preventDefault()
        useAppStore.getState().undo()
        return
      }

      // Ctrl/Cmd+Shift+Z 또는 Ctrl/Cmd+Y — Redo
      if (mod && ((e.key === 'z' && e.shiftKey) || e.key === 'y') && !isInput) {
        e.preventDefault()
        useAppStore.getState().redo()
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}
