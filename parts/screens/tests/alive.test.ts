import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Type } from '../../core/index.ts'
import { choice, number, object, text } from '../../core/index.ts'
import { checkedBy, checksOf, checkValue } from '../../core/internal.ts'
import { livingPage } from '../page/alive.ts'
import { names } from '../page/browser.ts'
import { asBlock, asText } from '../page/document.ts'
import { wordsFor } from '../page/fields.ts'
import { valueOf } from '../page/valueOf.ts'
import { pageOf, rows } from './drawn.ts'

// The check of a form's send, made of the types of the input as the build makes it.
const checked = (input: Record<string, unknown>, values: Record<string, unknown>): Record<string, string> =>
  checkedBy(checksOf(input), values)

/** What stands for the engine in these tests: it keeps what it was sent, and answers what the case gives. */
function engine(answer: (address: string, body: unknown) => unknown) {
  const sent: { address: string; body: unknown }[] = []
  const gone: string[] = []
  return {
    sent,
    gone,
    reach: {
      post: async (address: string, body: unknown) => {
        sent.push({ address, body })
        return answer(address, body)
      },
      go: (address: string, replace?: boolean) => {
        gone.push(replace ? `in place: ${address}` : address)
      },
    },
  }
}

/** Lets what a page started come to its end. */
const settled = () => new Promise((done) => setTimeout(done, 5))

test('[31-2] a page that comes alive holds the answers it came with: what it holds is asked of no engine, and what it lacks is read through the door', async () => {
  const came = [{ what: 'openOrders', input: { limit: 2 }, entry: 'orders', value: rows }]
  const far = engine(() => ({ ok: true, value: [{ id: 'c' }] }))
  const page = livingPage(
    pageOf('s', { answers: came, user: { id: 'u1', roles: [] } }),
    [{ name: 's', kind: 'screen' }],
    far.reach,
  )
  let drawn = 0
  page.listen(() => {
    drawn += 1
  })
  // The page comes alive with no second request for what the first HTML held, whatever order its input was written in.
  assert.deepEqual(page.ask('openOrders', { limit: 2 }, { entry: 'orders' }), came[0])
  assert.deepEqual(far.sent, [])
  // What it does not hold is asked at `/_t/read/`, with the version of the page and the user it was drawn for.
  assert.equal(page.ask('openOrders', { limit: 5, status: 'open' }, {}), undefined)
  assert.equal(page.ask('openOrders', { status: 'open', limit: 5 }, {}), undefined)
  await settled()
  assert.deepEqual(far.sent, [
    { address: '/_t/read/openOrders', body: { input: { limit: 5, status: 'open' }, version: 'v1', as: 'u1' } },
  ])
  assert.equal(drawn, 1)
  assert.deepEqual(page.ask('openOrders', { status: 'open', limit: 5 }, {}), {
    what: 'openOrders',
    input: { limit: 5, status: 'open' },
    value: [{ id: 'c' }],
  })
  // Asked once more, the name keeps the old answer until the new one arrives.
  assert.deepEqual(page.ask('openOrders', { limit: 2 }, { entry: 'orders' }, true), came[0])
  await settled()
  assert.equal(far.sent.length, 2)
  assert.deepEqual(page.ask('openOrders', { limit: 2 }, { entry: 'orders' })?.value, [{ id: 'c' }])
})

