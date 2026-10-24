import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  afterSet,
  deviceRead,
  deviceText,
  heldToType,
  readAddress,
  startOfState,
  stateEntries,
  writeAddress,
} from '../internal.ts'

const declared = {
  tab: { type: { kind: 'choice', values: ['open', 'paid'], default: 'open' }, in: 'address', back: true },
  page: {
    type: { kind: 'number', min: 1, max: 500, whole: true, default: 1 },
    in: 'address',
    back: true,
    reset: ['tab', 'search'],
  },
  search: { kind: 'text', default: '' },
  tags: { type: { kind: 'list', of: { kind: 'text' } }, in: 'address' },
  filter: { type: { kind: 'object', shape: { city: { kind: 'text' }, min: { kind: 'number' } } }, in: 'address' },
  wide: { type: { kind: 'boolean' }, in: 'address' },
  seen: { type: { kind: 'boolean' }, in: 'device' },
  draft: { type: { kind: 'text', optional: true }, in: 'browser' },
}
const entries = stateEntries(declared)
const search = (text: string): URLSearchParams => new URLSearchParams(text)

test('[31-8] a state is read as a type or as a record of its type and where it lives, and starts as its default, as false for a boolean with none, and as nothing for any other', () => {
  assert.deepEqual(entries.search, { type: { kind: 'text', default: '' }, back: false, reset: [] })
  assert.deepEqual(entries.page.reset, ['tab', 'search'])
  assert.equal(entries.page.in, 'address')
  assert.equal(entries.page.back, true)
  assert.deepEqual(Object.fromEntries(Object.entries(entries).map(([name, entry]) => [name, startOfState(entry)])), {
    tab: 'open',
    page: 1,
    search: '',
    tags: undefined,
    filter: undefined,
    wide: false,
    seen: false,
    draft: undefined,
  })
})

test('[31-8] a value in the address is read against its type, and a misfit gives the default', () => {
  const read = (text: string): Record<string, unknown> => readAddress(entries, search(text))
  assert.deepEqual(
    read('tab=paid&page=2&tags=red&tags=new&filter.city=Izmir&filter.min=10&wide=true&seen=true&draft=x'),
    {
      tab: 'paid',
      page: 2,
      tags: ['red', 'new'],
      filter: { city: 'Izmir', min: 10 },
      wide: true,
    },
  )
  // A value that does not fit its type is left out, so the state is its default.
  assert.deepEqual(read('tab=gone&page=0&wide=yes'), {})
  assert.deepEqual(read('page=2.5'), {})
  assert.deepEqual(read('page=501'), {})
  // A state of a use of a component is kept under the id of its use, a tilde, and its own name.
  assert.deepEqual(readAddress(entries, search('list~page=3&page=9&list~pager~page=4'), 'list'), { page: 3 })
  assert.deepEqual(readAddress(entries, search('list~pager~page=4'), 'list~pager'), { page: 4 })
})

test('[31-8] a state is written after the question mark as text: a default is left out, a list is written once for each entry, and an object with dotted names', () => {
  const state = {
    tab: 'paid',
    page: 1,
    search: 'x',
    tags: ['red', 'new'],
    filter: { city: 'Izmir', min: 10 },
    wide: true,
    seen: true,
    draft: 'd',
  }
  assert.deepEqual(writeAddress(entries, state), [
    ['tab', 'paid'],
    ['tags', 'red'],
    ['tags', 'new'],
    ['filter.city', 'Izmir'],
    ['filter.min', '10'],
    ['wide', 'true'],
  ])
  assert.deepEqual(writeAddress(entries, { tab: 'open', page: 1, wide: false }), [])
  assert.deepEqual(writeAddress(entries, { page: 2 }, 'list'), [['list~page', '2']])
  // What is written reads back to what was written.
  const text = new URLSearchParams(writeAddress(entries, state)).toString()
  assert.deepEqual(readAddress(entries, search(text)), {
    tab: 'paid',
    tags: ['red', 'new'],
    filter: { city: 'Izmir', min: 10 },
    wide: true,
  })
})

test('[31-8] a state with reset goes back to its default when set changes a state it names, and a set that gives it too wins over the reset', () => {
  const state = { tab: 'open', page: 7, search: '' }
  assert.deepEqual(afterSet(entries, state, { tab: 'paid' }), { tab: 'paid', page: 1 })
  assert.deepEqual(afterSet(entries, state, { search: 'lamp' }), { search: 'lamp', page: 1 })
  assert.deepEqual(afterSet(entries, state, { tab: 'paid', page: 3 }), { tab: 'paid', page: 3 })
  // A set that changes nothing changes nothing, and resets nothing.
  assert.deepEqual(afterSet(entries, state, { tab: 'open' }), {})
  assert.deepEqual(afterSet(entries, state, { tab: undefined }), {})
  // A state that is not declared is set as it is given: the check holds the names.
  assert.deepEqual(afterSet(entries, state, { other: 1 }), { other: 1 })
})

test('[30-5] a value that set works out is held to its type: a number is brought to its min or max, and any other misfit sets nothing', () => {
  const page = entries.page.type
  assert.equal(heldToType(page, 0), 1)
  assert.equal(heldToType(page, 900), 500)
  assert.equal(heldToType(page, 12), 12)
  assert.equal(heldToType(page, 2.5), undefined)
  assert.equal(heldToType(page, '3'), undefined)
  assert.equal(heldToType(page, Number.NaN), undefined)
  assert.equal(heldToType(entries.tab.type, 'paid'), 'paid')
  assert.equal(heldToType(entries.tab.type, 'gone'), undefined)
  assert.equal(heldToType(entries.wide.type, true), true)
  assert.equal(heldToType(entries.wide.type, 'true'), undefined)
  assert.equal(heldToType({ kind: 'text', max: 3 }, 'abcd'), undefined)
  assert.deepEqual(heldToType(entries.tags.type, ['a', 'b']), ['a', 'b'])
  assert.equal(heldToType(entries.tags.type, ['a', 1]), undefined)
  assert.deepEqual(heldToType(entries.filter.type, { city: 'Izmir', min: 1 }), { city: 'Izmir', min: 1 })
  // What sets off a reset is the held value.
  assert.deepEqual(afterSet(entries, { tab: 'open', page: 7 }, { page: 900 }), { page: 500 })
  assert.deepEqual(afterSet(entries, { tab: 'open', page: 7 }, { tab: 'gone' }), {})
})

test('[31-8] the device states of an app are one text that a cookie may hold: the states that are not at their default, read back value for value, and a text that is no such record reads as nothing', () => {
  const text = deviceText({ mode: 'dark', 'ordersScreen.seen': true, note: 'Grüße; "x"' })
  assert.match(text, /^[A-Za-z0-9_-]+$/)
  assert.deepEqual(deviceRead(text), { mode: 'dark', 'ordersScreen.seen': true, note: 'Grüße; "x"' })
  assert.equal(deviceText({}), '')
  assert.deepEqual(deviceRead(''), {})
  assert.deepEqual(deviceRead('%%%'), {})
  assert.deepEqual(deviceRead(deviceText({ a: 1 }).slice(0, -3)), {})
  assert.deepEqual(deviceRead(Buffer.from('[1,2]').toString('base64url')), {})
})
