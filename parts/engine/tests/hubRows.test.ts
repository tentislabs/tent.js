import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fingerprintOf } from '../../core/internal.ts'
import { dial } from '../borrowed/ws.ts'
import { send, system } from './apps.ts'
import type { Message } from './watching.ts'
import { addCard, applied, board, idsOf, limited, liveMoment, runsOf, untilTried, watcher } from './watching.ts'

/** The mark of a value as it is sent: the first 16 characters of the fingerprint of its JSON. */
const markOf = (value: unknown): string =>
  fingerprintOf(new TextEncoder().encode(JSON.stringify(value) ?? 'null')).slice(0, 16)

/** The rows of a list that a message holds. */
const rowsOf = (value: unknown): Message[] => (Array.isArray(value) ? value : [])

/** The ids of the rows that a `rows` message puts, in its order, each with the id it stands after. */
const putOf = (message: Message): [string, string | undefined][] =>
  rowsOf(message.put).map((put) => [
    String(Object(put.row).id),
    put.after === undefined ? undefined : String(put.after),
  ])

test('[21-9] a list of rows in which a row changes, moves, is added or leaves is sent as a rows message that names those rows alone, each with the row it stands after, and the list a page then holds is the list of a fresh answer', async (t) => {
  const { app, origin } = await board(t)
  const ids: string[] = []
  for (let rank = 1; rank <= 8; rank++) ids.push(await addCard(app, `card ${rank}`, rank * 10))
  const page = watcher(app, origin)
  const first = await page.watch('cards', 'allCards')
  assert.deepEqual([first.t, idsOf(first.value), first.mark], ['result', ids, markOf(first.value)])
  let held = rowsOf(first.value)
  let mark = first.mark

  /** Carries one change out, takes the one message it causes, and holds the page's list against a fresh answer. */
  const after = async (name: string, input: object): Promise<Message> => {
    const before = page.got.length
    await app.call(name, input, { as: system })
    await untilTried(`the page was sent what ${name} changed`, () => page.got.length > before)
    await liveMoment(30)
    assert.equal(page.got.length, before + 1, 'one write is one message')
    const message = page.got[before]
    assert.deepEqual([message.t, message.id, message.was], ['rows', 'cards', mark])
    held = applied(held, message)
    const fresh = await app.call('allCards', {}, { as: system })
    assert.deepEqual(held, JSON.parse(JSON.stringify(fresh)))
    assert.equal(message.mark, markOf(fresh))
    assert.equal('next' in message, false, 'a list that is no page has no further page')
    mark = message.mark
    return message
  }

  // A row whose text changed is the one row of the message, after the row before it.
  let message = await after('nameCard', { card: ids[3], title: 'renamed' })
  assert.deepEqual([putOf(message), message.removed], [[[ids[3], ids[2]]], []])
  assert.equal(Object(rowsOf(message.put)[0].row).title, 'renamed')
  // A row that only moved is named with its new place: to the end, and to the front, where it stands after nothing.
  message = await after('moveCard', { card: ids[1], rank: 95 })
  assert.deepEqual([putOf(message), message.removed], [[[ids[1], ids[7]]], []])
  message = await after('moveCard', { card: ids[5], rank: 1 })
  assert.deepEqual([putOf(message), message.removed], [[[ids[5], undefined]], []])
  assert.equal('after' in rowsOf(message.put)[0], false)
  // A row that is added in the middle, and a row that leaves.
  const added = await after('addCard', { title: 'in the middle', rank: 45 })
  assert.equal(putOf(added).length, 1)
  assert.equal(putOf(added)[0][1], ids[3])
  message = await after('dropCard', { card: ids[6] })
  assert.deepEqual([message.put, message.removed], [[], [ids[6]]])

  // A write to another table sends nothing.
  const before = page.got.length
  await app.call('addNotice', { text: 'another table' }, { as: system })
  await liveMoment(60)
  assert.equal(page.got.length, before)

  // A page that says it holds this very answer is sent nothing, and one that holds another mark the whole answer.
  const second = watcher(app, origin)
  second.send({ t: 'watch', id: 'same', query: 'allCards', input: {}, have: mark })
  const whole = await second.watch('other', 'allCards', {}, { have: '0123456789abcdef' })
  assert.deepEqual([whole.t, whole.mark, idsOf(whole.value)], ['result', mark, idsOf(held)])
  assert.deepEqual(second.of('result', 'same'), [])
  // The page that held the answer is sent the next change as a rows message that builds on the mark it named.
  await app.call('nameCard', { card: ids[0], title: 'again' }, { as: system })
  await untilTried('the page that held the answer was sent the change', () => second.of('rows', 'same').length === 1)
  assert.equal(second.of('rows', 'same')[0].was, mark)
})

