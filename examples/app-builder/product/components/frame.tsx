import '@fontsource-variable/inter'
import '../screens/app.css'
import { component } from 'tentjs/ui'

// Every screen of the product is shown in this, so the font and the one style file stand once in each page.
export const AppFrame = component('AppFrame', {
  view: ({ children }) => <div className="min-h-dvh bg-base-200 text-base-content antialiased">{children}</div>,
})

export const Waiting = component('Waiting', {
  view: () => (
    <p className="flex items-center gap-2 p-6 text-sm text-base-content/70">
      <span className="loading loading-spinner loading-sm" /> Loading
    </p>
  ),
})
