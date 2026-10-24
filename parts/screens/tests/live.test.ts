import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Reach } from '../page/alive.ts'
import { livingPage } from '../page/browser.ts'
import type { Page } from '../page/types.ts'
import { pageOf, rows } from './drawn.ts'

type Message = Record<string, unknown>

/** One live connection that a page asked the stand-in for: what it was sent, and what the test does with it. */
interface Wire {
  address: string
  sent: Message[]
  open: boolean
  // The opening passes, a message arrives, and the connection is lost.
  accept(): void
  tell(message: Message): void
  drop(): void
}

/**
 * What stands for the engine and for the browser in these tests: it keeps what it was sent, answers what the case
 * gives, hands out live connections that the test opens and drops, and holds every timer until the test moves the
 * time.
 */
function world(answer: (address: string, body: unknown) => unknown = () => ({ ok: true, value: [] })) {
  const sent: { address: string; body?: unknown }[] = []
  const gone: string[] = []
  const wires: Wire[] = []
  const loaded: string[][] = []
  let timers: { at: number; work: () => void; every?: number }[] = []
  let now = 0
  let blocked = false
  let gone_ = false
  const reach: Reach = {
    post: async (address, body) => {
      sent.push({ address, body })
      if (gone_) throw new Error('the engine is not reached')
      return answer(address, body)
    },
    get: async (address) => {
      sent.push({ address })
      if (gone_) throw new Error('the engine is not reached')
      return answer(address, undefined)
    },
    go: (address) => void gone.push(address),
    every: (work, ms) => {
      timers.push({ at: now + ms, work, every: ms })
      return () => undefined
    },
    wait: (work, ms) => {
      const timer = { at: now + ms, work }
      timers.push(timer)
      return () => {
        timers = timers.filter((one) => one !== timer)
      }
    },
    random: () => 0.5,
    load: async (files) => {
      loaded.push(files)
      return files.map((file) => ({ name: file.replace(/\.js$/, ''), kind: 'screen' as const }))
    },
    shows: () => '/s?tab=open',
    socket: (address, on) => {
      const wire: Wire = {
        address,
        sent: [],
        open: false,
        accept() {
          wire.open = true
          on.opened()
        },
        tell: (message) => on.message(JSON.stringify(message)),
        drop() {
          wire.open = false
          on.closed()
        },
      }
      wires.push(wire)
      // A network that lets no connection through closes each before its opening has passed.
      if (blocked) queueMicrotask(() => wire.drop())
      return {
        send: (text) => void wire.sent.push(JSON.parse(text)),
        close: () => {
          wire.open = false
        },
      }
    },
  }
  return {
    reach,
    sent,
    gone,
    wires,
    count: (): number => wires.length,
    loaded,
    block: (on: boolean) => {
      blocked = on
    },
    // The engine is gone: no request reaches it.
    stopped: (on: boolean) => {
      gone_ = on
    },
    // Moves the time on, and carries out each timer that is due on the way, in its order.
    async advance(ms: number): Promise<void> {
      const to = now + ms
      for (;;) {
        const due = timers.filter((one) => one.at <= to).sort((a, b) => a.at - b.at)[0]
        if (!due) break
        now = due.at
        if (due.every === undefined) timers = timers.filter((one) => one !== due)
        else due.at += due.every
        due.work()
        await settled()
      }
      now = to
    },
  }
}

/** Lets what a page started come to its end. */
const settled = () => new Promise((done) => setTimeout(done, 2))

const screenOf = (more: Partial<Page> = {}) => pageOf('s', { path: '/s', ...more })
const came = { what: 'openOrders', input: { limit: 2 }, entry: 'orders', value: rows, mark: 'mark-of-rows' }
const live = { entry: 'orders', live: true }