test('[31-2] what the server left for the page is asked when the page has come alive, and a failure of a read is its error', async () => {
  const error = { code: 'T0005', name: 'too-many', message: 'Too many requests.' }
  const far = engine((address) => (address.endsWith('getOrder') ? { ok: false, error } : { ok: true, value: 7 }))
  const left = [
    { what: 'askAdvice', input: {}, entry: 'advice', left: 'wait' as const },
    { what: 'getOrder', input: { id: 'a' }, entry: 'selected', left: 'open' as const },
  ]
  const page = livingPage(pageOf('s', { answers: left }), [{ name: 's', kind: 'screen' }], far.reach)
  assert.equal(page.ask('askAdvice', {}, { entry: 'advice', wait: false })?.left, 'wait')
  page.ask('getOrder', { id: 'a' }, { entry: 'selected', needed: true })
  await settled()
  // A visitor names no user.
  assert.deepEqual(
    far.sent.map((one) => one.body),
    [
      { input: {}, version: 'v1' },
      { input: { id: 'a' }, version: 'v1' },
    ],
  )
  assert.deepEqual(page.ask('askAdvice', {}, { entry: 'advice' }), {
    what: 'askAdvice',
    input: {},
    entry: 'advice',
    value: 7,
  })
  assert.deepEqual(page.ask('getOrder', { id: 'a' }, {}), {
    what: 'getOrder',
    input: { id: 'a' },
    entry: 'selected',
    needed: true,
    error,
  })
})

test('[31-2] a call from a page goes through the door, and after one that worked the page asks again every query it shows', async () => {
  const came = [{ what: 'openOrders', input: {}, entry: 'orders', value: rows }]
  const error = { code: 'T0002', name: 'bad-input', message: 'The input does not fit.', fields: { total: 'min' } }
  const far = engine((address, body) =>
    address === '/_t/call/addOrder'
      ? Object(Object(body).input).total < 0
        ? { ok: false, error }
        : { ok: true, value: { id: 'n' } }
      : { ok: true, value: [] },
  )
  const page = livingPage(pageOf('s', { answers: came }), [{ name: 's', kind: 'screen' }], far.reach)
  assert.deepEqual(await page.call('addOrder', { total: 5 }), { id: 'n' })
  await settled()
  assert.deepEqual(far.sent, [
    { address: '/_t/call/addOrder', body: { input: { total: 5 }, version: 'v1' } },
    { address: '/_t/read/openOrders', body: { input: {}, version: 'v1' } },
  ])
  assert.deepEqual(page.ask('openOrders', {}, {})?.value, [])
  // A call that fails leaves the page as it was, and refuses its promise with the error as a caller sees it.
  await assert.rejects(page.call('addOrder', { total: -1 }), (thrown) => {
    assert.deepEqual(thrown, error)
    return true
  })
  await settled()
  assert.equal(far.sent.length, 3)
  // A call that changed who is calling makes the page ask for its address anew, and a move loads an address whole.
  const other = engine(() => ({ ok: true, value: 1, caller: 'changed' }))
  const signed = livingPage(pageOf('s', { path: '/account' }), [{ name: 's', kind: 'screen' }], other.reach)
  await signed.call('signIn', {})
  assert.deepEqual(other.gone, ['/account'])
  signed.goTo('/orders')
  assert.deepEqual(other.gone, ['/account', '/orders'])
})

test('[31-2] an action that states refresh is asked again on its timer while its screen is shown, and one timer serves one asking', async () => {
  const far = engine(() => ({ ok: true, value: 2 }))
  const timers: { work: () => void; ms: number }[] = []
  const came = [{ what: 'rates', input: { base: 'USD' }, entry: 'rates', value: 1 }]
  const page = livingPage(pageOf('s', { answers: came }), [{ name: 's', kind: 'screen' }], {
    ...far.reach,
    every: (work, ms) => {
      timers.push({ work, ms })
      return () => undefined
    },
  })
  page.ask('rates', { base: 'USD' }, { entry: 'rates', every: 600000 })
  page.ask('rates', { base: 'USD' }, { entry: 'rates', every: 600000 })
  assert.deepEqual(
    timers.map((one) => one.ms),
    [600000],
  )
  assert.deepEqual(far.sent, [])
  timers[0].work()
  await settled()
  assert.deepEqual(far.sent, [{ address: '/_t/read/rates', body: { input: { base: 'USD' }, version: 'v1' } }])
  assert.equal(page.ask('rates', { base: 'USD' }, { entry: 'rates', every: 600000 })?.value, 2)
})