test('[21-9] a list of which more than half changed, a list in which two rows hold one id, and an answer that is no list of rows are sent whole', async (t) => {
  const { app, origin } = await board(t)
  for (let rank = 1; rank <= 6; rank++) await addCard(app, `card ${rank}`, rank)
  const page = watcher(app, origin)
  const cards = await page.watch('cards', 'allCards')
  assert.equal((await page.watch('count', 'countCards')).value, 6)
  assert.deepEqual(
    (await page.watch('titles', 'titles')).value,
    [1, 2, 3, 4, 5, 6].map((rank) => `card ${rank}`),
  )
  assert.equal(rowsOf((await page.watch('twice', 'twice')).value).length, 12)

  // Three rows are added to six: a third of the new list is named, so it is a rows message.
  const all = idsOf(cards.value)
  await app.call('fillCards', { from: 7, to: 10 }, { as: system })
  await untilTried('the nine cards were sent', () => page.of('rows', 'cards').length === 1)
  assert.equal(rowsOf(page.of('rows', 'cards')[0].put).length, 3)
  // The count is a number, the titles a list of texts, and the doubled list holds each id twice: each is sent whole.
  await untilTried('the others were sent whole', () =>
    ['count', 'titles', 'twice'].every((id) => page.of('result', id).length === 2),
  )
  assert.equal(page.of('result', 'count')[1].value, 9)
  assert.equal(rowsOf(page.of('result', 'twice')[1].value).length, 18)
  assert.deepEqual(
    ['count', 'titles', 'twice'].map((id) => page.of('rows', id).length),
    [0, 0, 0],
  )

  // Every row turns its rank: more than half of the list changed, and the answer is sent whole.
  await app.call('turnCards', {}, { as: system })
  await untilTried('the turned list was sent', () => page.of('result', 'cards').length === 2)
  const turned = page.of('result', 'cards')[1]
  assert.deepEqual(idsOf(turned.value).slice(-6).reverse(), all)
  assert.equal(turned.mark, markOf(turned.value))
  assert.equal(page.of('rows', 'cards').length, 1)
  // The next change builds on the mark of the whole answer.
  await app.call('addCard', { title: 'last', rank: 100 }, { as: system })
  await untilTried('the last card was sent', () => page.of('rows', 'cards').length === 2)
  assert.equal(page.of('rows', 'cards')[1].was, turned.mark)
})

