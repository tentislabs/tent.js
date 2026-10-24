import assert from 'node:assert/strict'
import { test } from 'node:test'
import { callsIn } from './desks.ts'
import type { NodePage, LiveServed } from './living.ts'
import { liveMoment, movedClock, nodePage, rowsOf, servedLive, cardTitlesOf, untilTried } from './living.ts'

const system = { kind: 'system' } as const
const live = { entry: 'cards', live: true }

/** Adds a card as the system, and answers the id of its row. */
async function addCard(at: LiveServed, title: string, rank: number): Promise<string> {
  return String(Reflect.get(Object(await at.app.call('addCard', { title, rank }, { as: system })), 'id'))
}

/** What the page shows of the cards it watches. */
const shown = (page: NodePage, what = 'allCards', input: unknown = {}): string[] =>
  cardTitlesOf(page.ask(what, input, live)?.value)

/** The messages of one name that a page was sent. */
const of = (page: NodePage, t: string): Record<string, unknown>[] => page.heard.filter((one) => one.t === t)

test("[21-4] a screen's first HTML already contains its rows, and a page that comes alive with them watches with their mark and is sent nothing until a row changes", async (t) => {
  const at = await servedLive(t)
  const page = await nodePage(at, '/')
  // The rows stand in the HTML itself, as text, and in the record of the page with the mark of their answer.
  for (const title of ['One', 'Two', 'Three', 'Four', 'Five']) assert.match(page.html, new RegExp(`>${title}<`))
  assert.match(page.html, />5(<!-- -->)? cards</)
  const [came] = Object(page.record.answers)
  assert.deepEqual([came.what, came.entry, cardTitlesOf(came.value)], ['allCards', 'cards', shown(page)])
  assert.match(String(came.mark), /^[0-9a-f]{16}$/)

  // The page comes alive: it opens the connection, and watches with the mark it came with.
  await untilTried('the page watches', () => page.told.length === 1)
  assert.deepEqual(
    [page.told[0].t, page.told[0].query, page.told[0].have, page.told[0].version],
    ['watch', 'allCards', came.mark, page.record.version],
  )
  // A second watch tells when the first was answered: the first was sent nothing, since the page holds the answer.
  page.ask('countCards', {}, { live: true })
  await untilTried('the count was answered', () => of(page, 'result').length === 1)
  assert.deepEqual(page.heard, [{ t: 'result', id: page.told[1].id, value: 5, mark: page.heard[0].mark }])
  assert.deepEqual(page.asked, [], 'the page asked nothing by a request')

  // A row is added: the page is sent it, and shows the list of a fresh answer.
  await addCard(at, 'Six', 60)
  await untilTried('the page was sent the new row', () => of(page, 'rows').length === 1)
  assert.deepEqual(shown(page), ['One', 'Two', 'Three', 'Four', 'Five', 'Six'])
  assert.deepEqual(page.asked, [])
})

