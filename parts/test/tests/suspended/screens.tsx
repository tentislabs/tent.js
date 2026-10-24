import { Suspense } from 'react'
import { screen } from 'tentjs/ui'

// A part of a view that fails while it is drawn, inside a boundary that the view writes itself.
function Broken(): never {
  throw new Error('the view broke inside its own boundary')
}

export const brokenScreen = screen('brokenScreen', {
  path: '/broken',
  access: 'anyone',
  view: () => (
    <main>
      <Suspense fallback={<p>Waiting</p>}>
        <Broken />
      </Suspense>
    </main>
  ),
})