test('[21-8] a watch of a change, of an action, of a name that is none, of a table of the engine, of a query that is never live, of a query that the caller may not call and with an input that does not fit is answered failed, and nothing is run', async (t) => {
  const { app, origin, dataFolder, bundle } = await board(t)
  const page = watcher(app, origin)
  const before = runsOf(dataFolder, 'addCard') + runsOf(dataFolder, 'ping')
  const code = async (id: string, query: unknown, input: unknown = {}, more: Message = {}): Promise<unknown> => {
    const sent = page.got.length
    page.send({ t: 'watch', id, query, input, ...more })
    await untilTried(`the watch ${id} was answered`, () => page.got.length > sent)
    const message = page.got[sent]
    assert.deepEqual([message.t, message.id], ['failed', id])
    return Object(message.error).code
  }
  assert.equal(await code('change', 'addCard', { title: 'not added', rank: 1 }), 'T0001')
  assert.equal(await code('action', 'ping'), 'T0001')
  assert.equal(await code('none', 'noSuchQuery'), 'T0001')
  assert.equal(await code('engine', '_t_meta'), 'T0001')
  assert.equal(await code('quiet', 'quietCards'), 'T0001')
  assert.equal(await code('no text', 7), 'T0001')
  assert.equal(await code('staff', 'staffCards'), 'T0006')
  assert.equal(await code('signed', 'myCards'), 'T0006')
  assert.equal(await code('misfit', 'cardsAt', { rank: 'first' }), 'T0002')
  assert.equal(await code('more', 'cardsAt', { rank: 1, also: true }), 'T0002')
  // A version that cannot be loaded is told with the one that runs, and no file is looked for by its name.
  const gone = page.got.length
  page.send({ t: 'watch', id: 'old', query: 'allCards', input: {}, version: '../../../data' })
  await untilTried('the watch of a version that is gone was answered', () => page.got.length > gone)
  const told = Object(page.got[gone].error)
  assert.deepEqual([told.code, told.running], ['T0007', bundle.versionId])
  // The running version is served, named or not.
  assert.equal((await page.watch('named', 'allCards', {}, { version: bundle.versionId })).t, 'result')
  // Nothing was written and nothing was called, and the connection stands.
  assert.equal(runsOf(dataFolder, 'addCard') + runsOf(dataFolder, 'ping'), before)
  assert.deepEqual(await app.call('allCards', {}, { as: system }), [])
  assert.equal(page.closed(), false)

  // A frame that names no known message, and a watch with no id, close the connection.
  const unknown = watcher(app, origin)
  unknown.send({ t: 'shout', id: 'x' })
  await untilTried('the connection that sent an unknown message was closed', () => unknown.closed())
  const nameless = watcher(app, origin)
  nameless.send({ t: 'watch', query: 'allCards' })
  await untilTried('the connection that sent a watch with no id was closed', () => nameless.closed())
})

test('[21-8] a query that states refresh is run again on that timer for as long as it is watched, and its answer is sent where it changed', async (t) => {
  const { app, origin, dataFolder, advance } = await board(t, { stands: true })
  const page = watcher(app, origin)
  assert.equal((await page.watch('fresh', 'freshCards')).value, 0)
  // Nothing is written, and its ten seconds pass: the query is run again, and its answer, which is the same, is not sent.
  const ran = runsOf(dataFolder, 'freshCards')
  advance(9000)
  await liveMoment(30)
  assert.equal(runsOf(dataFolder, 'freshCards'), ran)
  advance(1000)
  await untilTried('the query was run on its timer', () => runsOf(dataFolder, 'freshCards') === ran + 1)
  advance(10_000)
  await untilTried('and again ten seconds later', () => runsOf(dataFolder, 'freshCards') === ran + 2)
  assert.equal(page.of('result', 'fresh').length, 1)
  // Once nobody watches it, its timer is taken back.
  page.send({ t: 'unwatch', id: 'fresh' })
  await liveMoment(30)
  advance(9000)
  await liveMoment(30)
  assert.equal(runsOf(dataFolder, 'freshCards'), ran + 2)
  assert.equal(page.closed(), false)
})

test('[21-8] a heavy query that is watched is run again on a query thread, and its page is sent what changed', async (t) => {
  const { app, origin } = await board(t)
  await addCard(app, 'first', 1)
  const page = watcher(app, origin)
  // The count is a thousand more where the query runs on the main thread: it never is.
  assert.equal((await page.watch('count', 'heavyCount')).value, 1)
  const list = await page.watch('cards', 'heavyCards')
  assert.equal(idsOf(list.value).length, 1)
  const second = await addCard(app, 'second', 2)
  await untilTried('the heavy count was sent', () => page.of('result', 'count').length === 2)
  assert.equal(page.of('result', 'count')[1].value, 2)
  await untilTried('the heavy list was sent', () => page.of('rows', 'cards').length === 1)
  assert.deepEqual(idsOf(rowsOf(page.of('rows', 'cards')[0].put).map((put) => put.row)), [second])
  // A write to another table runs neither.
  await app.call('addNotice', { text: 'another table' }, { as: system })
  await liveMoment(80)
  assert.deepEqual([page.of('result', 'count').length, page.of('rows', 'cards').length], [2, 1])
})

