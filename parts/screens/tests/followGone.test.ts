import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Reach } from '../page/alive.ts'
import { livingPage } from '../page/browser.ts'
import type { Page } from '../page/types.ts'
import { pageOf } from './drawn.ts'

/** Lets what a page started come to its end. */
const settled = () => new Promise((done) => setTimeout(done, 5))

/** The record of the page of one version, whose screen lies in a file of that version. */
const record = (version: string): Page =>
  pageOf('s', {
    path: '/s',
    version,
    mode: 'development',
    load: { screen: `browser/s.${version}.js`, parts: [], styles: [], error: '' },
    answers: [],
  })

test('[31-11] a file of the bundle that the page asks for and that is no longer kept makes the page load its address anew: a page that follows a version whose file was removed meanwhile does not stay as it was', async () => {
  const gone: string[] = []
  const thrown: unknown[] = []
  const heard = (reason: unknown): void => void thrown.push(reason)
  process.on('unhandledRejection', heard)
  let tell: (message: object) => void = () => undefined
  const reach: Reach = {
    post: async () => ({ ok: true, value: null }),
    // The engine answers the record of the version that ran when it was asked.
    get: async () => ({ ok: true, value: record('v2') }),
    go: (address) => void gone.push(address),
    // The folder of that version was removed by the next save before the page asked for its file.
    load: async () => {
      throw new TypeError('Failed to fetch dynamically imported module: /_t/b/browser/s.v2.js')
    },
    shows: () => '/s?tab=open',
    wait: () => () => undefined,
    random: () => 0.5,
    socket: (_address, on) => {
      queueMicrotask(() => on.opened())
      tell = (message) => on.message(JSON.stringify(message))
      return { send: () => undefined, close: () => undefined }
    },
  }
  const page = livingPage(record('v1'), [{ name: 's', kind: 'screen' }], reach)
  await settled()
  tell({ t: 'version', version: 'v2' })
  await settled()
  process.off('unhandledRejection', heard)
  // The page loads the address that it shows as a whole, and nothing that it started is left to fail unheard.
  assert.deepEqual([gone, page.page.version, thrown.length], [['/s?tab=open'], 'v1', 0])
})