/** A page of a signed-in user that shows the open orders it came with, with its live connection open. */
async function watching(answer?: Parameters<typeof world>[0]) {
  const far = world(answer)
  const page = livingPage(
    screenOf({ answers: [came], user: { id: 'u1', roles: [] } }),
    [{ name: 's', kind: 'screen' }],
    far.reach,
  )
  let drawn = 0
  page.listen(() => {
    drawn += 1
  })
  page.ask('openOrders', { limit: 2 }, live)
  far.wires[0].accept()
  const id = String(far.wires[0].sent[0].id)
  return { far, page, id, drawn: () => drawn, wire: far.wires[0] }
}

test('[31-11] a page that shows a live query opens one connection that names its user, and watches each query with the mark of the answer it came with; a page that shows none opens none, but in development', async () => {
  const far = world()
  const page = livingPage(
    screenOf({ answers: [came], user: { id: 'u1', roles: [] } }),
    [{ name: 's', kind: 'screen' }],
    far.reach,
  )
  // Nothing is opened before the page shows a live query.
  assert.equal(far.count(), 0)
  assert.deepEqual(page.ask('openOrders', { limit: 2 }, live)?.value, rows)
  assert.deepEqual(
    far.wires.map((wire) => wire.address),
    ['/_t/live?as=u1'],
  )
  // A watch waits for the opening, and names the query, its input, the version of the page and the mark it holds.
  assert.equal(far.wires[0].sent.length, 0)
  far.wires[0].accept()
  const [first] = far.wires[0].sent
  assert.deepEqual(
    { ...first, id: 'x' },
    { t: 'watch', id: 'x', query: 'openOrders', input: { limit: 2 }, version: 'v1', have: 'mark-of-rows' },
  )
  // The same asking again is no second watch, and the answer it came with is asked of no engine.
  page.ask('openOrders', { limit: 2 }, live)
  assert.equal(far.wires[0].sent.length, 1)
  // Another input is a watch of its own, on the same connection, with no mark: its first answer is the result.
  assert.equal(page.ask('openOrders', { limit: 5 }, live), undefined)
  assert.equal(far.count(), 1)
  const second = far.wires[0].sent[1]
  assert.deepEqual(
    { ...second, id: 'x' },
    { t: 'watch', id: 'x', query: 'openOrders', input: { limit: 5 }, version: 'v1' },
  )
  assert.notEqual(second.id, first.id)
  await settled()
  assert.equal(far.sent.length, 0, 'a live query is read through the connection, and by no request')
  far.wires[0].tell({ t: 'result', id: second.id, value: [{ id: 'c' }], mark: 'mark-two' })
  assert.deepEqual(page.ask('openOrders', { limit: 5 }, live)?.value, [{ id: 'c' }])

  // A query that states `live: false`, and an action, is never watched: it is read through the door.
  page.ask('quietOrders', {}, { entry: 'quiet', live: false })
  page.ask('rates', {}, { entry: 'rates' })
  await settled()
  assert.deepEqual(
    far.sent.map((one) => one.address),
    ['/_t/read/quietOrders', '/_t/read/rates'],
  )
  assert.equal(far.wires[0].sent.length, 2)

  // A visitor names no user. A page that shows no live query opens no connection.
  const other = world()
  const visitor = livingPage(screenOf({ answers: [came] }), [{ name: 's', kind: 'screen' }], other.reach)
  visitor.ask('rates', {}, { entry: 'rates' })
  assert.equal(other.count(), 0)
  visitor.ask('openOrders', { limit: 2 }, live)
  assert.deepEqual(
    other.wires.map((wire) => wire.address),
    ['/_t/live'],
  )
  // In the mode `development` every page opens one, to hear of saves.
  const dev = world()
  livingPage(screenOf({ mode: 'development' }), [{ name: 's', kind: 'screen' }], dev.reach)
  assert.equal(dev.count(), 1)
})

