import type { ReactNode } from 'react'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
}

export function Modal({ title, onClose, children }: ModalProps) {
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal" role="dialog" aria-label={title}>
        <header className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose}>
            ✕
          </button>
        </header>
        {children}
      </div>
    </div>
  )
}