test('[21-3] over a real connection a page of the app is sent the first answer, and what a call through the door changed', async (t) => {
  const { app, origin, port } = await board(t)
  const first = await addCard(app, 'first', 1)
  /** Opens a live connection as a page of the app does, and answers what it was sent and whether it was closed. */
  const dialled = (): { link: ReturnType<typeof dial>; got: Message[]; closed: () => boolean } => {
    const link = dial(`http://localhost:${port}/_t/live`, { origin })
    t.after(() => link.close())
    const got: Message[] = []
    let closed = false
    link.each(
      (frame) => void got.push(JSON.parse(String(frame))),
      () => {
        closed = true
      },
    )
    return { link, got, closed: () => closed }
  }
  const page = dialled()
  page.link.send(JSON.stringify({ t: 'watch', id: 'cards', query: 'allCards', input: {} }))
  await untilTried('the first answer arrived', () => page.got.length === 1)
  assert.deepEqual([page.got[0].t, idsOf(page.got[0].value)], ['result', [first]])
  const added = await send(app, `${origin}/_t/call/addCard`, { input: { title: 'through the door', rank: 2 } })
  assert.equal(added.status, 200)
  await untilTried('the change arrived', () => page.got.length === 2)
  assert.deepEqual([page.got[1].t, page.got[1].was, putOf(page.got[1])[0][1]], ['rows', page.got[0].mark, first])
  // A frame of bytes, a text that is no JSON, and a message of more bytes than a call may hold close the connection.
  page.link.send(new Uint8Array([1, 2, 3]))
  await untilTried('the connection was closed for a frame of bytes', () => page.closed())
  const noJson = dialled()
  noJson.link.send('{ no json')
  await untilTried('the connection was closed for a text that is no JSON', () => noJson.closed())
  const large = dialled()
  large.link.send(JSON.stringify({ t: 'unwatch', id: 'x'.repeat(1_048_576) }))
  await untilTried('the connection was closed for a message that is too large', () => large.closed())
  // A message of the largest size is taken.
  const fits = dialled()
  fits.link.send(JSON.stringify({ t: 'unwatch', id: 'x'.repeat(1_048_576 - 30) }))
  fits.link.send(JSON.stringify({ t: 'watch', id: 'cards', query: 'allCards', input: {} }))
  await untilTried('the connection that sent a message of the largest size was answered', () => fits.got.length === 1)
})