test('[31-11] a result replaces the value of its name, and a rows message changes the list the page holds: the rows that left and the rows that are named are taken out, and each named row is put after the row its after names', async () => {
  const { far, page, id, drawn, wire } = await watching()
  const held = (): unknown => page.ask('openOrders', { limit: 2 }, live)?.value
  wire.tell({
    t: 'result',
    id,
    value: [
      { id: 'a', n: 1 },
      { id: 'b', n: 2 },
      { id: 'c', n: 3 },
      { id: 'd', n: 4 },
    ],
    mark: 'm1',
  })
  assert.equal(drawn(), 1)
  assert.deepEqual(held(), [
    { id: 'a', n: 1 },
    { id: 'b', n: 2 },
    { id: 'c', n: 3 },
    { id: 'd', n: 4 },
  ])
  // One row moves to the front, one is added in the middle, one changes where it stands, and one leaves.
  wire.tell({
    t: 'rows',
    id,
    was: 'm1',
    mark: 'm2',
    put: [{ row: { id: 'd', n: 4 } }, { row: { id: 'x', n: 9 }, after: 'a' }, { row: { id: 'c', n: 30 }, after: 'x' }],
    removed: ['b'],
  })
  assert.equal(drawn(), 2)
  assert.deepEqual(held(), [
    { id: 'd', n: 4 },
    { id: 'a', n: 1 },
    { id: 'x', n: 9 },
    { id: 'c', n: 30 },
  ])
  // The next message builds on the mark of the last one.
  wire.tell({ t: 'rows', id, was: 'm2', mark: 'm3', put: [], removed: ['d', 'a'] })
  assert.deepEqual(held(), [
    { id: 'x', n: 9 },
    { id: 'c', n: 30 },
  ])
  assert.equal(wire.sent.length, 1)

  // A message whose `was` is not the mark of what the page holds changes nothing: the page watches again, with no
  // mark, and is answered whole.
  wire.tell({ t: 'rows', id, was: 'another', mark: 'm9', put: [{ row: { id: 'z' } }], removed: [] })
  assert.deepEqual(held(), [
    { id: 'x', n: 9 },
    { id: 'c', n: 30 },
  ])
  assert.deepEqual(wire.sent[1], { t: 'watch', id, query: 'openOrders', input: { limit: 2 }, version: 'v1' })
  wire.tell({ t: 'result', id, value: [{ id: 'x', n: 9 }], mark: 'm4' })
  // So does one whose `after` names a row that the page does not hold.
  wire.tell({ t: 'rows', id, was: 'm4', mark: 'm5', put: [{ row: { id: 'y' }, after: 'gone' }], removed: [] })
  assert.deepEqual(held(), [{ id: 'x', n: 9 }])
  assert.equal(wire.sent.length, 3)
  assert.equal(wire.sent[2].have, undefined)

  // A page `{ rows, next }` is changed in its rows, and its `next` is the message's: left out, there is no further page.
  wire.tell({ t: 'result', id, value: { rows: [{ id: 'a' }, { id: 'b' }], next: 'after-b' }, mark: 'p1' })
  wire.tell({
    t: 'rows',
    id,
    was: 'p1',
    mark: 'p2',
    put: [{ row: { id: 'c' }, after: 'b' }],
    removed: ['a'],
    next: 'after-c',
  })
  assert.deepEqual(held(), { rows: [{ id: 'b' }, { id: 'c' }], next: 'after-c' })
  wire.tell({ t: 'rows', id, was: 'p2', mark: 'p3', put: [], removed: ['b'] })
  assert.deepEqual(held(), { rows: [{ id: 'c' }] })
  // A message for a watch that the page does not hold changes nothing.
  wire.tell({ t: 'result', id: 'no-such-watch', value: 1, mark: 'q' })
  assert.deepEqual(held(), { rows: [{ id: 'c' }] })
  assert.equal(far.sent.length, 0)
})

