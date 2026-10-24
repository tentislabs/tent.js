import assert from 'node:assert/strict'
import { test } from 'node:test'
import { project } from '../../core/index.ts'
import { describe } from '../../core/internal.ts'
import { isPath } from '../../core/internal.ts'
import { screenAt, stateOf } from '../pages/find.ts'
import { pageHeaders } from '../pages/headers.ts'

/** The lines of the content policy of a page of a project with those options, each by its name. */
function policyOf(options: object, framedBy: unknown = null): Record<string, string> {
  const { description, findings } = describe({ definitions: [{ value: project('shop', options) }] })
  assert.deepEqual(findings, [])
  const headers = pageHeaders(description, 'https://shop.example', framedBy)
  const lines = headers['content-security-policy']
    .split('; ')
    .map((line) => [line.split(' ')[0], line.slice(line.indexOf(' ') + 1)])
  return { ...Object.fromEntries(lines), permissions: headers['permissions-policy'] }
}

test('[21-11] unlock: each entry opens what its row names and nothing else', () => {
  const closed = policyOf({})
  assert.deepEqual(closed, {
    'default-src': "'self'",
    'script-src': 'https://shop.example/_t/b/',
    'style-src': 'https://shop.example/_t/b/',
    'style-src-attr': "'unsafe-inline'",
    'img-src': "'self' data: blob:",
    'media-src': "'self' blob:",
    'font-src': "'self'",
    'connect-src': "'self' wss://shop.example",
    'frame-src': "'none'",
    'frame-ancestors': "'none'",
    'object-src': "'none'",
    'base-uri': "'none'",
    'form-action': "'self'",
    permissions: 'camera=(), microphone=(), geolocation=()',
  })
  // Each entry, alone: the lines that differ from the closed policy are the ones its row names, and no other.
  const opens: [object, Record<string, string>][] = [
    [{ scripts: ['https://js.stripe.com'] }, { 'script-src': 'https://shop.example/_t/b/ https://js.stripe.com' }],
    [{ styles: ['https://css.example.com'] }, { 'style-src': 'https://shop.example/_t/b/ https://css.example.com' }],
    [{ fonts: ['https://fonts.example.com'] }, { 'font-src': "'self' https://fonts.example.com" }],
    [{ frames: ['https://maps.example.com'] }, { 'frame-src': 'https://maps.example.com' }],
    [{ styleTags: true }, { 'style-src': "https://shop.example/_t/b/ 'unsafe-inline'" }],
    [{ wasm: true }, { 'script-src': "https://shop.example/_t/b/ 'wasm-unsafe-eval'" }],
    [{ blobWorkers: true }, { 'worker-src': "'self' blob:" }],
    [{ eval: true }, { 'script-src': "https://shop.example/_t/b/ 'unsafe-eval'" }],
    [{ camera: true }, { permissions: 'camera=(self), microphone=(), geolocation=()' }],
    [{ microphone: true }, { permissions: 'camera=(), microphone=(self), geolocation=()' }],
    [{ location: true }, { permissions: 'camera=(), microphone=(), geolocation=(self)' }],
    [{ more: { 'img-src': ['https://*.example.com'] } }, { 'img-src': "'self' data: blob: https://*.example.com" }],
    [{ more: { 'frame-src': ['https://x.example.com'] } }, { 'frame-src': 'https://x.example.com' }],
  ]
  for (const [unlock, changed] of opens)
    assert.deepEqual(policyOf({ unlock }), { ...closed, ...changed }, JSON.stringify(unlock))
  // The hosts of the project open pictures, sound and what the page connects to, and no script.
  assert.deepEqual(policyOf({ hosts: ['https://img.example.com'] }), {
    ...closed,
    'img-src': "'self' data: blob: https://img.example.com",
    'media-src': "'self' blob: https://img.example.com",
    'connect-src': "'self' wss://shop.example https://img.example.com",
  })
  // Who may show a page in a frame is the screen's to say.
  assert.equal(policyOf({}, ['https://studio.example.com'])['frame-ancestors'], 'https://studio.example.com')
  assert.equal(policyOf({}, 'anyone')['frame-ancestors'], '*')
})

test('[31-4] an address is found by its pattern: the more exact screen wins, a value has its percent signs read, and what is no address of the app fits none', () => {
  const screens = {
    a: { path: '/orders/:id' },
    b: { path: '/orders/new' },
    c: { path: '/orders/*' },
    d: { path: '/' },
    e: { path: '/docs/:part/:page' },
  }
  const at = (path: string) => screenAt(Object({ screens }), path)
  assert.deepEqual(at('/'), { name: 'd', params: {} })
  assert.deepEqual(at('/orders/new'), { name: 'b', params: {} })
  assert.deepEqual(at('/orders/42'), { name: 'a', params: { id: '42' } })
  assert.deepEqual(at('/orders/a%20b'), { name: 'a', params: { id: 'a b' } })
  assert.deepEqual(at('/orders/42/lines/3'), { name: 'c', params: { rest: '42/lines/3' } })
  assert.deepEqual(at('/docs/x/y'), { name: 'e', params: { part: 'x', page: 'y' } })
  // Letters are compared as written, and a part more or less fits no pattern.
  for (const path of ['/Orders/new', '/docs/x', '/docs/x/y/z', '/nothing']) assert.equal(at(path), undefined, path)
  for (const path of ['/a', '/a/b', '/a%20b', '/']) assert.equal(isPath(path), true, path)
  for (const path of ['//evil.example', '/a//b', '/a\\b', '/a%5Cb', '/a%2F%2Fb', '/a%00b', 'a', '/%E0%A4%A'])
    assert.equal(isPath(path), false, path)
})

test('[31-4] the state of an address is read against its type, and a value that does not fit is left to its default', () => {
  const state = {
    tab: { type: { kind: 'choice', values: ['open', 'paid'], default: 'open' }, in: 'address' },
    page: { type: { kind: 'number', min: 1, max: 500, whole: true, default: 1 }, in: 'address' },
    search: { type: { kind: 'text', max: 5 }, in: 'address' },
    tags: { type: { kind: 'list', of: { kind: 'text' } }, in: 'address' },
    filter: { type: { kind: 'object', shape: { city: { kind: 'text' }, min: { kind: 'number' } } }, in: 'address' },
    wide: { type: { kind: 'boolean' }, in: 'address' },
    kept: { type: { kind: 'text' }, in: 'browser' },
    plain: { kind: 'text' },
  }
  const read = (search: string) => stateOf(state, new URLSearchParams(search))
  assert.deepEqual(
    read(
      'tab=paid&page=2&search=lamp&tag=x&tags=red&tags=new&filter.city=Izmir&filter.min=10&wide=true&kept=a&plain=b',
    ),
    {
      tab: 'paid',
      page: 2,
      search: 'lamp',
      tags: ['red', 'new'],
      filter: { city: 'Izmir', min: 10 },
      wide: true,
    },
  )
  // A misfit gives the default: the state is left out, and starts as its type says.
  assert.deepEqual(read('tab=gone&page=0&search=toolong&wide=yes'), {})
  assert.deepEqual(read('page=2.5'), {})
  assert.deepEqual(read('page=abc&tab='), {})
  assert.deepEqual(read(''), {})
})
