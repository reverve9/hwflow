import type { ReactNode } from 'react'

interface ModalProps {
  onClose: () => void
  width?: string
  height?: string
  children: ReactNode
}

interface ModalHeaderProps {
  title: string
  subtitle?: string
  onClose: () => void
  onApply?: () => void
  applyLabel?: string
  extra?: ReactNode
}

export function Modal({ onClose, width = '680px', height = '600px', children }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-[#f5f5f5] rounded-xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: `min(90vw, ${width})`, ...(height === 'auto' ? { maxHeight: '85vh' } : { height: `min(85vh, ${height})` }) }}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

export function ModalHeader({ title, subtitle, onClose, onApply, applyLabel = '적용', extra }: ModalHeaderProps) {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5 border-b border-app-border shrink-0">
      <div className="min-w-0">
        <h3 className="text-[13px] font-semibold text-navy-800">{title}</h3>
        {subtitle && <p className="text-[11px] text-app-muted truncate max-w-[320px] mt-0.5">{subtitle}</p>}
      </div>
      {extra}
      <div className="flex-1" />
      <div className="flex gap-2 shrink-0">
        <button onClick={onClose} className="px-3 py-1 text-[12px] rounded-md border border-app-border text-navy-600 hover:bg-white transition-colors">닫기</button>
        {onApply && (
          <button onClick={onApply} className="px-3 py-1 text-[12px] rounded-md bg-navy-600 text-white hover:bg-navy-700 transition-colors shadow-sm">{applyLabel}</button>
        )}
      </div>
    </div>
  )
}

export function ModalSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-app-muted uppercase tracking-wider mb-2">{label}</div>
      {children}
    </div>
  )
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <div className="text-[10px] text-app-muted mb-1">{children}</div>
}

export const inputClass = 'w-full bg-white border border-app-border rounded-md px-2 py-1.5 text-[11px] text-navy-800 outline-none'
export const selectClass = inputClass