test('[31-11] a watch that failed: of an entry of the screen the page asks for the screen again and shows what it is given, of a useQuery it is its error, of an entry of a component its name is nothing with the error, and with T0005 the page waits and watches again', async () => {
  const gone = { code: 'T3101', name: 'denied', message: 'The rule does not let the caller in.' }
  const given: Page = screenOf({ screen: 'tent.notFound', status: 404, user: { id: 'u1', roles: [] } })
  const { far, page, id, wire, drawn } = await watching((address) =>
    address.startsWith('/_t/screen') ? { ok: true, value: given } : { ok: true, value: [] },
  )
  // Of a `useQuery`, which is no entry: the error is its own, and the page asks for nothing.
  page.ask('getOrder', { id: 'a' }, { live: true })
  const query = String(wire.sent[1].id)
  wire.tell({ t: 'failed', id: query, error: gone })
  assert.deepEqual(page.ask('getOrder', { id: 'a' }, { live: true })?.error, gone)
  // Of an entry of a component: its name is nothing, with the error.
  page.ask('getOrder', { id: 'b' }, { entry: 'order', of: 'card', live: true })
  wire.tell({ t: 'failed', id: wire.sent[2].id, error: gone })
  const part = page.ask('getOrder', { id: 'b' }, { entry: 'order', of: 'card', live: true })
  assert.deepEqual([part?.value, part?.error], [undefined, gone])
  await settled()
  assert.equal(far.sent.length, 0)

  // With T0005 the page waits, watches again, and asks for nothing else.
  const tooMany = { code: 'T0005', name: 'rate-limited', message: 'Too many.' }
  wire.tell({ t: 'failed', id, error: tooMany })
  await settled()
  assert.equal(far.sent.length, 0)
  const before = wire.sent.length
  await far.advance(400)
  assert.equal(wire.sent.length, before)
  await far.advance(1200)
  assert.deepEqual(wire.sent[before], {
    t: 'watch',
    id,
    query: 'openOrders',
    input: { limit: 2 },
    version: 'v1',
    have: 'mark-of-rows',
  })

  // Of an entry of the screen itself: the page asks for the screen again, at the address it shows, and shows what
  // it is given: here the screen for a right that was lost.
  const turn = drawn()
  wire.tell({ t: 'failed', id, error: gone })
  await settled()
  assert.deepEqual(far.sent, [{ address: '/_t/screen?path=%2Fs%3Ftab%3Dopen&version=v1' }])
  assert.equal(page.page.screen, 'tent.notFound')
  assert.equal(page.page.status, 404)
  assert.ok(drawn() > turn, 'the page is drawn again')
  assert.equal(page.screen()?.name, 'tent.notFound')

  // Where the screen now needs a sign-in, the engine names the address to go to, and the page goes there.
  const signIn = await watching((address) =>
    address.startsWith('/_t/screen') ? { ok: true, value: { goTo: '/sign-in?back=%2Fs' } } : { ok: true, value: [] },
  )
  signIn.wire.tell({ t: 'failed', id: signIn.id, error: { code: 'T0006', name: 'sign-in', message: 'Sign in.' } })
  await settled()
  assert.deepEqual(signIn.far.gone, ['/sign-in?back=%2Fs'])
})

