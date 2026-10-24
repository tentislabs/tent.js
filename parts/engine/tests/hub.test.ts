import assert from 'node:assert/strict'
import { request } from 'node:http'
import { test } from 'node:test'
import type { App } from '../index.ts'
import { system } from './apps.ts'
import type { Message } from './watching.ts'
import {
  addCard,
  addBoardUser,
  board,
  cookieOf,
  idsOf,
  limited,
  liveMoment,
  opening,
  runsOf,
  untilTried,
  watcher,
} from './watching.ts'

/**
 * Answers what tells that the hub has run every group that the writes so far marked: a notice is added, and the
 * page that watches the notices is sent it after everything that was marked before.
 */
async function quietOf(app: App, origin: string): Promise<() => Promise<void>> {
  const guard = watcher(app, origin)
  await guard.watch('guard', 'allNotices')
  return async () => {
    const before = guard.got.length
    await app.call('addNotice', { text: `guard ${before}` }, { as: system })
    await untilTried('the hub ran what was marked', () => guard.got.length > before)
    await liveMoment(20)
  }
}

/** The code of the error that a `failed` message holds. */
const failedWith = (message: Message | undefined): unknown => Object(message?.error).code

test('[21-3] two pages that watch one query as one caller cause one run of it for each write, and a page that watches another table is sent nothing', async (t) => {
  const { app, origin, dataFolder } = await board(t)
  const first = await addCard(app, 'first', 1)
  const quiet = await quietOf(app, origin)
  const [one, two, other] = [watcher(app, origin), watcher(app, origin), watcher(app, origin)]

  // Each page is answered what the query answers now, with the mark of that answer.
  const [a, b] = [await one.watch('cards', 'allCards'), await two.watch('mine', 'allCards')]
  assert.deepEqual([a.t, b.t], ['result', 'result'])
  assert.deepEqual([idsOf(a.value), idsOf(b.value)], [[first], [first]])
  assert.match(String(a.mark), /^[0-9a-f]{16}$/)
  assert.equal(a.mark, b.mark)
  assert.equal('at' in a, false, 'an app on one machine names no write')
  assert.equal((await other.watch('notices', 'allNotices')).t, 'result')

  // One write to the table that both read: the query is run once, and each page is sent what changed.
  let ran = runsOf(dataFolder, 'allCards')
  const second = await addCard(app, 'second', 2)
  await untilTried(
    'both pages were sent the new card',
    () => one.of('rows').length === 1 && two.of('rows').length === 1,
  )
  await quiet()
  assert.equal(runsOf(dataFolder, 'allCards'), ran + 1)
  for (const page of [one, two]) {
    const sent = page.of('rows')[0]
    assert.deepEqual([sent.was, idsOf(Object(sent.put).map((put: Message) => put.row))], [a.mark, [second]])
    assert.deepEqual([Object(sent.put)[0].after, sent.removed], [first, []])
  }
  assert.equal(one.of('rows')[0].id, 'cards')
  assert.equal(two.of('rows')[0].id, 'mine')
  // The page that watches the notices was sent the notices of the guard, and nothing of the cards.
  assert.deepEqual(
    other.got.filter((message) => message.id !== 'notices'),
    [],
  )

  // A write to another table runs the query of the cards for nobody.
  ran = runsOf(dataFolder, 'allCards')
  const [onesBefore, twosBefore] = [one.got.length, two.got.length]
  await app.call('addNotice', { text: 'a notice' }, { as: system })
  await quiet()
  assert.equal(runsOf(dataFolder, 'allCards'), ran)
  assert.deepEqual([one.got.length, two.got.length], [onesBefore, twosBefore])

  // The same query with another input, and as another caller, is a group of its own, with a run of its own.
  const ada = await addBoardUser(app, 'Ada')
  const hers = watcher(app, origin, { cookie: cookieOf(app, ada), as: ada })
  assert.equal((await hers.watch('cards', 'allCards')).t, 'result')
  ran = runsOf(dataFolder, 'allCards')
  await addCard(app, 'third', 3)
  await untilTried('the user was sent the new card', () => hers.of('rows').length === 1)
  await quiet()
  assert.equal(runsOf(dataFolder, 'allCards'), ran + 2)

  // A page that stopped watching is sent nothing more, and a group that nobody watches is not run.
  one.send({ t: 'unwatch', id: 'cards' })
  two.close()
  hers.close()
  await quiet()
  ran = runsOf(dataFolder, 'allCards')
  const held = one.got.length
  await addCard(app, 'fourth', 4)
  await quiet()
  assert.deepEqual([runsOf(dataFolder, 'allCards'), one.got.length], [ran, held])
})