test('[31-2] a living page holds the record of its screen and the stubs that the module of the screen gives, the records of its components, and its own state', () => {
  const far = engine(() => ({ ok: true }))
  const stub = { definition: 'addOrder', kind: 'change', input: {} }
  const page = livingPage(
    pageOf('s', { state: { tab: 'open' } }),
    [
      {
        name: 's',
        kind: 'screen',
        view: () => null,
        stubs: { addOrder: stub },
      },
      { name: 'OrderCard', kind: 'component' },
    ],
    far.reach,
  )
  assert.equal(page.view('s')?.kind, 'screen')
  assert.equal(page.view('OrderCard')?.name, 'OrderCard')
  assert.equal(page.view('None'), undefined)
  assert.deepEqual(page.stub('addOrder'), stub)
  assert.equal(page.stub('none'), undefined)
  assert.deepEqual(page.state, { tab: 'open' })
  // The main file gives the six names of the page code, for the small file of each.
  assert.equal(Object.keys(names).length, 6)
})

test('[31-5] a text of the head is written with the characters that mean something as names, and the page record with five characters as their numbers', () => {
  assert.equal(asText(`<a href="x">Tom & Jerry's</a>`), '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;')
  const hard = `</script> & ${String.fromCharCode(0x2028, 0x2029)} \\ " é`
  const block = asBlock({ text: hard })
  assert.equal(block, `{"text":"\\u003c/script\\u003e \\u0026 \\u2028\\u2029 \\\\ \\" é"}`)
  assert.deepEqual(JSON.parse(block), { text: hard })
})

test('[12-5] a stored value means what the same text means as code: each sign, a read that meets nothing, and a choice', () => {
  const names = {
    o: { id: 7, name: 'Ann', lines: [{ qty: 2 }, { qty: 3 }], none: null },
    i: 1,
    n: '5',
    flag: false,
    marks: { '?late': true, late: 1 },
  }
  const worked = (stored: unknown) => valueOf(stored, { names })
  const name = (...path: unknown[]) => ({ name: path })
  // Every sign as JavaScript works it out, whatever the kinds of its two sides.
  const o = names.o
  const cases: [unknown, unknown][] = [
    [{ op: '+', left: name('n'), right: 1 }, '51'],
    [{ op: '-', left: name('n'), right: 1 }, 4],
    [{ op: '*', left: name('o', 'id'), right: 2 }, 14],
    [{ op: '/', left: 1, right: 4 }, 0.25],
    [{ op: '%', left: 7, right: 4 }, 3],
    [{ op: '==', left: name('n'), right: 5 }, true],
    [{ op: '===', left: name('n'), right: 5 }, false],
    [{ op: '!=', left: name('o', 'none'), right: { nothing: true } }, false],
    [{ op: '!==', left: name('o', 'none'), right: { nothing: true } }, true],
    [{ op: '<', left: name('n'), right: 10 }, true],
    [{ op: '<=', left: 'a', right: 'b' }, true],
    [{ op: '>', left: '2026-10-08T09:30:00.000Z', right: '2026-10-07T09:30:00.000Z' }, true],
    [{ op: '>=', left: 1, right: 2 }, false],
    [{ op: '&&', left: name('flag'), right: name('missing', 'deep') }, false],
    [{ op: '||', left: name('o', 'name'), right: name('missing', 'deep') }, 'Ann'],
    [{ op: '??', left: name('o', 'none'), right: 'none' }, 'none'],
    [{ op: '??', left: name('flag'), right: 'none' }, false],
    [{ not: name('flag') }, true],
    [{ minus: name('n') }, -5],
    [{ if: name('o', 'lines', 'length'), then: 'some', else: 'none' }, 'some'],
    [{ text: ['Order ', name('o', 'id'), ' of ', name('o', 'none'), name('missing')] }, 'Order 7 of nullundefined'],
    [
      {
        object: [
          ['id', name('o', 'id')],
          ['more', [name('i'), null]],
        ],
      },
      { id: 7, more: [1, null] },
    ],
    [name('o', 'lines', name('i'), 'qty'), 3],
    [name('o', 'lines', 5, '?qty'), undefined],
    [name('o', 'none', '?name', 'length'), undefined],
    [name('o', 'lines', '?', 0, 'qty'), 2],
    [name('o', 'none', '?', 0), undefined],
    [name('marks', { text: ['?late'] }), true],
    [name('marks', '?late'), 1],
    [name('o', 'name', 'length'), 3],
    [name('o', 'name', 0), 'A'],
    [name('o', 'lines', 'length'), 2],
    [{ read: { op: '??', left: name('o', 'none'), right: name('o', 'lines') }, path: ['length'] }, 2],
    [{ named: { top: 'LABELS' }, value: { object: [['open', 'Open']] } }, { open: 'Open' }],
    [{ nothing: true }, undefined],
    [null, null],
  ]
  for (const [stored, expected] of cases) assert.deepEqual(worked(stored), expected, JSON.stringify(stored))
  assert.equal(o.lines.length, 2)
  // A read into what is not there fails as it does in code, and a member that a value only inherits is not there.
  assert.throws(
    () => worked(name('o', 'none', 'name')),
    new TypeError("Cannot read properties of null (reading 'name')"),
  )
  assert.throws(
    () => worked(name('missing', 'deep')),
    new TypeError("Cannot read properties of undefined (reading 'deep')"),
  )
  assert.throws(() => worked(name('o', 'lines', 5, 'qty')), TypeError)
  assert.equal(worked(name('o', 'constructor')), undefined)
  assert.equal(worked(name('o', 'lines', 'map')), undefined)
  assert.equal(worked(name('o', '__proto__')), undefined)
  assert.throws(() => worked({ call: { function: 'markPaid' } }), /cannot carry out: call/)
  // A screen's arrows hold no definition as a value.
  assert.throws(() => worked({ screen: 'ordersScreen' }), /cannot carry out: screen/)
  assert.throws(() => worked({ op: 'in', left: 1, right: 2 }), /a sign that it cannot carry out: in/)
  // An asset is the address of its file, or nothing for a name that no asset has.
  const asset = (found: string) => (found === 'logo.png' ? '/_t/b/assets/logo.abc.png' : undefined)
  assert.equal(valueOf({ asset: 'logo.png' }, { names, asset }), '/_t/b/assets/logo.abc.png')
  assert.equal(valueOf({ asset: name('o', 'name') }, { names, asset }), undefined)
})