test('[31-11] the page answers each sign of life, takes a connection as lost when nothing arrived for 45 seconds, tries again after a wait that doubles up to thirty seconds, and then sends every watch again with the mark it holds', async () => {
  const { far, page, id, wire } = await watching()
  page.ask('getOrder', { id: 'a' }, { live: true })
  wire.tell({ t: 'result', id: wire.sent[1].id, value: { id: 'a' }, mark: 'mark-a' })
  // Each sign of life is answered, and a connection that is sent one every 30 seconds stays for five minutes.
  for (let round = 1; round <= 10; round++) {
    await far.advance(30_000)
    wire.tell({ t: 'alive' })
    assert.deepEqual(wire.sent.at(-1), { t: 'alive' })
  }
  assert.deepEqual([far.wires.length, wire.open], [1, true])
  assert.equal(wire.sent.filter((one) => one.t === 'alive').length, 10)
  // Any message counts as arrived: a page that is sent a result every ten seconds stays too.
  for (let round = 0; round < 30; round++) {
    await far.advance(10_000)
    wire.tell({ t: 'result', id, value: [{ id: `r${round}` }], mark: `m${round}` })
  }
  assert.deepEqual([far.wires.length, wire.open], [1, true])

  // The engine is gone. Nothing arrives for 44 seconds: the connection stands. After 45 it is taken as lost, and closed.
  far.stopped(true)
  await far.advance(44_000)
  assert.deepEqual([far.wires.length, wire.open], [1, true])
  await far.advance(1000)
  assert.equal(wire.open, false)
  // The page tries again after between half a second and one and a half: here, with the middle draw, after one.
  assert.equal(far.count(), 1)
  await far.advance(900)
  assert.equal(far.count(), 1)
  await far.advance(100)
  assert.equal(far.count(), 2)
  // Each try that fails doubles the wait, up to thirty seconds.
  const waits: number[] = []
  for (let n = 2; n <= 8; n++) {
    far.wires.at(-1)?.drop()
    let waited = 0
    while (far.wires.length === n && waited < 40_000) {
      await far.advance(500)
      waited += 500
    }
    waits.push(waited)
  }
  assert.deepEqual(waits, [2000, 4000, 8000, 16_000, 30_000, 30_000, 30_000])
  // Meanwhile the page asked its live queries through the door every 30 seconds. No request was answered, and the
  // page holds what it held.
  const asked = [...new Set(far.sent.map((one) => one.address))].sort()
  assert.deepEqual(asked, ['/_t/read/getOrder', '/_t/read/openOrders'])
  assert.deepEqual(page.ask('openOrders', { limit: 2 }, live)?.value, [{ id: 'r29' }])
  far.stopped(false)
  // Once connected it sends every watch again, each with the mark it holds, and the wait starts short again.
  const back = far.wires.at(-1)
  assert.ok(back)
  const before = far.sent.length
  back.accept()
  assert.deepEqual(
    back.sent.map((one) => [one.t, one.query, one.have]),
    [
      ['watch', 'openOrders', 'm29'],
      ['watch', 'getOrder', 'mark-a'],
    ],
  )
  assert.deepEqual(
    back.sent.map((one) => one.id),
    [id, wire.sent[1].id],
  )
  // Sent nothing for an answer that did not change, the page holds what it held, and asks no more by a request.
  assert.deepEqual(page.ask('openOrders', { limit: 2 }, live)?.value, [{ id: 'r29' }])
  await far.advance(40_000)
  back.tell({ t: 'alive' })
  await far.advance(40_000)
  assert.equal(far.sent.length, before, 'a connected page asks nothing by a request')
  back.drop()
  await far.advance(1000)
  assert.equal(far.count(), 10)
})

