import { useEffect, useRef } from 'react'
import { anyone, screen } from 'tentjs/ui'

// A screen whose first HTML holds an open dialog, which the page then shows as modal, and a press in it that
// holds the page in a question of the browser's own until someone answers it.
export const settingsScreen = screen('settingsScreen', {
  path: '/settings',
  access: anyone('a screen of a test'),
  title: 'Settings',
  view: () => {
    const ref = useRef<HTMLDialogElement>(null)
    useEffect(() => {
      const dialog = ref.current
      if (!dialog) return
      if (dialog.open) dialog.close()
      dialog.showModal()
    }, [])
    return (
      <main>
        <h1>Behind</h1>
        <dialog ref={ref} open aria-label="Settings">
          <h2>Settings</h2>
          <button type="button" onClick={() => window.alert('Saved')}>
            Save
          </button>
        </dialog>
      </main>
    )
  },
})