test('[21-9] [night] a list of 5,000 rows in which one row changes is one rows message that holds that row, and one write to a table that 10,000 groups watch runs each group once while calls are answered within 50 ms', async (t) => {
  const { app, origin, dataFolder } = await board(t, {
    change: limited({
      liveConnections: 100,
      watches: 20_000,
      liveMessages: 1_000_000,
      groups: 10_002,
      anyonePerMinute: 1_000_000,
    }),
  })
  await app.call('fillCards', { from: 0, to: 5000 }, { as: system })
  const page = watcher(app, origin)
  const first = await page.watch('cards', 'allCards')
  const ids = idsOf(first.value)
  assert.equal(ids.length, 5000)

  // One row of the 5,000 changes: one message, which holds that row and no other.
  await app.call('nameCard', { card: ids[2500], title: 'the one that changed' }, { as: system })
  await untilTried('the change was sent', () => page.got.length === 2)
  assert.deepEqual([page.got[1].t, page.got[1].was, putOf(page.got[1])], ['rows', first.mark, [[ids[2500], ids[2499]]]])
  assert.ok(JSON.stringify(page.got[1]).length < 1000, 'the message holds one row')
  // A row that only moved is named with its new place.
  await app.call('moveCard', { card: ids[10], rank: 4000.5 }, { as: system })
  await untilTried('the move was sent', () => page.got.length === 3)
  assert.deepEqual([putOf(page.got[2]), page.got[2].removed], [[[ids[10], ids[4000]]], []])
  let held = applied(applied(rowsOf(first.value), page.got[1]), page.got[2])
  assert.deepEqual(held, JSON.parse(JSON.stringify(await app.call('allCards', {}, { as: system }))))
  // A page that holds another mark is sent the whole answer when it watches again.
  const again = await page.watch('cards', 'allCards', {}, { have: first.mark })
  assert.deepEqual([again.t, rowsOf(again.value).length, again.mark], ['result', 5000, page.got[2].mark])
  // More than half of the list changes: it is sent whole.
  await app.call('turnCards', {}, { as: system })
  await untilTried('the turned list was sent', () => page.got.length === 5)
  assert.deepEqual([page.got[4].t, rowsOf(page.got[4].value).length], ['result', 5000])
  held = rowsOf(page.got[4].value)
  page.close()

  // 10,000 groups watch the table of the cards, each the cards of one rank, over fifty connections.
  const pages = Array.from({ length: 50 }, () => watcher(app, origin))
  for (let n = 0; n < 10_000; n++)
    pages[n % 50].send({ t: 'watch', id: `at ${n}`, query: 'cardsAt', input: { rank: -n } })
  await untilTried('every watch was answered', () => pages.every((one) => one.got.length === 200), 12_000)
  const ran = runsOf(dataFolder, 'cardsAt')
  assert.equal(ran, 10_000)
  // The group that is marked last tells when every group before it was run: it watches the count of the cards.
  const lastOne = watcher(app, origin)
  await lastOne.watch('count', 'countCards')
  // The door has answered a call before, so that no call of the measure loads the code of the door first.
  assert.equal((await send(app, `${origin}/_t/call/countCards`, {})).status, 200)
  // One write to the table. While the groups are run, calls are made, and each is answered within 50 ms.
  await app.call('addCard', { title: 'the one of rank 7', rank: -7 }, { as: system })
  const times: number[] = []
  const sentTo = (): number => pages.reduce((sum, one) => sum + one.got.length, 0)
  let done = false
  const calls = (async () => {
    while (!done) {
      const began = performance.now()
      await send(app, `${origin}/_t/call/countCards`, {})
      times.push(performance.now() - began)
      await new Promise((next) => setImmediate(next))
    }
  })()
  await untilTried('the last group was run', () => lastOne.of('result', 'count').length === 2, 12_000)
  done = true
  await calls
  await liveMoment(100)
  // Each group was run once, and the 9,999 whose answer did not change were sent nothing.
  assert.equal(runsOf(dataFolder, 'cardsAt'), ran + 10_000)
  assert.equal(sentTo(), 10_001)
  const changed = pages[7 % 50].of('rows', 'at 7')
  assert.equal(changed.length, 1)
  assert.ok(times.length > 3, `calls were made meanwhile: ${times.length}`)
  assert.ok(Math.max(...times) <= 50, `a call made meanwhile took ${Math.max(...times).toFixed(1)} ms`)
  for (const one of [...pages, lastOne]) one.close()
  await liveMoment(50)

  // Five writes within 5 ms cause one run of a group. A round in which the writes took longer shows nothing, and is done again.
  const last = watcher(app, origin)
  await last.watch('count', 'countCards')
  let shown = false
  for (let round = 0; round < 20 && !shown; round++) {
    const counted = runsOf(dataFolder, 'countCards')
    const sent = last.of('result', 'count').length
    const began = performance.now()
    for (let n = 0; n < 5; n++)
      await app.call('addCard', { title: `burst ${round} ${n}`, rank: 9000 + n }, { as: system })
    const took = performance.now() - began
    await untilTried('the count was sent', () => last.of('result', 'count').length > sent)
    await liveMoment(60)
    if (took >= 5) continue
    shown = true
    assert.equal(runsOf(dataFolder, 'countCards'), counted + 1)
    assert.equal(last.of('result', 'count').length, sent + 1)
    assert.equal(last.of('result', 'count').at(-1)?.value, await app.call('countCards', {}, { as: system }))
  }
  assert.equal(shown, true, 'five writes were made within 5 ms')
})