test('[31-11] while no connection can be opened the page asks its live queries again through the door, after each of its own calls that worked and every 30 seconds, so it still shows its own change', async () => {
  let orders = [{ id: 'a' }]
  const far = world((address) => {
    if (address === '/_t/call/addOrder') {
      orders = [...orders, { id: 'n' }]
      return { ok: true, value: { id: 'n' } }
    }
    return address === '/_t/read/openOrders' ? { ok: true, value: orders } : { ok: true, value: 1 }
  })
  far.block(true)
  const page = livingPage(
    screenOf({ answers: [{ ...came, value: orders }] }),
    [{ name: 's', kind: 'screen' }],
    far.reach,
  )
  page.ask('openOrders', { limit: 2 }, live)
  await settled()
  assert.equal(far.count(), 1)
  assert.equal(far.sent.length, 0)
  // Its own call worked: the live query is asked again by a request, and the page shows its own change.
  await page.call('addOrder', { name: 'New' })
  await settled()
  assert.deepEqual(
    far.sent.map((one) => one.address),
    ['/_t/call/addOrder', '/_t/read/openOrders'],
  )
  assert.deepEqual(page.ask('openOrders', { limit: 2 }, live)?.value, [{ id: 'a' }, { id: 'n' }])
  // And every 30 seconds, for the change of somebody else.
  orders = [{ id: 'other' }]
  const read = (): number => far.sent.filter((one) => one.address === '/_t/read/openOrders').length
  await far.advance(29_000)
  assert.equal(read(), 1)
  await far.advance(1000)
  assert.equal(read(), 2)
  assert.deepEqual(page.ask('openOrders', { limit: 2 }, live)?.value, [{ id: 'other' }])
  await far.advance(30_000)
  assert.equal(read(), 3)

  // Once a connection opens, the page watches with the mark it holds, and asks no more by a request.
  far.block(false)
  await far.advance(30_000)
  const open = far.wires.at(-1)
  assert.ok(open)
  open.accept()
  assert.deepEqual(
    open.sent.map((one) => [one.t, one.query]),
    [['watch', 'openOrders']],
  )
  const asked = read()
  await far.advance(40_000)
  open.tell({ t: 'alive' })
  await far.advance(40_000)
  open.tell({ t: 'alive' })
  await page.call('addOrder', { name: 'Newer' })
  await settled()
  assert.equal(read(), asked, 'a live query needs nothing after a call: the engine sends what changed')
  // A query that is not live is asked again after a call that worked, connected or not.
  page.ask('quietOrders', {}, { entry: 'quiet', live: false })
  await settled()
  const quiet = (): number => far.sent.filter((one) => one.address === '/_t/read/quietOrders').length
  assert.equal(quiet(), 1)
  await page.call('addOrder', { name: 'Newest' })
  await settled()
  assert.equal(quiet(), 2)
})

test('[31-11] a reload makes the page load its address anew, and a changed caller makes it close the connection, forget every answer and ask for its screen again', async () => {
  const { far, wire } = await watching()
  wire.tell({ t: 'reload' })
  assert.deepEqual(far.gone, ['/s?tab=open'])

  const asOther: Page = screenOf({ user: { id: 'u2', roles: [] }, answers: [{ ...came, value: [{ id: 'theirs' }] }] })
  const next = await watching((address) =>
    address.startsWith('/_t/screen') ? { ok: true, value: asOther } : { ok: true, value: [] },
  )
  next.wire.tell({ t: 'changed' })
  await settled()
  assert.equal(next.wire.open, false)
  assert.deepEqual(next.far.sent, [{ address: '/_t/screen?path=%2Fs%3Ftab%3Dopen&version=v1' }])
  // The page is the new caller's: its answers are those of the new record, and its connection names the new user.
  assert.deepEqual(next.page.page.user, { id: 'u2', roles: [] })
  assert.deepEqual(next.page.ask('openOrders', { limit: 2 }, live)?.value, [{ id: 'theirs' }])
  assert.deepEqual(
    next.far.wires.map((one) => one.address),
    ['/_t/live?as=u1', '/_t/live?as=u2'],
  )
  assert.deepEqual(next.far.gone, [])

  // A call that changed who is calling does the same.
  const signed = await watching((address) =>
    address.startsWith('/_t/screen') ? { ok: true, value: asOther } : { ok: true, value: 1, caller: 'changed' },
  )
  await signed.page.call('signIn', {})
  await settled()
  assert.equal(signed.wire.open, false)
  assert.deepEqual(signed.page.page.user, { id: 'u2', roles: [] })
  assert.deepEqual(signed.far.gone, [])
})

