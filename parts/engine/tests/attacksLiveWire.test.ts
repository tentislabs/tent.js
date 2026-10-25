import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deflateRawSync } from 'node:zlib'
import { send, system } from './apps.ts'
import type { RawLive } from './rawLive.ts'
import { quietOf, rawLive } from './rawLive.ts'
import { addCard, board, limited, liveMoment, runsOf, untilTried, watcher } from './watching.ts'
import { held } from '../../../rig/budgets.ts'

/** A watch of the count of the cards, as the text of its frame. */
const countWatch = (id: string): string => JSON.stringify({ t: 'watch', id, query: 'countCards', input: {} })

test('[05-5.4] a frame that is no JSON, one that is no record, one with an unknown t, one over callSize, one of bytes and a packed one each close their connection, and no other', async (t) => {
  const { app, origin, port, dataFolder } = await board(t, { change: limited({ callSize: 4096, liveConnections: 30 }) })
  await addCard(app, 'first', 1)
  const stays = watcher(app, origin)
  assert.equal((await stays.watch('cards', 'allCards')).t, 'result')

  /** Opens a connection that is served, shown by a watch that is answered. */
  const served = async (headers: Record<string, string> = {}): Promise<RawLive> => {
    const one = await rawLive(port, { origin, ...headers })
    assert.equal(one.status, 101)
    one.frame(1, countWatch('first'))
    await untilTried('the connection was served', () => one.got.length === 1)
    return one
  }
  const watch = countWatch('second')
  const padded = (bytes: number): string => {
    const head = '{"t":"watch","id":"second","query":"countCards","input":{},"pad":"'
    return `${head}${'x'.repeat(bytes - head.length - 2)}"}`
  }
  const frames: [string, (one: RawLive) => void][] = [
    ['a text that is no JSON', (one) => one.frame(1, '{"t":"watch","id":"second"')],
    ['a list', (one) => one.frame(1, `[${watch}]`)],
    ['a text of JSON', (one) => one.frame(1, JSON.stringify(watch))],
    ['a number', (one) => one.frame(1, '7')],
    ['nothing', (one) => one.frame(1, 'null')],
    ['an empty text', (one) => one.frame(1, '')],
    ['no t', (one) => one.frame(1, '{"id":"second","query":"countCards","input":{}}')],
    ['an unknown t', (one) => one.frame(1, '{"t":"watching","id":"second","query":"countCards","input":{}}')],
    ['a t of the engine', (one) => one.frame(1, '{"t":"result","id":"first","value":9,"mark":"0000000000000000"}')],
    ['a t that every object holds', (one) => one.frame(1, '{"t":"constructor","id":"second"}')],
    ['a watch with no id', (one) => one.frame(1, '{"t":"watch","query":"countCards","input":{}}')],
    ['a watch whose id is no text', (one) => one.frame(1, '{"t":"watch","id":7,"query":"countCards","input":{}}')],
    ['an unwatch with no id', (one) => one.frame(1, '{"t":"unwatch"}')],
    ['one byte over callSize', (one) => one.frame(1, padded(4097))],
    ['far over callSize', (one) => one.frame(1, padded(200_000))],
    ['bytes', (one) => one.frame(2, watch)],
    ['a packed frame', (one) => one.frame(1, deflateRawSync(Buffer.from(watch)), true)],
    ['a piece of a message that has no beginning', (one) => one.frame(0, watch)],
  ]
  const ran = runsOf(dataFolder, 'countCards')
  for (const [what, sent] of frames) {
    const one = await served()
    sent(one)
    await untilTried(`${what} closed its connection`, () => one.closed())
    assert.equal(one.got.filter((message) => message.id === 'second').length, 0, what)
    one.end()
  }
  // A connection that offers to pack its frames is taken with no such agreement, and a packed frame closes it.
  const offered = await served({ 'sec-websocket-extensions': 'permessage-deflate; client_max_window_bits' })
  assert.equal(offered.extensions, '')
  offered.frame(1, deflateRawSync(Buffer.from(watch)), true)
  await untilTried('a packed frame closed the connection that offered it', () => offered.closed())
  assert.equal(offered.got.length, 1)

  // A message of the largest size is taken, and nothing was run for a frame that closed its connection.
  const whole = await served()
  whole.frame(1, padded(4096))
  await untilTried('the message of the largest size was answered', () => whole.got.length === 2)
  whole.end()
  assert.equal(runsOf(dataFolder, 'countCards'), ran + frames.length + 3)
  // The page that stood beside them was closed by none of it, and is still sent what changes.
  await addCard(app, 'second', 2)
  await untilTried('the page that stayed was sent the card', () => stays.of('rows').length === 1)
  assert.equal(stays.closed(), false)
})