test('[21-3] a group that reads one row by its id is run when that row is written and for no other, a raw write that states no table runs every group, and what a group reads is taken anew from every run', async (t) => {
  const { app, origin, dataFolder } = await board(t)
  const [first, second] = [await addCard(app, 'first', 1), await addCard(app, 'second', 2)]
  const quiet = await quietOf(app, origin)
  const page = watcher(app, origin)
  const answered = await page.watch('one', 'oneCard', { card: first })
  assert.deepEqual([answered.t, Object(answered.value).title], ['result', 'first'])

  // Another row of the same table is written: the group is not run. Its own row is: it is.
  let ran = runsOf(dataFolder, 'oneCard')
  await app.call('nameCard', { card: second, title: 'the second' }, { as: system })
  await addCard(app, 'third', 3)
  await quiet()
  assert.deepEqual([runsOf(dataFolder, 'oneCard'), page.of('result', 'one').length], [ran, 1])
  await app.call('nameCard', { card: first, title: 'the first' }, { as: system })
  await untilTried('the page was sent its row', () => page.of('result', 'one').length === 2)
  assert.equal(Object(page.of('result', 'one')[1].value).title, 'the first')
  assert.equal(runsOf(dataFolder, 'oneCard'), ran + 1)

  // A raw write that states the table it touches runs the groups that read that table, and no other.
  const notices = watcher(app, origin)
  await notices.watch('notices', 'allNotices')
  await page.watch('count', 'countCards')
  ran = runsOf(dataFolder, 'allNotices')
  let counted = runsOf(dataFolder, 'countCards')
  await app.call('rawStated', { title: 'third', rank: 30 }, { as: system })
  await untilTried('the count was run again', () => runsOf(dataFolder, 'countCards') === counted + 1)
  await liveMoment(30)
  assert.equal(runsOf(dataFolder, 'allNotices'), ran)

  // A raw write that states none runs every group, the group of the one row and that of the notices among them.
  counted = runsOf(dataFolder, 'countCards')
  const ones = runsOf(dataFolder, 'oneCard')
  await app.call('rawRank', { title: 'third', rank: 31 }, { as: system })
  await untilTried('every group was run again', () => runsOf(dataFolder, 'allNotices') === ran + 1)
  await quiet()
  assert.deepEqual([runsOf(dataFolder, 'countCards'), runsOf(dataFolder, 'oneCard')], [counted + 1, ones + 1])
  // The answers did not change, so nothing was sent for them.
  assert.equal(page.of('result', 'count').length, 1)

  // A query that read the notices alone reads the cards once a notice stands: from then on a card runs it.
  const fresh = await board(t)
  const turning = watcher(fresh.app, fresh.origin)
  assert.equal((await turning.watch('turns', 'turning')).value, 0)
  await addCard(fresh.app, 'unseen', 1)
  await liveMoment(40)
  assert.equal(runsOf(fresh.dataFolder, 'turning'), 1)
  await fresh.app.call('addNotice', { text: 'now the cards count' }, { as: system })
  await untilTried('the query was run for the notice', () => turning.of('result', 'turns').length === 2)
  assert.equal(turning.of('result', 'turns')[1].value, 1)
  await addCard(fresh.app, 'seen', 2)
  await untilTried('the query was run for the card', () => turning.of('result', 'turns').length === 3)
  assert.equal(turning.of('result', 'turns')[2].value, 2)
})