test('[31-11] an optimistic result of what a call will change is shown at once for every use of its query, is dropped when the call fails, when a result of the query arrives after the call was answered, and two seconds after the answer', async () => {
  let fails = false
  const { far, page, id, wire } = await watching((address) =>
    address === '/_t/call/markPaid'
      ? fails
        ? { ok: false, error: { code: 'T0002', name: 'bad-input', message: 'No.' } }
        : { ok: true, value: 1 }
      : { ok: true, value: [] },
  )
  const shown = (limit = 2): unknown => page.ask('openOrders', { limit }, live)?.value
  page.ask('openOrders', { limit: 9 }, live)
  wire.tell({ t: 'result', id: wire.sent[1].id, value: [...rows, { id: 'c' }], mark: 'm9' })
  const without = (list: unknown, input: unknown): unknown =>
    Array.isArray(list) ? list.filter((row) => Object(row).id !== Object(input).order) : list

  // The optimistic result is shown the moment the call is made, for both uses of the query, and the answers are not changed.
  const call = page.call('markPaid', { order: 'a' }, { optimistic: { what: 'openOrders', to: without } })
  assert.deepEqual(shown(), [rows[1]])
  assert.deepEqual(shown(9), [rows[1], { id: 'c' }])
  await call
  // A result that arrives after the call was answered drops the optimistic result for its use, and the other keeps it.
  wire.tell({ t: 'result', id, value: [rows[0], rows[1]], mark: 'm-after' })
  assert.deepEqual(shown(), [rows[0], rows[1]])
  assert.deepEqual(shown(9), [rows[1], { id: 'c' }])
  // Two seconds after the answer the optimistic result is dropped wherever it still stands.
  await far.advance(1900)
  assert.deepEqual(shown(9), [rows[1], { id: 'c' }])
  await far.advance(100)
  assert.deepEqual(shown(9), [...rows, { id: 'c' }])

  // A rows message drops an optimistic result as a result does.
  const second = page.call('markPaid', { order: 'b' }, { optimistic: { what: 'openOrders', to: without } })
  assert.deepEqual(shown(), [rows[0]])
  await second
  wire.tell({ t: 'rows', id, was: 'm-after', mark: 'm-rows', put: [], removed: ['b'] })
  assert.deepEqual(shown(), [rows[0]])
  await far.advance(2000)
  assert.deepEqual(shown(), [rows[0]])

  // A call that fails drops its optimistic result at once.
  fails = true
  const failing = page.call('markPaid', { order: 'a' }, { optimistic: { what: 'openOrders', to: without } })
  assert.deepEqual(shown(), [])
  await assert.rejects(failing)
  assert.deepEqual(shown(), [rows[0]])
})

test('[31-11] a query that the page shows no more is watched no more: what was not asked since the last drawing is given up, and a query that is shown again is watched with the mark the page holds', async () => {
  const { page, id, wire } = await watching()
  page.ask('getOrder', { id: 'a' }, { live: true })
  wire.tell({ t: 'result', id: wire.sent[1].id, value: { id: 'a' }, mark: 'mark-a' })
  // The page was drawn, and both were asked in that drawing: both stand.
  page.drawn()
  assert.equal(wire.sent.length, 2)
  // The next drawing shows the orders alone: the watch of the one order is given up, and nothing else.
  page.ask('openOrders', { limit: 2 }, live)
  page.drawn()
  assert.deepEqual(wire.sent[2], { t: 'unwatch', id: wire.sent[1].id })
  assert.equal(wire.sent.length, 3)
  wire.tell({ t: 'result', id, value: [{ id: 'still' }], mark: 'm1' })
  assert.deepEqual(page.ask('openOrders', { limit: 2 }, live)?.value, [{ id: 'still' }])
  // Shown again, it is a watch of its own, with the mark of the answer that the page still holds.
  assert.deepEqual(page.ask('getOrder', { id: 'a' }, { live: true })?.value, { id: 'a' })
  const again = wire.sent[3]
  assert.deepEqual([again.t, again.query, again.have], ['watch', 'getOrder', 'mark-a'])
  assert.notEqual(again.id, wire.sent[1].id)
})