test('[31-11] a list in which one row moves, one is added in the middle and one leaves is the same list on the page as in a fresh answer, also for a query with after', async (t) => {
  const at = await servedLive(t)
  const page = await nodePage(at, '/')
  const paged = await nodePage(at, '/page')
  const ran = (): number[] => ['allCards', 'cardPage'].map((name) => callsIn(at.dataFolder, name))
  const before = ran()
  paged.ask('cardPage', {}, { entry: 'page', live: true })
  page.ask('allCards', {}, live)
  await untilTried('both pages watch', () => page.told.length === 1 && paged.told.length === 1)
  // The engine has run each watch before a card changes: a watch that is run after a write is answered with the
  // list as it is then, whole, and no page could tell that from a change.
  await untilTried('the engine ran both watches', () => ran().every((count, k) => count > before[k]))
  const fresh = async (): Promise<string[]> => cardTitlesOf(await at.app.call('allCards', {}, { as: system }))
  const freshPage = async (): Promise<unknown> =>
    JSON.parse(JSON.stringify(await at.app.call('cardPage', {}, { as: system })))
  const ids = rowsOf(await at.app.call('allCards', {}, { as: system })).map((row) => String(row.id))
  assert.deepEqual(cardTitlesOf(paged.ask('cardPage', {}, live)?.value), ['One', 'Two', 'Three'])

  /** Carries a change out, waits for what it sends each page, and holds each page against a fresh answer. */
  const after = async (name: string, input: object, sends: [number, number]): Promise<void> => {
    const before = [page.heard.length, paged.heard.length]
    await at.app.call(name, input, { as: system })
    await untilTried(`the pages were sent what ${name} changed`, () =>
      [page, paged].every((one, k) => one.heard.length === before[k] + sends[k]),
    )
    assert.deepEqual(shown(page), await fresh())
    assert.deepEqual(paged.ask('cardPage', {}, live)?.value, await freshPage())
  }
  // The last row moves to the front: it enters the first page of three, and the third row leaves that page.
  await after('moveCard', { card: ids[4], rank: 5 }, [1, 1])
  assert.deepEqual(shown(page), ['Five', 'One', 'Two', 'Three', 'Four'])
  assert.deepEqual(cardTitlesOf(paged.ask('cardPage', {}, live)?.value), ['Five', 'One', 'Two'])
  // A row is added in the middle, behind the first page: the page of three is sent nothing.
  await after('addCard', { title: 'Middle', rank: 25 }, [1, 0])
  // A row of the first page leaves: the next one moves up into it.
  await after('dropCard', { card: ids[0] }, [1, 1])
  assert.deepEqual(cardTitlesOf(paged.ask('cardPage', {}, live)?.value), ['Five', 'Two', 'Middle'])
  // Each change was sent as what changed, and none as the whole list.
  assert.deepEqual([of(page, 'rows').length, of(page, 'result').length], [3, 0])
  assert.deepEqual([of(paged, 'rows').length, of(paged, 'result').length], [2, 0])
  assert.equal(Reflect.has(Object(paged.ask('cardPage', {}, live)?.value), 'next'), true)
  assert.deepEqual([...page.asked, ...paged.asked], [])
})

test('[31-11] a page whose network changes misses no update: the connection is cut, a row is written meanwhile, and the page that comes back is sent what changed', async (t) => {
  const at = await servedLive(t)
  const page = await nodePage(at, '/')
  page.ask('allCards', {}, live)
  await untilTried('the page watches', () => page.connected() && page.told.length === 1)
  page.cut()
  await untilTried('the page lost its connection', () => !page.connected())
  await addCard(at, 'Written meanwhile', 15)
  assert.deepEqual(shown(page), ['One', 'Two', 'Three', 'Four', 'Five'])
  // The page tries again by itself, sends its watch again with the mark it holds, and is sent the row.
  await untilTried('the page is connected again', () => page.opened() === 2 && page.connected(), 600)
  await untilTried('the page was sent what it missed', () => page.heard.length === 1)
  assert.deepEqual(shown(page), ['One', 'Written meanwhile', 'Two', 'Three', 'Four', 'Five'])
  assert.deepEqual(
    page.told.map((one) => [one.t, one.have !== undefined]),
    [
      ['watch', true],
      ['watch', true],
    ],
  )
  assert.equal(page.told[0].id, page.told[1].id)
  assert.deepEqual(page.asked, [])
})