test('[32-4@5] the check of a form before it sends holds a wrong value back, by the type of its field', () => {
  const input = {
    name: { kind: 'text' },
    total: { kind: 'number', min: 0, max: 10 },
    note: { kind: 'text', optional: true },
    status: { kind: 'choice', values: ['open', 'paid'], default: 'open' },
    rush: { kind: 'boolean' },
  }
  assert.deepEqual(checked(input, { name: 'Ann', total: 5, status: 'open', rush: false }), {})
  // A field that is not optional and states no default is needed, a switch too, as the door holds it: a switch of a
  // form starts as false, which is given.
  assert.deepEqual(checked(input, {}), { name: 'required', total: 'required', rush: 'required' })
  assert.deepEqual(checked(input, { name: '', total: Number.NaN, rush: false }), { total: 'type' })
  assert.deepEqual(checked(input, { name: 'Ann', total: -1, rush: false }), { total: 'min' })
  assert.deepEqual(checked(input, { name: 'Ann', total: 11, status: 'gone', rush: false }), {
    total: 'max',
    status: 'values',
  })
})

test('[32-3@5] each check that fails has its words, with the limit of the type, and a failure of the builder its own words', () => {
  assert.equal(wordsFor('required', {}), 'This is needed.')
  assert.equal(wordsFor('type', {}), 'This is not a valid value.')
  assert.equal(wordsFor('min', { min: 3 }), 'At least 3.')
  assert.equal(wordsFor('max', { max: 10 }), 'At most 10.')
  assert.equal(wordsFor('pattern', {}), 'This does not have the right form.')
  assert.equal(wordsFor('values', {}), 'Pick one of the choices.')
  assert.equal(wordsFor('unknown', {}), 'This field is not known.')
  assert.equal(wordsFor('That name is taken.', {}), 'That name is taken.')
  assert.equal(wordsFor('failed', {}), 'Something went wrong. Try again.')
})

