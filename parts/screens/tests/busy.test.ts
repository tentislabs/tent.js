import assert from 'node:assert/strict'
import { test } from 'node:test'
import { livingPage } from '../page/alive.ts'
import type { Reach } from '../page/reach.ts'
import type { Page, ViewRecord } from '../page/types.ts'
import { pageOf } from './drawn.ts'

const list: ViewRecord = { name: 'listScreen', kind: 'screen' }

const first = (): Page =>
  pageOf('listScreen', { path: '/orders', load: { screen: 'list.js', parts: [], styles: [], error: '' } })

test('[32-5] while a move takes long and the old screen names no loading component, the old screen stays and is marked busy for a screen reader, until the move is done', async () => {
  const marks: boolean[] = []
  let answer: (value: unknown) => void = () => {}
  // The wait of the page is told at once: the move is slow from the start.
  const reach: Reach = {
    post: async () => ({ ok: true, value: null }),
    go: () => {},
    get: () => new Promise((done) => (answer = done)),
    load: async () => [],
    moved: () => {},
    wait: (work) => {
      work()
      return () => {}
    },
    busy: (on) => void marks.push(on),
  }
  const page = livingPage(first(), [list], reach)
  page.goTo('/orders/7')
  await new Promise((done) => setTimeout(done, 5))
  assert.deepEqual(marks, [true])
  assert.equal(page.loading?.(), undefined)
  answer({ ok: true, value: { ...first(), path: '/orders/7' } })
  await new Promise((done) => setTimeout(done, 5))
  assert.deepEqual(marks, [true, false])
})