/** Asks for the opening of a WebSocket over a real connection, and answers the status it was refused with, or 101. */
function upgraded(port: number, headers: Record<string, string>): Promise<number> {
  return new Promise((done, failed) => {
    const asking = request({
      host: '127.0.0.1',
      port,
      path: '/_t/live',
      headers: {
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-version': '13',
        'sec-websocket-key': Buffer.from('a key of 16 bytes').subarray(0, 16).toString('base64'),
        ...headers,
      },
    })
    asking.on('response', (answer) => {
      answer.resume()
      done(answer.statusCode ?? 0)
    })
    asking.on('upgrade', (_answer, socket) => {
      socket.destroy()
      done(101)
    })
    asking.on('error', failed)
    asking.end()
  })
}

test('[21-7] the opening of /_t/live from a page of another site, and with no Origin, is refused with T0004, with the cookie of a valid session in the request', async (t) => {
  const listed = 'https://partner.tent.test'
  const { app, origin, port } = await board(t, {
    change: limited({ liveConnections: 3 }, (d) => void Object.assign(d.project, { api: { origins: [listed] } })),
  })
  const ada = await addBoardUser(app, 'Ada', ['staff'])
  const cookie = cookieOf(app, ada)

  // The cookie is that of a user, and the opening is refused all the same: before a connection is made.
  for (const site of ['https://evil.tent.test', `http://localhost:${port + 1}`, 'null', null]) {
    assert.throws(() => app.live(opening(origin, { cookie, as: ada, site })), { code: 'T0004' }, `from ${site}`)
    assert.throws(() => app.live(opening(origin, { site })), { code: 'T0004' }, `from ${site}, with no cookie`)
  }
  // The app's own pages open it, and so does a site that the project lists.
  const own = watcher(app, origin, { cookie, as: ada })
  assert.equal((await own.watch('cards', 'staffCards')).t, 'result')
  const partner = watcher(app, origin, { site: listed })
  assert.equal((await partner.watch('cards', 'allCards')).t, 'result')
  // A request for a name that is none of the app's is refused before anything else is looked at.
  assert.throws(() => app.live(opening('http://other.tent.test')), { code: 'T0017' })

  // One address holds `liveConnections` connections at once: one more is T0005, and a closed one gives its place up.
  const third = watcher(app, origin)
  assert.throws(() => app.live(opening(origin)), { code: 'T0005' })
  third.close()
  await untilTried('the closed connection was told closed', () => third.closed())
  await liveMoment(30)
  const fourth = watcher(app, origin)
  assert.equal((await fourth.watch('cards', 'allCards')).t, 'result')
  for (const page of [own, partner, fourth]) page.close()
  await liveMoment(30)

  // Over a real connection the same holds: the opening is answered with the status of its refusal, and no socket.
  const at = `http://localhost:${port}`
  assert.equal(await upgraded(port, { host: `localhost:${port}`, origin: 'https://evil.tent.test', cookie }), 403)
  assert.equal(await upgraded(port, { host: `localhost:${port}`, cookie }), 403)
  assert.equal(await upgraded(port, { host: `localhost:${port}`, origin: at, cookie }), 101)
  // A plain request for the address, which asks for no WebSocket, is not found.
  const plain = await app.request(new Request(`${origin}/_t/live`, { headers: { origin } }))
  assert.equal(plain.status, 404)
})