test('[05-5.4] a frame whose t is no text, but a list or a number that reads as the name of a message, closes its connection and is taken as no message', async (t) => {
  const { app, origin, port, dataFolder } = await board(t)
  await addCard(app, 'first', 1)
  const ran = runsOf(dataFolder, 'countCards')
  for (const text of [
    '{"t":["watch"],"id":"second","query":"countCards","input":{}}',
    '{"t":[["watch"]],"id":"second","query":"countCards","input":{}}',
    '{"t":["alive"]}',
  ]) {
    const one = await rawLive(port, { origin })
    assert.equal(one.status, 101)
    one.frame(1, text)
    await untilTried(`the frame closed its connection: ${text}`, () => one.closed(), 300)
    assert.deepEqual(one.got, [])
    one.end()
  }
  assert.equal(runsOf(dataFolder, 'countCards'), ran)
})

test('[05-5.3] a watch whose query is a record with a toString of its own, and one whose input is nested twenty thousand deep, are failed or close their connection, and the engine goes on', async (t) => {
  const { app, origin, port } = await board(t)
  await addCard(app, 'first', 1)
  const stays = watcher(app, origin)
  assert.equal((await stays.watch('cards', 'allCards')).t, 'result')
  const deep = `${'['.repeat(20_000)}${']'.repeat(20_000)}`
  const texts = [
    '{"t":"watch","id":"named","query":{"toString":"allCards"},"input":{}}',
    '{"t":"watch","id":"named","query":{"toString":null,"valueOf":null},"input":{}}',
    `{"t":"watch","id":"deep","query":"allCards","input":${deep}}`,
    `{"t":"watch","id":"deep","query":"cardsAt","input":{"rank":${deep}}}`,
  ]
  for (const text of texts) {
    const one = await rawLive(port, { origin })
    assert.equal(one.status, 101)
    one.frame(1, text)
    await untilTried(`the watch was refused: ${text.slice(0, 70)}`, () => one.closed() || one.got.length === 1)
    if (!one.closed()) assert.equal(one.got[0].t, 'failed')
    one.end()
  }
  // The engine did not stop for any of them: it answers a call, and the page beside them is sent what changes.
  assert.equal((await send(app, `${origin}/_t/call/countCards`, {})).status, 200)
  await addCard(app, 'second', 2)
  await untilTried('the page that stayed was sent the card', () => stays.of('rows').length === 1)
})

test('[05-5.5] a thousand watches and unwatches a second on one connection close it at the limit of messages, what it watched is run no more, and others are answered meanwhile', async (t) => {
  const { app, origin, port, dataFolder } = await board(t)
  await addCard(app, 'first', 1)
  const quiet = await quietOf(app, origin)
  const other = watcher(app, origin)
  assert.equal((await other.watch('cards', 'allCards')).t, 'result')
  const flood = await rawLive(port, { origin })
  assert.equal(flood.status, 101)

  // A thousand pairs are written at once, and a call and a watch of others are sent while the hub takes them.
  const began = performance.now()
  for (let n = 0; n < 1000; n++) {
    flood.text({ t: 'watch', id: `w${n}`, query: 'cardsAt', input: { rank: n } })
    flood.text({ t: 'unwatch', id: `w${n}` })
  }
  const called = send(app, `${origin}/_t/call/countCards`, {})
  const watched = other.watch('count', 'countCards')
  assert.equal((await called).status, 200)
  assert.equal((await watched).t, 'result')
  assert.ok(
    performance.now() - began < 2000,
    `a call and a watch beside the flood took ${performance.now() - began} ms`,
  )
  await untilTried('the connection that flooded was closed', () => flood.closed())
  assert.equal(other.closed(), false)
  // No more than the messages of one second were taken: a watch is each second message.
  await quiet()
  const ran = runsOf(dataFolder, 'cardsAt')
  assert.ok(ran <= 50, `${ran} watches of the flood were run`)
  assert.ok(flood.got.length <= 50)
  // Nothing of the flood is left: a card at a rank that it watched runs its query for nobody.
  await addCard(app, 'at a rank of the flood', 3)
  await untilTried('the other page was sent the card', () => other.of('rows', 'cards').length === 1)
  await quiet()
  assert.equal(runsOf(dataFolder, 'cardsAt'), ran)

  // The same without a network, where nothing bounds how fast the frames arrive.
  const inside = watcher(app, origin)
  for (let n = 0; n < 1000; n++) {
    inside.send({ t: 'watch', id: `w${n}`, query: 'cardsAt', input: { rank: n } })
    inside.send({ t: 'unwatch', id: `w${n}` })
  }
  await untilTried('the connection that flooded with no network was closed', () => inside.closed())
  await quiet()
  assert.ok(runsOf(dataFolder, 'cardsAt') - ran <= 50)
  assert.equal((await send(app, `${origin}/_t/call/countCards`, {})).status, 200)
})

