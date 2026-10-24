import assert from 'node:assert/strict'
import { cpSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { addUser as deskUser, bundled, running, system } from './apps.ts'
import type { RawLive } from './rawLive.ts'
import { rawLive } from './rawLive.ts'
import type { Message } from './watching.ts'
import {
  addCard,
  addBoardUser,
  board,
  cookieOf,
  limited,
  liveMoment,
  opening,
  runsOf,
  untilTried,
  watcher,
} from './watching.ts'

/** The code of the error that a `failed` message holds. */
const failedWith = (message: Message | undefined): unknown => Object(message?.error).code

/** The id of a caller that is a user. */
const idOf = (caller: { user?: { id: string } }): string => String(caller.user?.id)

test('[05-5.1] an opening of /_t/live from a page of another site, from a site that only looks like the app, and with no Origin is T0004 with a valid cookie in the request, and holds no place', async (t) => {
  const listed = 'https://partner.tent.test'
  const { app, origin, port } = await board(t, {
    change: limited({ liveConnections: 3 }, (d) => void Object.assign(d.project, { api: { origins: [listed] } })),
  })
  const ada = await addBoardUser(app, 'Ada', ['staff'])
  const cookie = cookieOf(app, ada)
  const others = [
    'https://evil.tent.test',
    'null',
    null,
    // The same name on another port and under another scheme is another site.
    `http://localhost:${port + 1}`,
    `https://localhost:${port}`,
    // A name that only begins or ends as the app's does, and one that begins as a listed site does.
    `http://localhost:${port}.evil.tent.test`,
    `http://evil-localhost:${port}`,
    `http://sub.localhost:${port}`,
    `${listed}.evil.tent.test`,
    `${listed}:8443`,
    'http://partner.tent.test',
    // Another name of this computer than the one the request was sent to.
    `http://127.0.0.1:${port}`,
  ]
  for (const site of others) {
    assert.throws(() => app.live(opening(origin, { cookie, as: ada, site })), { code: 'T0004' }, `from ${site}`)
    assert.throws(() => app.live(opening(origin, { site })), { code: 'T0004' }, `from ${site}, with no cookie`)
  }
  // Over a real connection, with what a program may add to its request: each is refused before a socket is made.
  const added: Record<string, string>[] = [
    { origin: 'https://evil.tent.test' },
    {},
    { origin: 'https://evil.tent.test', 'x-forwarded-host': `localhost:${port}`, forwarded: `host=localhost:${port}` },
    { authorization: 'Bearer tk_made_up_by_the_attacker' },
    { 'x-api-key': 'made-up', 'tent-admin': 'made-up' },
    { origin: `http://localhost:${port}, https://evil.tent.test` },
  ]
  for (const more of added) {
    const refused = await rawLive(port, { cookie, ...more })
    assert.equal(refused.status, 403, JSON.stringify(more))
  }
  // A name that is none of the app's, with an `Origin` that agrees with it, is another app's request.
  const rebound = await rawLive(port, { cookie, host: 'evil.tent.test', origin: 'http://evil.tent.test' })
  assert.equal(rebound.status, 421)

  // No refusal held a place among the connections of the address: all three are still to be had.
  const pages = [watcher(app, origin, { cookie, as: ada }), watcher(app, origin), watcher(app, origin)]
  for (const page of pages) assert.equal((await page.watch('cards', 'allCards')).t, 'result')
})

test('[05-5.2] one connection more than an address may hold is T0005, whatever address the request says it came from, and one watch more than a connection may hold is failed with T0005 and runs nothing', async (t) => {
  const { app, origin, port, dataFolder } = await board(t, { change: limited({ liveConnections: 3, watches: 3 }) })
  await addCard(app, 'first', 1)
  const ada = await addBoardUser(app, 'Ada')
  const cookie = cookieOf(app, ada)

  // A page that is told `changed` at its opening and closed gives its place up: ten of them leave three places.
  for (let n = 0; n < 10; n++) {
    const wrong = watcher(app, origin, { cookie })
    await untilTried('the page that names no user was closed', () => wrong.closed())
  }
  await liveMoment(30)
  // Three connections over the network, each of which says that it came from another address: no proxy is named.
  const held: RawLive[] = []
  for (let n = 0; n < 3; n++) {
    const one = await rawLive(port, { origin, 'x-forwarded-for': `203.0.113.${n}`, forwarded: `for=203.0.113.${n}` })
    assert.equal(one.status, 101)
    held.push(one)
  }
  const fourth = await rawLive(port, { origin, 'x-forwarded-for': '198.51.100.7', 'x-real-ip': '198.51.100.7' })
  assert.equal(fourth.status, 429)
  // The same address with a cookie, and as another caller, is the same address.
  assert.equal((await rawLive(port, { origin, cookie })).status, 429)
  // Three are still served, and a place that is given up is taken again.
  held[0].text({ t: 'watch', id: 'cards', query: 'allCards', input: {} })
  await untilTried('the first connection was answered', () => held[0].got.length === 1)
  held[2].end()
  await liveMoment(300)
  const taken = await rawLive(port, { origin })
  assert.equal(taken.status, 101)
  for (const one of [...held, taken]) one.end()
  await liveMoment(50)

  // One watch more than a connection may hold: refused, with nothing run, and the three that stand go on.
  const page = watcher(app, origin)
  for (const id of ['a', 'b', 'c'])
    assert.equal((await page.watch(id, 'cardsAt', { rank: id.charCodeAt(0) })).t, 'result')
  const [counted, ranked] = [runsOf(dataFolder, 'countCards'), runsOf(dataFolder, 'cardsAt')]
  for (let n = 0; n < 50; n++) {
    assert.equal(failedWith(await page.watch(`more ${n}`, 'countCards')), 'T0005')
    assert.equal(failedWith(await page.watch(`again ${n}`, 'cardsAt', { rank: n })), 'T0005')
  }
  assert.deepEqual([runsOf(dataFolder, 'countCards'), runsOf(dataFolder, 'cardsAt')], [counted, ranked])
  assert.equal(page.closed(), false)
  await app.call('addCard', { title: 'at a', rank: 'a'.charCodeAt(0) }, { as: system })
  await untilTried('the watch that stands was sent the card', () => page.of('result', 'a').length === 2)
})

test('[05-5.3] a watch of a query the caller may not call, of a name that starts _t_, of a change, of an action and with an input that does not fit is failed, and nothing is run or written', async (t) => {
  const { app, origin, dataFolder } = await board(t)
  await addCard(app, 'first', 1)
  const page = watcher(app, origin)
  const rows = async (): Promise<unknown> => app.call('countCards', {}, { as: system })
  const names = ['staffCards', 'myCards', 'addCard', 'fillCards', 'turnCards', 'ping', 'bump', 'quietCards']
  const ran = (): number[] => names.map((name) => runsOf(dataFolder, name))
  const before = ran()

  const asked: [string, unknown, unknown][] = [
    // A query that needs a role and one that needs a sign-in, as a visitor.
    ['a role', 'staffCards', {}],
    ['a sign-in', 'myCards', {}],
    // The engine's own tables, and names that every object of the runtime holds.
    ['rate', '_t_rate', {}],
    ['meta', '_t_meta', {}],
    ['users', '_t_users', {}],
    ['proto', '__proto__', {}],
    ['constructor', 'constructor', {}],
    ['toString', 'toString', {}],
    ['hasOwn', 'hasOwnProperty', {}],
    // What writes, and what may wait: with an input that fits it.
    ['a change', 'addCard', { title: 'written by a watch', rank: 9 }],
    ['a change of the system', 'fillCards', { from: 0, to: 50 }],
    ['a change with no input', 'turnCards', {}],
    ['a counter', 'bump', {}],
    ['an action', 'ping', {}],
    ['not live', 'quietCards', {}],
    // A name that is no text.
    ['a list', ['allCards'], {}],
    ['a record', { name: 'allCards' }, {}],
    ['a number', 7, {}],
    ['nothing', null, {}],
    // An input that does not fit.
    ['a text for a number', 'cardsAt', { rank: 'one' }],
    ['no field', 'cardsAt', {}],
    ['one field more', 'cardsAt', { rank: 1, more: true }],
    ['a list for a record', 'cardsAt', [1]],
    ['an id that is none', 'oneCard', { card: { id: 'x' } }],
  ]
  for (const [id, query, input] of asked) {
    const answer = await page.watch(id, String(id), input, { query })
    assert.equal(answer.t, 'failed', `${id}: ${JSON.stringify(answer)}`)
    assert.equal('value' in answer, false, id)
    assert.match(String(failedWith(answer)), /^T\d{4}$/, id)
  }
  // Each was answered once, the connection stands, and a watch that may be is still taken.
  await liveMoment(40)
  assert.equal(page.of('failed').length, asked.length)
  assert.equal(page.got.length, asked.length)
  assert.equal(page.closed(), false)
  assert.equal((await page.watch('cards', 'allCards')).t, 'result')
  // Nothing was written, and nothing that writes or waits was carried out.
  assert.equal(await rows(), 1)
  assert.equal(await app.call('bump', {}, { as: system }), 1)
  assert.deepEqual(
    ran()
      .map((n, at) => [names[at], n - before[at]])
      .filter(([name]) => !['staffCards', 'myCards', 'bump'].includes(String(name))),
    names.filter((name) => !['staffCards', 'myCards', 'bump'].includes(name)).map((name) => [name, 0]),
  )
  // A watch that failed left no group behind: a write runs neither of the queries that were refused.
  const [staff, mine] = [runsOf(dataFolder, 'staffCards'), runsOf(dataFolder, 'myCards')]
  await addCard(app, 'second', 2)
  await untilTried('the page was sent the card', () => page.of('rows', 'cards').length === 1)
  await liveMoment(40)
  assert.deepEqual([runsOf(dataFolder, 'staffCards'), runsOf(dataFolder, 'myCards')], [staff, mine])
})

test('[05-5.6@6] a user who loses a role while they watch is sent failed at the next run of the group, on every page of theirs and for a heavy query too, and nothing of what the role let them read after it', async (t) => {
  const { app, origin } = await board(t, {
    change: (d) => void Object.assign(d.functions.heavyCards, { access: d.functions.staffCards.access }),
  })
  const [ada, bo] = [await addBoardUser(app, 'Ada', ['staff']), await addBoardUser(app, 'Bo', ['staff'])]
  await addCard(app, 'first', 1)
  const cookie = cookieOf(app, ada)
  const [one, two] = [watcher(app, origin, { cookie, as: ada }), watcher(app, origin, { cookie, as: ada })]
  const his = watcher(app, origin, { cookie: cookieOf(app, bo), as: bo })
  assert.equal((await one.watch('staff', 'staffCards')).t, 'result')
  assert.equal((await one.watch('heavy', 'heavyCards')).t, 'result')
  assert.equal((await two.watch('staff', 'staffCards')).t, 'result')
  assert.equal((await his.watch('staff', 'staffCards')).t, 'result')
  assert.equal((await his.watch('heavy', 'heavyCards')).t, 'result')

  await app.call('setRoles', { user: ada, roles: ['guest'] }, { as: system })
  const [onesBefore, twosBefore] = [one.got.length, two.got.length]
  const secret = await addCard(app, 'only the staff reads this', 2)
  await untilTried('he was sent the card by both watches', () => his.got.filter((m) => m.t === 'rows').length === 2)
  await untilTried('each of her watches failed', () => one.of('failed').length === 2 && two.of('failed').length === 1)
  await liveMoment(60)
  // Everything that she was sent since she lost the role is the three refusals: no row of the card.
  const since = [...one.got.slice(onesBefore), ...two.got.slice(twosBefore)]
  assert.deepEqual(
    since.map((message) => [message.t, failedWith(message)]),
    Array(3).fill(['failed', 'T3101']),
  )
  assert.equal(JSON.stringify(since).includes(secret), false)
  assert.deepEqual([one.closed(), two.closed()], [false, false])
  // The watches are over, and one that is sent anew is refused: a later card reaches her by no watch.
  assert.equal(failedWith(await one.watch('staff again', 'staffCards')), 'T3101')
  assert.equal(failedWith(await one.watch('heavy again', 'heavyCards')), 'T3101')
  const later = await addCard(app, 'a later card', 3)
  await untilTried('he was sent the later card', () => JSON.stringify(his.got).includes(later))
  await liveMoment(60)
  assert.equal(JSON.stringify([one.got, two.got]).includes(later), false)

  // The role is given back: nothing comes by itself for a watch that is over.
  await app.call('setRoles', { user: ada, roles: ['staff'] }, { as: system })
  await addCard(app, 'after the role came back', 4)
  await liveMoment(80)
  assert.equal(one.got.filter((message) => message.id === 'staff').length, 2)

  // A user whose row is gone is no caller any more: the page is told `changed` and closed at the next run.
  await app.call('dropUser', { user: bo }, { as: system })
  const last = await addCard(app, 'after he was removed', 5)
  await untilTried('his page was closed', () => his.closed())
  assert.deepEqual(his.got.at(-1), { t: 'changed' })
  assert.equal(JSON.stringify(his.got).includes(last), false)
})

test('[05-5.8] a watch that names in have the mark of an answer its caller was never sent learns nothing: it is sent its own answer or a refusal, and never silence for a query it may not call', async (t) => {
  const { app, origin, dataFolder } = await running(t)
  const quiet = async (): Promise<void> => liveMoment(60)
  const [ada, bo] = [await deskUser(app, 'Ada', ['staff']), await deskUser(app, 'Bo')]
  await app.call('addNote', { title: 'the note of Ada' }, { as: ada })
  await app.call('addTag', { name: 'a tag of the staff' }, { as: ada })
  const hers = watcher(app, origin, { cookie: cookieOf(app, idOf(ada)), as: idOf(ada) })
  const notes = await hers.watch('notes', 'notesBy', { done: false })
  const tags = await hers.watch('tags', 'staffTags')
  assert.deepEqual([notes.t, Object(notes.value).length, tags.t], ['result', 1, 'result'])

  // Another user names her mark for the same query and input: he is sent his own answer, which holds no row of hers.
  const his = watcher(app, origin, { cookie: cookieOf(app, idOf(bo)), as: idOf(bo) })
  const own = await his.watch('notes', 'notesBy', { done: false }, { have: notes.mark })
  assert.deepEqual([own.t, own.value], ['result', []])
  assert.notEqual(own.mark, notes.mark)
  // He names the mark of an answer that only the staff is sent: the watch is refused, and not left unanswered,
  // which would tell him that the mark he guessed is the one that stands.
  for (const have of [tags.mark, 'ffffffffffffffff']) {
    const refused = await his.watch(`tags ${have}`, 'staffTags', {}, { have })
    assert.deepEqual([refused.t, failedWith(refused)], ['failed', 'T3101'])
  }
  // A visitor with her mark, and with her id in the place of a cookie.
  const visitor = watcher(app, origin)
  for (const [id, query, input, have] of [
    ['notes', 'notesBy', { done: false }, notes.mark],
    ['tags', 'staffTags', {}, tags.mark],
  ] as const) {
    const refused = await visitor.watch(id, query, input, { have })
    assert.equal(refused.t, 'failed', JSON.stringify(refused))
  }

  // What she writes after it reaches her page, and no other: his group is run, and answers what he holds.
  const ran = runsOf(dataFolder, 'notesBy')
  const [hisBefore, visitorsBefore] = [his.got.length, visitor.got.length]
  await app.call('addNote', { title: 'a second note of Ada' }, { as: ada })
  await untilTried('she was sent her note', () => hers.got.filter((m) => m.id === 'notes').length === 2)
  await quiet()
  assert.deepEqual([his.got.length, visitor.got.length], [hisBefore, visitorsBefore])
  assert.equal(runsOf(dataFolder, 'notesBy'), ran + 2)
  assert.equal(JSON.stringify([his.got, visitor.got]).includes('note of Ada'), false)
  // A mark that he holds truly keeps him from being sent what he has: nothing, and then his own note alone.
  const again = watcher(app, origin, { cookie: cookieOf(app, idOf(bo)), as: idOf(bo) })
  again.send({ t: 'watch', id: 'notes', query: 'notesBy', input: { done: false }, have: own.mark })
  await quiet()
  assert.equal(again.got.length, 0)
  await app.call('addNote', { title: 'the note of Bo' }, { as: bo })
  await untilTried('he was sent his note', () => again.got.length === 1)
  assert.deepEqual(
    Object(again.got[0].value ?? Object(again.got[0].put).map((put: Message) => put.row)).map(
      (row: Message) => row.title,
    ),
    ['the note of Bo'],
  )
})

test('[05-5.12] a watch whose version holds .. and slashes is failed with T0007 and names the running version, also where a bundle lies at the place that it names', async (t) => {
  const { app, origin, bundle, dataFolder } = await board(t)
  await addCard(app, 'first', 1)
  // A second bundle, which holds one query more, lies where such a name would lead: beside `versions/`, and in it
  // under a name that is no version of the app.
  const other = await bundled(t, {
    project: 'board',
    change: (d) => void Object.assign(d.functions, { plantedCards: { ...d.functions.allCards, name: 'plantedCards' } }),
  })
  mkdirSync(join(dataFolder, 'versions'), { recursive: true })
  for (const place of [
    join(dataFolder, 'planted'),
    join(dataFolder, 'versions', 'planted'),
    join(dataFolder, 'versions', 'deep', 'er'),
  ])
    cpSync(other.folder, place, { recursive: true })
  const page = watcher(app, origin)
  const named = [
    '../planted',
    '..\\planted',
    'planted',
    'deep/er',
    'deep\\er',
    './planted',
    `../versions/${bundle.versionId}`,
    `./${bundle.versionId}`,
    `${bundle.versionId}/`,
    `${bundle.versionId}/.`,
    `${bundle.versionId}\u0000`,
    ` ${bundle.versionId}`,
    bundle.versionId.toUpperCase() === bundle.versionId
      ? bundle.versionId.toLowerCase()
      : bundle.versionId.toUpperCase(),
    '%2e%2e/planted',
    '..',
    '.',
    '/',
    '',
    other.folder,
    other.versionId,
    join(dataFolder, 'planted'),
    '__proto__',
    'constructor',
  ]
  for (const version of named)
    for (const query of ['allCards', 'plantedCards']) {
      const answer = await page.watch(`${query} ${version}`, query, {}, { version })
      const error = Object(answer.error)
      assert.deepEqual([answer.t, error.code, error.running], ['failed', 'T0007', bundle.versionId], version)
    }
  // The version that runs is served under its own name, and the query of the other bundle is none of the app's.
  assert.equal((await page.watch('cards', 'allCards', {}, { version: bundle.versionId })).t, 'result')
  assert.equal(failedWith(await page.watch('planted', 'plantedCards', {}, { version: bundle.versionId })), 'T0001')
  assert.deepEqual(
    app.versions().map((one) => one.id),
    [bundle.versionId],
  )
  assert.equal(page.closed(), false)
})

test('[05-5.8] a private column leaves through no watch: a query that reads every user as the system sends a visitor no salary, in its first answer, in a rows message and from a query thread', async (t) => {
  const { app, origin } = await running(t)
  await deskUser(app, 'Ada', ['staff'], 71_233)
  const page = watcher(app, origin)
  for (const query of ['openUsers', 'openPeople', 'heavyUsers']) {
    const first = await page.watch(query, query)
    assert.deepEqual([first.t, Object(first.value).length], ['result', 1], query)
  }
  // A second and a third user: each list is sent what changed, as rows where the answer is a list of rows.
  await deskUser(app, 'Bo', [], 82_344)
  await deskUser(app, 'Cy', [], 93_455)
  await untilTried('each watch was sent the new users', () =>
    ['openUsers', 'openPeople', 'heavyUsers'].every((query) =>
      JSON.stringify(page.of('rows', query).concat(page.of('result', query))).includes('Cy'),
    ),
  )
  await liveMoment(60)
  const sent = JSON.stringify(page.got)
  assert.ok(sent.includes('Ada') && sent.includes('Bo'))
  for (const secret of ['salary', '71233', '82344', '93455']) assert.equal(sent.includes(secret), false, secret)
})