test('[31-11] a quiet page, and one that is sent a result every ten seconds, both stay connected for five minutes', async (t) => {
  const moved = movedClock()
  const at = await servedLive(t, { clock: moved.clock })
  const quiet = await nodePage(at, '/', { timers: moved })
  const busy = await nodePage(at, '/', { timers: moved })
  quiet.ask('allCards', {}, live)
  busy.ask('countCards', {}, { live: true })
  await untilTried('both pages watch', () => quiet.told.length === 1 && busy.heard.length === 1)

  /** Lets everything that the pages sent so far reach the hub: what a page sends is taken in its order. */
  let barriers = 0
  const settled = async (): Promise<void> => {
    for (const page of [quiet, busy]) {
      const id = `barrier ${++barriers}`
      page.send({ t: 'watch', id, query: 'cardPage', input: {} })
      await untilTried('the hub answered the barrier', () => page.heard.some((one) => one.id === id))
      page.send({ t: 'unwatch', id })
    }
  }
  const signs = (page: NodePage): number => of(page, 'alive').length
  for (let second = 1; second <= 300; second++) {
    moved.advance(1000)
    // Every ten seconds a card is added, so the busy page is sent a result.
    if (second % 10 === 0) {
      const had = of(busy, 'result').length
      await addCard(at, `card at ${second}`, 1000 + second)
      await untilTried('the busy page was sent the count', () => of(busy, 'result').length === had + 1)
    }
    // Every thirty seconds each page is sent a sign of life, the busy one too, and answers it.
    if (second % 30 === 0) {
      await untilTried(
        'each page was sent a sign of life',
        () => signs(quiet) === second / 30 && signs(busy) === second / 30,
      )
      await settled()
    }
  }
  await liveMoment(50)
  assert.deepEqual([quiet.connected(), busy.connected()], [true, true])
  assert.deepEqual([quiet.opened(), busy.opened()], [1, 1])
  assert.deepEqual([signs(quiet), signs(busy)], [10, 10])
  assert.equal(of(busy, 'result').filter((one) => one.id === busy.told[0].id).length, 31)
  assert.equal(quiet.told.filter((one) => one.t === 'alive').length, 10)
  // The quiet page was sent what changed in its list, each as a row.
  assert.equal(shown(quiet).length, 35)
})

test('[31-11] after the engine is started again under 500 open pages, every page is live again within a minute and none was sent an answer it already held', async (t) => {
  const at = await servedLive(t)
  const first = await nodePage(at, '/')
  const pages = [first]
  for (let n = 1; n < 500; n++) pages.push(await nodePage(at, '/', { html: first.html }))
  for (const page of pages) page.ask('allCards', {}, live)
  await untilTried('every page watches', () => pages.every((page) => page.connected() && page.told.length === 1), 3000)
  // The count tells when the hub took each watch: no page was sent its list, which it came with.
  for (const page of pages) page.ask('countCards', {}, { live: true })
  await untilTried('every page was answered the count', () => pages.every((page) => page.heard.length === 1), 3000)

  const began = performance.now()
  await at.again()
  await untilTried(
    'every page is connected again',
    () => pages.every((page) => page.opened() >= 2 && page.connected()),
    6000,
  )
  // Each page sent both watches again, with the marks it holds: the answers did not change, so nothing was sent.
  // Each wait is for what it reads, and is given the minute of the sentence: the bar below holds the time, and no
  // shorter count of tries ends the test before it.
  await untilTried(
    'every page sent its watches again',
    () => pages.every((page) => page.told.filter((one) => one.t === 'watch').length >= 4),
    6000,
  )
  // What a page sends is taken in its order: once a watch of the test's own is answered, the hub has taken the two
  // that the page sent before it.
  for (const page of pages) page.send({ t: 'watch', id: 'barrier', query: 'cardPage', input: {} })
  await untilTried(
    'the hub took the watches of every page',
    () => pages.every((page) => page.heard.some((one) => one.id === 'barrier')),
    6000,
  )
  const took = performance.now() - began
  assert.ok(took < 60_000, `every page was live again after ${Math.round(took)} ms`)
  for (const page of pages)
    assert.deepEqual(
      page.heard.slice(1).filter((one) => one.t !== 'alive' && one.id !== 'barrier'),
      [],
      'no page was sent an answer that it held',
    )
  // A row is written: every page is sent it, so every page is live, and it is the first thing each was sent since.
  await addCard(at, 'After the start', 5)
  await untilTried(
    'every page was sent the new row',
    () =>
      pages.every(
        (page) => shown(page)[0] === 'After the start' && page.ask('countCards', {}, { live: true })?.value === 6,
      ),
    6000,
  )
  for (const page of pages) {
    const since = page.heard.slice(1).filter((one) => one.t !== 'alive' && one.id !== 'barrier')
    assert.deepEqual(
      since.map((one) => one.t).sort(),
      ['result', 'rows'],
      'a page was sent the new row and the new count, and nothing that it held',
    )
    assert.deepEqual(page.asked, [])
  }
})
