import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Drawable } from '../borrowed/react.ts'
import { createElement as h, isValidElement } from '../borrowed/react.ts'
import { component, screen } from '../index.ts'
import { described, drawingOf, drawn, unescaped } from './drawn.ts'

/** What a view of the tests is handed. */
type Handed = Record<string, unknown>

/** The children that a view was handed, as React draws them. */
const childrenOf = (handed: Handed): Drawable => (isValidElement(handed.children) ? handed.children : null)

/** The view of each screen and component of a case, as the modules of their files give them to a draw. */
const views = (given: Record<string, (handed: Handed) => Drawable>): Record<string, object> =>
  Object.fromEntries(Object.entries(given).map(([name, view]) => [name, { name, view }]))

/** Draws the screen `shown` of a case, which is shown in the layout that the case names, with these views. */
async function shownInside(
  frames: object[],
  layout: string,
  given: Record<string, (handed: Handed) => Drawable>,
): Promise<string> {
  const description = described([
    ...frames,
    screen('shown', { path: '/shown', access: 'anyone', layout, view: () => null }),
  ])
  return unescaped(drawingOf((await drawn(description, 'shown', { views: views(given) })).html))
}

test('[34-1] a screen that names a component as its layout is shown inside it: the view of the component places the screen, its children, where it wants, and is handed the screen it wraps and the values of the address', async () => {
  const frame = component('AppFrame', { view: () => null })
  const drawing = await shownInside([frame], 'AppFrame', {
    AppFrame: (handed) => {
      const told = Object(handed.screen)
      return h(
        'main',
        null,
        h('span', null, String(told.name)),
        h('span', null, String(told.path)),
        h('span', null, String(told.address)),
        h('div', null, childrenOf(handed)),
        h('footer', null, 'The foot'),
      )
    },
    shown: () => h('p', null, 'The screen'),
  })
  assert.equal(
    drawing,
    '<main><span>shown</span><span>/shown</span><span>/shown</span><div><p>The screen</p></div><footer>The foot</footer></main>',
  )
})

test('[34-1] a component may state its layout too, so they nest, the outermost first', async () => {
  const app = component('AppFrame', { view: () => null })
  const staff = component('StaffFrame', { layout: 'AppFrame', view: () => null })
  const drawing = await shownInside([app, staff], 'StaffFrame', {
    AppFrame: (handed) => h('main', null, h('h1', null, 'App'), childrenOf(handed)),
    StaffFrame: (handed) => h('section', null, h('h2', null, 'Staff'), childrenOf(handed)),
    shown: () => h('p', null, 'The screen'),
  })
  assert.equal(drawing, '<main><h1>App</h1><section><h2>Staff</h2><p>The screen</p></section></main>')
})
