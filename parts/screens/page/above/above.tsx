import type { Drawable } from '../../borrowed/react.ts'
import { useLayoutEffect, useRef, useState } from '../../borrowed/react.ts'
import { useStore } from '../context.ts'
import type { Side } from '../store.ts'
import type { Page, ViewRecord } from '../types.ts'
import { Own } from '../view.tsx'
import { holdPart } from '../parts.ts'

// What takes the focus inside a dialog, as a browser moves it with Tab.
const focusable = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'

/** Where the dialog stands: in the middle, as the browser puts it, or with no room between it and an edge. */
function alongOf(side: Side | undefined): Record<string, number> | undefined {
  if (side === 'top') return { marginBlockStart: 0 }
  if (side === 'bottom') return { marginBlockEnd: 0 }
  if (side === 'start') return { marginInlineStart: 0 }
  return side === 'end' ? { marginInlineEnd: 0 } : undefined
}

/**
 * A screen opened above the one that is shown: drawn inside the browser's own dialog, over the screen underneath,
 * which the dialog keeps from the pointer, the keyboard and a screen reader. It is named by its title. Escape and
 * a press outside it close it, which puts the address of the screen underneath back.
 */
export function Above(o: {
  record: ViewRecord
  upper: {
    page: Page
    state: Record<string, unknown>
    set(values: Record<string, unknown>): void
    from?: Element
    side?: Side
  }
}): Drawable {
  const store = useStore()
  const element = useRef<HTMLDialogElement>(null)
  // What had the focus, or was pressed to open it where a browser gives a pressed link no focus, takes it back.
  const opener = useRef(o.upper.from ?? document.activeElement)
  const [label, setLabel] = useState('')
  useLayoutEffect(() => {
    const dialog = element.current
    if (!dialog) return undefined
    if (!dialog.open) dialog.showModal()
    // Escape asks the dialog to close: the page closes the screen above, and the dialog with it.
    const cancel = (event: Event): void => {
      event.preventDefault()
      store.closeAbove?.()
    }
    // A press on the dialog itself, and not on what it holds, is a press on the backdrop outside it.
    const press = (event: MouseEvent): void => {
      if (event.target === dialog) store.closeAbove?.()
    }
    // The focus stays inside: Tab and Shift Tab go round what the dialog holds, and stay on it where it holds nothing
    // that takes the focus, since a browser lets Tab leave a modal dialog for its own bar.
    const held = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab') return
      const takes = [...dialog.querySelectorAll<HTMLElement>(focusable)].filter((one) => !one.hasAttribute('disabled'))
      const [first, last] = [takes[0], takes.at(-1)]
      const at = document.activeElement
      if (!first || !last) {
        event.preventDefault()
        dialog.focus()
      } else if (event.shiftKey && (at === first || at === dialog)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && at === last) {
        event.preventDefault()
        first.focus()
      }
    }
    if (!dialog.contains(document.activeElement)) dialog.focus()
    dialog.addEventListener('keydown', held)
    dialog.addEventListener('cancel', cancel)
    dialog.addEventListener('click', press)
    // The page under the dialog does not scroll while it is open, and is where it was once it closes.
    const root = document.documentElement
    const overflow = root.style.overflow
    root.style.overflow = 'hidden'
    return () => {
      dialog.removeEventListener('keydown', held)
      dialog.removeEventListener('cancel', cancel)
      dialog.removeEventListener('click', press)
      root.style.overflow = overflow
      if (dialog.open) dialog.close()
      const back = opener.current
      if (back instanceof HTMLElement && back.isConnected) back.focus({ preventScroll: true })
    }
  }, [store])
  const { params } = o.upper.page
  return (
    <dialog ref={element} aria-label={label} aria-modal="true" tabIndex={-1} style={alongOf(o.upper.side)}>
      <Own record={o.record} above={{ params, state: o.upper.state, set: o.upper.set }} titled={setLabel} />
    </dialog>
  )
}

holdPart('above', { Above })
