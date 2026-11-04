import { useEffect, useId, useRef } from 'react'

export function Modal({
  open,
  title,
  description,
  confirmText = '好',
  cancelText,
  tone = 'moss',
  onConfirm,
  onClose,
  children,
  busy = false
}) {
  const titleId = useId()
  const firstField = useRef(null)
  const closeRef = useRef(onClose)
  const busyRef = useRef(busy)

  useEffect(() => {
    closeRef.current = onClose
    busyRef.current = busy
  })

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape' && !busyRef.current) closeRef.current?.()
    }
    window.addEventListener('keydown', onKey)
    const field = firstField.current?.querySelector('input, textarea')
    field?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  return (
    <div className="mask" onClick={() => !busy && onClose?.()} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>{title}</h2>
        {description ? <p className="modal-copy">{description}</p> : null}
        <div ref={firstField}>{children}</div>
        <div className={`modal-actions ${cancelText ? 'pair' : 'solo'}`}>
          {cancelText ? (
            <button type="button" className="btn btn-quiet" onClick={onClose} disabled={busy}>
              {cancelText}
            </button>
          ) : null}
          <button type="button" className={`btn btn-${tone}`} onClick={onConfirm} disabled={busy}>
            {busy ? '稍等…' : confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

export function Sheet({ open, options, onPick, onClose }) {
  const closeRef = useRef(onClose)

  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') closeRef.current?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  return (
    <div className="mask sheet-mask" onClick={onClose} role="presentation">
      <div className="sheet" role="menu" onClick={(event) => event.stopPropagation()}>
        {options.map((item) => (
          <button key={item.type} type="button" className="sheet-item" role="menuitem" onClick={() => onPick(item.type)}>
            <span>{item.icon}</span>
            {item.label}
          </button>
        ))}
        <button type="button" className="sheet-cancel" onClick={onClose}>
          取消
        </button>
      </div>
    </div>
  )
}