test('[21-8] a user who loses a role while a page watches a query that needs it is sent failed at the next write, and a page whose user is no longer its caller is sent changed and closed', async (t) => {
  const { app, origin, dataFolder } = await board(t)
  const [ada, bo] = [await addBoardUser(app, 'Ada', ['staff']), await addBoardUser(app, 'Bo', ['staff'])]
  await addCard(app, 'first', 1)
  const hers = watcher(app, origin, { cookie: cookieOf(app, ada), as: ada })
  const his = watcher(app, origin, { cookie: cookieOf(app, bo), as: bo })
  assert.equal((await hers.watch('staff', 'staffCards')).t, 'result')
  assert.equal((await hers.watch('all', 'allCards')).t, 'result')
  assert.equal((await his.watch('staff', 'staffCards')).t, 'result')

  // The role is taken away, which is a write to another table: the watch stands until the next run of its group.
  await app.call('setRoles', { user: ada, roles: [] }, { as: system })
  await liveMoment(40)
  assert.deepEqual(hers.of('failed'), [])
  await addCard(app, 'second', 2)
  await untilTried('the watch that needs the role failed', () => hers.of('failed').length === 1)
  assert.deepEqual([hers.of('failed')[0].id, failedWith(hers.of('failed')[0])], ['staff', 'T3101'])
  // The caller was built anew for that run: the log names the refusal. Her other watch, and his, go on.
  await untilTried(
    'the others were sent the card',
    () => his.of('rows').length === 1 && hers.of('rows', 'all').length === 1,
  )
  assert.equal(hers.closed(), false)
  // The watch is over: the next write sends her nothing for it.
  const ran = runsOf(dataFolder, 'staffCards')
  await addCard(app, 'third', 3)
  await untilTried('he was sent the third card', () => his.of('rows').length === 2)
  await untilTried('she was sent it by her other watch', () => hers.of('rows', 'all').length === 2)
  assert.equal(hers.of('failed').length, 1)
  assert.equal(runsOf(dataFolder, 'staffCards'), ran + 1)
  // A watch that she sends anew is refused at once, and nothing is run for it.
  assert.equal(failedWith(await hers.watch('again', 'staffCards')), 'T3101')

  // A page that names another user than its caller is sent `changed` and closed, and so is one that names none.
  for (const as of [bo, undefined]) {
    const wrong = watcher(app, origin, { cookie: cookieOf(app, ada), ...(as ? { as } : {}) })
    await untilTried('the page was closed', () => wrong.closed())
    assert.deepEqual(wrong.got, [{ t: 'changed' }])
  }
  const visitor = watcher(app, origin, { as: ada })
  await untilTried('the page of a visitor that names a user was closed', () => visitor.closed())
  assert.deepEqual(visitor.got, [{ t: 'changed' }])

  // His row is removed while he watches: at the next run his page is no longer his, and is told so and closed.
  await app.call('dropUser', { user: bo }, { as: system })
  await addCard(app, 'fourth', 4)
  await untilTried('his page was closed', () => his.closed())
  assert.deepEqual(his.got.at(-1), { t: 'changed' })
})

test('[21-8] every connection is sent alive each 30 seconds, a busy one too, and one that does not answer within 15 is closed', async (t) => {
  const { app, origin, advance } = await board(t, { stands: true })
  const signs = { signs: true } as const
  const [quietOne, busy, silent] = [
    watcher(app, origin, signs),
    watcher(app, origin, signs),
    watcher(app, origin, signs),
  ]
  await addCard(app, 'the card that stands', 0)
  await busy.watch('cards', 'allCards')
  await addCard(app, 'first', 1)
  await untilTried('the busy page was sent the card', () => busy.of('rows').length === 1)

  advance(29_000)
  await liveMoment(30)
  assert.deepEqual(
    [quietOne, busy, silent].map((page) => page.of('alive').length),
    [0, 0, 0],
  )
  // The busy page is sent something a moment before the sign of life is due, and is sent the sign all the same.
  await addCard(app, 'second', 2)
  await untilTried('the busy page was sent the second card', () => busy.of('rows').length === 2)
  advance(1000)
  await untilTried('each page was sent a sign of life', () =>
    [quietOne, busy, silent].every((page) => page.of('alive').length === 1),
  )
  // Two answer, and one does not: after 14 seconds it still stands, and after 15 it is closed.
  quietOne.send({ t: 'alive' })
  busy.send({ t: 'alive' })
  await liveMoment(30)
  advance(14_000)
  await liveMoment(30)
  assert.equal(silent.closed(), false)
  advance(1000)
  await untilTried('the page that did not answer was closed', () => silent.closed())
  assert.deepEqual([quietOne.closed(), busy.closed()], [false, false])
  // The next sign comes 30 seconds after the first, and a page that answers each stays for as long as it does.
  for (let round = 2; round <= 4; round++) {
    advance(15_000)
    await untilTried(`the sign of round ${round} was sent`, () => quietOne.of('alive').length === round)
    assert.equal(busy.of('alive').length, round)
    quietOne.send({ t: 'alive' })
    busy.send({ t: 'alive' })
    await liveMoment(30)
    advance(15_000)
    await liveMoment(30)
  }
  assert.deepEqual([quietOne.closed(), busy.closed()], [false, false])
  assert.equal(silent.of('alive').length, 1)
})

