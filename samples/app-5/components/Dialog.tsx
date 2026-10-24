import { type ReactNode, useEffect, useRef } from 'react'
import { CloseIcon } from './icons'

/** A dialog over the window, on the browser's own <dialog>: Escape and a press on the dark around it close it. */
export function Dialog({
  label,
  onClose,
  className,
  children,
}: {
  label: string
  onClose: () => void
  className: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    // The first HTML draws it open, so it shows before the page lives; then it is made modal.
    const dialog = ref.current
    if (!dialog) return
    if (dialog.open) dialog.close()
    dialog.showModal()
    // The focus starts on the dialog itself, not on its first link, as the window of the product shows it.
    dialog.focus()
  }, [])
  return (
    <dialog
      ref={ref}
      className="backdrop"
      open
      tabIndex={-1}
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
      onKeyDown={() => undefined}
    >
      <div className={className}>{children}</div>
    </dialog>
  )
}

export function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" className="x" aria-label="Close" onClick={onClose}>
      <CloseIcon />
    </button>
  )
}