test('[32-4@5] the check of a form holds back every value that the door would refuse for a limit of its type: whole, least and most, length, pattern, a choice', () => {
  // Each case: a type, a value that a person can type into its control, and the check that it fails, or none.
  const cases: [Type, unknown, string | undefined][] = [
    [number({ whole: true }), 42.5, 'type'],
    [number({ whole: true }), 42, undefined],
    [number({ min: 1 }), 0, 'min'],
    [number({ max: 10 }), 10.5, 'max'],
    [number({ min: 1, max: 10, whole: true }), 10, undefined],
    [text({ min: 3 }), 'ab', 'min'],
    [text({ max: 3 }), 'abcd', 'max'],
    // The length of a text is counted in characters, as the door counts it: a sign of two units is one.
    [text({ max: 3 }), '😀😀😀', undefined],
    [text({ min: 2, max: 3 }), 'abc', undefined],
    [text({ pattern: '^[a-z]+$' }), 'abc1', 'pattern'],
    [text({ pattern: '^[a-z]+$' }), 'abc', undefined],
    [text({ pattern: '^\\p{Lu}', min: 2 }), 'Ör', undefined],
    [choice(['open', 'paid']), 'gone', 'values'],
    [choice(['open', 'paid']), 'paid', undefined],
    [text({ optional: true, min: 3 }), 'ab', 'min'],
    [text({ optional: true, min: 3 }), '', 'min'],
  ]
  for (const [type, value, check] of cases) {
    const said = `${JSON.stringify(type)} with ${JSON.stringify(value)}`
    assert.deepEqual(checked({ field: type }, { field: value }), check ? { field: check } : {}, said)
    // The door says the same of the same value, so the browser holds back what the door would refuse, and no more.
    const door = checkValue(object({ field: type }), { field: value })
    assert.deepEqual(door[0]?.fields, check ? { field: check } : undefined, said)
  }
})

test('[31-15@5] after a call that worked a living page asks its queries again, and never an action that it read', async () => {
  const came = [
    { what: 'openOrders', input: {}, entry: 'orders', value: rows },
    { what: 'rates', input: { base: 'USD' }, entry: 'rates', value: { EUR: 0.9 } },
    { what: 'getOrder', input: { id: 'a' }, value: rows[0] },
  ]
  const far = engine(() => ({ ok: true, value: 1 }))
  const page = livingPage(pageOf('s', { answers: came }), [{ name: 's', kind: 'screen' }], far.reach)
  // Each asking tells its kind as its view knows it: an entry of `data`, and a hook.
  page.ask('openOrders', {}, { entry: 'orders', kind: 'query' })
  page.ask('rates', { base: 'USD' }, { entry: 'rates', kind: 'action' })
  page.ask('getOrder', { id: 'a' }, { kind: 'query' })
  await page.call('addOrder', { total: 5 })
  await settled()
  assert.deepEqual(
    far.sent.map((one) => one.address),
    ['/_t/call/addOrder', '/_t/read/openOrders', '/_t/read/getOrder'],
  )
  // Asked for once more by its view, the action is called again.
  page.ask('rates', { base: 'USD' }, { entry: 'rates', kind: 'action' }, true)
  await settled()
  assert.equal(far.sent.at(-1)?.address, '/_t/read/rates')
})

test('[31-6] a move of a living page loads its address, and with replace puts it in the place of the page', () => {
  const far = engine(() => ({ ok: true }))
  const page = livingPage(pageOf('s'), [{ name: 's', kind: 'screen' }], far.reach)
  page.goTo('/orders/new')
  page.goTo('/orders/7', { replace: true })
  assert.deepEqual(far.gone, ['/orders/new', 'in place: /orders/7'])
})