test('[21-8] one watch more than a connection may hold and one group more than an app may hold are answered failed with T0005, and a flood of messages closes its connection', async (t) => {
  const { app, origin, dataFolder } = await board(t, { change: limited({ watches: 3, groups: 5, liveMessages: 20 }) })
  await addCard(app, 'first', 1)
  const page = watcher(app, origin)
  for (const id of ['a', 'b', 'c']) assert.equal((await page.watch(id, 'allCards')).t, 'result')
  // The fourth watch is one more than the connection may hold: it is refused, and nothing is run for it.
  let ran = runsOf(dataFolder, 'countCards')
  assert.equal(failedWith(await page.watch('d', 'countCards')), 'T0005')
  assert.equal(runsOf(dataFolder, 'countCards'), ran)
  // A second watch under an id that is still watched takes its place, and is none more.
  const taken = await page.watch('c', 'countCards')
  assert.deepEqual([taken.t, taken.value], ['result', 1])
  // What stood under that id is watched no longer: a new card is sent to the two that are left, and the count once.
  await addCard(app, 'second', 2)
  await untilTried('the count was sent', () => page.of('result', 'c').length === 3)
  assert.equal(page.of('result', 'c')[2].value, 2)
  await untilTried('the cards were sent', () => page.of('rows', 'a').length === 1 && page.of('rows', 'b').length === 1)
  assert.equal(page.of('rows', 'c').length, 0)
  // A watch that is given up frees its place.
  page.send({ t: 'unwatch', id: 'a' })
  assert.equal((await page.watch('e', 'allNotices')).t, 'result')

  // The app holds five groups: the three of this page, and two more. One more is refused, and nothing is run.
  const others = watcher(app, origin)
  for (const rank of [1, 2]) assert.equal((await others.watch(`at ${rank}`, 'cardsAt', { rank })).t, 'result')
  ran = runsOf(dataFolder, 'cardsAt')
  assert.equal(failedWith(await others.watch('at 3', 'cardsAt', { rank: 3 })), 'T0005')
  assert.equal(runsOf(dataFolder, 'cardsAt'), ran)
  // A watch that joins a group which stands is one more of none, and a group that its last page left is one less.
  const joins = watcher(app, origin)
  assert.equal((await joins.watch('at 2', 'cardsAt', { rank: 2 })).t, 'result')
  others.send({ t: 'unwatch', id: 'at 1' })
  assert.equal((await others.watch('at 3', 'cardsAt', { rank: 3 })).t, 'result')

  // More than `liveMessages` messages in one second close the connection, and the others go on.
  const flood = watcher(app, origin)
  for (let n = 0; n < 21; n++) flood.send({ t: 'unwatch', id: `none ${n}` })
  await untilTried('the connection that flooded was closed', () => flood.closed())
  assert.deepEqual([page.closed(), others.closed(), joins.closed()], [false, false, false])
  // Twenty in a second are taken, and twenty more in the next.
  const steady = watcher(app, origin)
  for (let n = 0; n < 20; n++) steady.send({ t: 'unwatch', id: `none ${n}` })
  await liveMoment(1100)
  for (let n = 0; n < 19; n++) steady.send({ t: 'unwatch', id: `none ${n}` })
  assert.equal((await steady.watch('cards', 'allCards')).t, 'result')
  assert.equal(steady.closed(), false)
})
