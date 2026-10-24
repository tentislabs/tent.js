import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Drawable } from '../borrowed/react.ts'
import { createElement as h } from '../borrowed/react.ts'
import { read, screen } from '../index.ts'
import { described, drawingOf, drawn, openOrders } from './drawn.ts'

test('[31-2] a view is handed each entry of its data under its name, also one named key: draw shows its rows', async () => {
  const description = described([
    openOrders,
    screen('keyedScreen', {
      path: '/keyedScreen',
      access: 'anyone',
      view: () => null,
      data: { key: read(openOrders, { limit: 2 }) },
    }),
  ])
  const view = (handed: Record<string, unknown>): Drawable =>
    h('p', null, Array.isArray(handed.key) ? handed.key.map((one) => String(Object(one).name)).join(' ') : 'none')
  const made = await drawn(description, 'keyedScreen', {
    views: { keyedScreen: { name: 'keyedScreen', kind: 'screen', view } },
  })
  assert.equal(drawingOf(made.html), '<p>Ann Bo</p>')
})