test('[05-5.10] a page that opens a connection, watches a query that changes often and never reads is closed once more than 1 MB waits for it, and its watch is run no more', async (t) => {
  const { app, origin, port, dataFolder } = await board(t)
  await app.call('fillCards', { from: 0, to: 4000 }, { as: system })
  const quiet = await quietOf(app, origin)
  const reads = await rawLive(port, { origin })
  const never = await rawLive(port, { origin })
  assert.deepEqual([reads.status, never.status], [101, 101])
  reads.text({ t: 'watch', id: 'cards', query: 'allCards', input: {} })
  await untilTried('the page that reads was answered', () => reads.got.length === 1)
  never.pause()
  never.text({ t: 'watch', id: 'cards', query: 'heavyCards', input: {} })
  await untilTried('the watch of the page that never reads was run', () => runsOf(dataFolder, 'heavyCards') === 1)

  // Every card is turned, again and again: each time the whole list, some 400 KB, is sent to both pages.
  let [turns, ranBefore, stopped] = [0, runsOf(dataFolder, 'heavyCards'), 0]
  while (turns < 60 && stopped < 3) {
    await app.call('turnCards', {}, { as: system })
    turns++
    await untilTried(
      `the page that reads was sent the turned cards: ${turns} ${reads.got.length} ${never.bytes()} ${runsOf(dataFolder, 'heavyCards')}`,
      () => reads.got.length === turns + 1,
      3000,
    )
    await quiet()
    const ran = runsOf(dataFolder, 'heavyCards')
    stopped = ran === ranBefore ? stopped + 1 : 0
    ranBefore = ran
  }
  // The query of the page that never reads is run no more, long before sixty lists wait for it: it was closed.
  assert.equal(stopped, 3, `after ${turns} lists of 400 KB the watch of the page that never reads was still run`)
  // The engine counts what waits in it, and the system of each end first takes what it will into its own buffers:
  // on Linux up to 6 MB to read and 4 MB to send. So the page was sent at most that, the 1 MB and a list more.
  never.resume()
  await untilTried('the page that never read sees its connection closed', () => never.closed())
  assert.ok(never.bytes() < 12 * 1024 * 1024, `it was sent ${never.bytes()} bytes in ${turns} turns`)
  assert.equal(reads.closed(), false)
})

test('[05-5.11] a hundred watches of heavy queries from one address wait for the query threads, each is answered, and calls are still answered meanwhile', async (t) => {
  const { app, origin, dataFolder } = await board(t, {
    change: (d) => void Object.assign(d.functions.cardsAt, { heavy: true }),
  })
  await app.call('fillCards', { from: 0, to: 2000 }, { as: system })
  const pages = [watcher(app, origin), watcher(app, origin)]
  const began = performance.now()
  for (let n = 0; n < 100; n++) pages[n % 2].send({ t: 'watch', id: `at ${n}`, query: 'cardsAt', input: { rank: n } })
  // Calls through the door, one after another, while the hundred wait and run: each is answered in good time.
  let longest = 0
  for (let n = 0; n < 30; n++) {
    const from = performance.now()
    assert.equal((await send(app, `${origin}/_t/call/countCards`, {})).status, 200)
    longest = Math.max(longest, performance.now() - from)
    await liveMoment(5)
  }
  held('live.besideWatches', longest, 'ms')
  await untilTried('each of the hundred was answered', () => pages[0].got.length + pages[1].got.length === 100, 3000)
  for (const page of pages)
    for (const message of page.got) {
      assert.equal(message.t, 'result')
      assert.equal(Object(message.value).length, 1)
    }
  // A group whose run was under way when a call wrote its count is run once more: no group is run without end.
  let [ran, same] = [0, 0]
  for (let n = 0; n < 100 && same < 5; n++) {
    await liveMoment(100)
    const now = runsOf(dataFolder, 'cardsAt')
    same = now === ran ? same + 1 : 0
    ran = now
  }
  assert.ok(same === 5 && ran >= 100 && ran <= 300, `the hundred groups were run ${ran} times, and went on`)
  // One write that every one of them read runs each again, and a call is answered meanwhile.
  await app.call('turnCards', {}, { as: system })
  const from = performance.now()
  assert.equal((await send(app, `${origin}/_t/call/countCards`, {})).status, 200)
  assert.ok(performance.now() - from < 1000)
  await untilTried('each of the hundred was run again', () => runsOf(dataFolder, 'cardsAt') >= ran + 100, 3000)
  assert.ok(performance.now() - began < 60_000)
})
