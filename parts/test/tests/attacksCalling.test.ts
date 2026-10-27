import assert from 'node:assert/strict'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import {
  bytesUnder,
  calledByBrowser,
  wireCodeOf,
  holding,
  idByEmail,
  kept,
  signedInByEmail,
  stormed,
  turn,
  untilTurned,
  watching,
  who,
} from './storms.ts'

/** The rows of a table of the engine, read from the data file on the disk beside the engine that holds it. */
function rowsOf(dataFolder: string, table: string): Record<string, unknown>[] {
  const db = new DatabaseSync(join(dataFolder, 'data.db'), { readOnly: true })
  try {
    return db.prepare(`SELECT * FROM "${table}"`).all()
  } finally {
    db.close()
  }
}

test('[05-10.1] a copy of the data file and of the log holds the fingerprint of a session and never the session: nothing in it signs anyone in', async (t) => {
  const { app, dataFolder } = await stormed(t, 'stormed')
  const maya = await idByEmail(app, 'maya@example.com')
  const cookie = await signedInByEmail(app, 'maya@example.com')
  assert.equal(await who(app, cookie, maya), maya)
  const token = cookie.slice(cookie.indexOf('=') + 1)
  const bytes = Buffer.from(token, 'base64url')
  // No file of the data folder holds the cookie: as it is written, as its bytes, as hex or as standard base64.
  for (const form of [token, bytes.toString('hex'), bytes.toString('base64').replace(/=+$/, '')])
    assert.deepEqual(holding(dataFolder, form), [], form)
  assert.equal(
    bytesUnder(dataFolder).some((one) => one.bytes.includes(bytes)),
    false,
  )
  // Whatever the table of the sessions holds, sent as the cookie, is nobody.
  const [row] = rowsOf(dataFolder, '_t_sessions')
  assert.equal(typeof row.fingerprint, 'string')
  const print = String(row.fingerprint)
  for (const value of [
    print,
    print.slice(0, 43),
    Buffer.from(print, 'hex').toString('base64url'),
    Buffer.from(print).toString('base64url').slice(0, 43),
  ])
    assert.equal(await who(app, `tent_session.shop=${value}`, maya), 'nobody', value)
})

test('[05-10.2] a session cookie after sessions.end, after sessions.endAll and after its time is nobody, and so is the cookie of one app sent to another app', async (t) => {
  const { app } = await stormed(t, 'stormed')
  const maya = await idByEmail(app, 'maya@example.com')
  const [one, two, three, four] = [
    await signedInByEmail(app, 'maya@example.com'),
    await signedInByEmail(app, 'maya@example.com'),
    await signedInByEmail(app, 'maya@example.com'),
    await signedInByEmail(app, 'maya@example.com'),
  ]
  for (const cookie of [one, two, three, four]) assert.equal(await who(app, cookie, maya), maya)
  // After `sessions.end`.
  assert.equal((await calledByBrowser(app, 'signOut', {}, { cookie: one, as: maya })).wire.ok, true)
  assert.equal(await who(app, one, maya), 'nobody')
  assert.equal(await who(app, two, maya), maya)
  // After its time: 31 days with no use.
  app.clock.advance('15 days')
  assert.equal(await who(app, three, maya), maya)
  assert.equal(await who(app, four, maya), maya)
  app.clock.advance('16 days')
  assert.equal(await who(app, two, maya), 'nobody')
  assert.equal(await who(app, three, maya), maya)
  // After `sessions.endAll`.
  assert.equal((await calledByBrowser(app, 'endOther', { user: maya }, { cookie: three, as: maya })).wire.ok, true)
  assert.equal(await who(app, three, maya), 'nobody')
  assert.equal(await who(app, four, maya), 'nobody')

  // Another app of the same name on the same computer, with data of its own: the cookie of the first is nobody.
  const other = await stormed(t, 'stormed')
  const fresh = await signedInByEmail(app, 'maya@example.com')
  assert.equal(await who(app, fresh, maya), maya)
  const theirs = await idByEmail(other.app, 'maya@example.com')
  assert.equal(await who(other.app, fresh, theirs), 'nobody')
  assert.equal(await who(other.app, fresh, maya), 'nobody')
})

test('[05-10.3] a cookie that an attacker planted before the sign-in is nobody after it: a made-up value, and the attacker’s own session', async (t) => {
  const { app } = await stormed(t, 'stormed')
  const [maya, omar] = [await idByEmail(app, 'maya@example.com'), await idByEmail(app, 'omar@example.com')]
  // A value of the attacker's own making.
  const made = `tent_session.shop=${'A'.repeat(43)}`
  const first = await calledByBrowser(app, 'signIn', { email: 'maya@example.com' }, { cookie: made })
  assert.notEqual(kept(first), made)
  assert.equal(await who(app, made), 'nobody')
  assert.equal(await who(app, kept(first), maya), maya)
  // The attacker's own session, planted in the browser of the victim, who then signs in: the sign-in makes a new
  // session, and what the attacker holds is never the victim.
  const planted = await signedInByEmail(app, 'omar@example.com')
  assert.equal(await who(app, planted, omar), omar)
  const second = await calledByBrowser(app, 'signIn', { email: 'maya@example.com' }, { cookie: planted, as: omar })
  assert.equal(second.wire.ok, true, JSON.stringify(second.wire))
  assert.notEqual(kept(second), planted)
  assert.equal(await who(app, kept(second), maya), maya)
  for (const as of [maya, omar, undefined]) assert.notEqual(await who(app, planted, as), maya)
  // The session that the request of the sign-in came with is ended: what was planted is nobody from then on.
  assert.equal(await who(app, planted, omar), 'nobody')
})

test('[05-10.4] [05-10.20] a sign-in and a sign-out that a page of another site posts from the browser of the victim are T0004: no session is started, and none is ended', async (t) => {
  const { app } = await stormed(t, 'stormed')
  const maya = await idByEmail(app, 'maya@example.com')
  for (const site of ['https://evil.example', 'http://localhost.evil.example', 'http://localhost:81', 'null']) {
    const told = await calledByBrowser(app, 'signIn', { email: 'omar@example.com' }, { site })
    assert.deepEqual([told.status, wireCodeOf(told.wire), told.set], [403, 'T0004', []], site)
  }
  const cookie = await signedInByEmail(app, 'maya@example.com')
  for (const site of ['https://evil.example', 'null']) {
    const told = await calledByBrowser(app, 'signOut', {}, { cookie, as: maya, site })
    assert.deepEqual([wireCodeOf(told.wire), told.set], ['T0004', []], site)
  }
  assert.equal(await who(app, cookie, maya), maya)
})

// The row names ten thousand guesses: a thousand show the same of the count, in a tenth of the time.
test('[05-10.5] a thousand guesses of one password, each in a call that fails, are each counted, and T0005 follows at the limit', async (t) => {
  const { app, dataFolder } = await stormed(t, 'stormed')
  const guess = { email: 'maya@example.com', tries: 1000 }
  for (let n = 1; n <= 1000; n++) {
    const told = await calledByBrowser(app, 'wrongGuess', guess)
    if (wireCodeOf(told.wire) !== 'wrong') assert.fail(`guess ${n} was answered ${JSON.stringify(told.wire)}`)
  }
  assert.deepEqual(
    rowsOf(dataFolder, '_t_attempts').map((row) => [row.key, row.count]),
    [['signIn:maya@example.com', 1000]],
  )
  for (let n = 0; n < 3; n++) assert.equal(wireCodeOf((await calledByBrowser(app, 'wrongGuess', guess)).wire), 'T0005')
  // A lower bound that another sign-in states for the same key holds what was counted too.
  assert.equal(wireCodeOf((await calledByBrowser(app, 'wrongGuess', { ...guess, tries: 5 })).wire), 'T0005')
})

// The row names ten thousand addresses: two thousand show the same of the count.
test('[05-10.23] two thousand guesses of one password from two thousand addresses of one range of the newer kind count as one address', async (t) => {
  const { app } = await stormed(t, 'stormed')
  const guess = { email: 'maya@example.com', tries: 5, address: true }
  const answers = new Map<string, number>()
  for (let n = 0; n < 2000; n++) {
    const from = `2001:db8:77:1:${(n >> 8).toString(16)}:${(n & 255).toString(16)}:a:${(n % 7).toString(16)}`
    const code = wireCodeOf((await calledByBrowser(app, 'wrongGuess', guess, { from })).wire)
    answers.set(code, (answers.get(code) ?? 0) + 1)
  }
  assert.deepEqual(Object.fromEntries(answers), { wrong: 5, T0005: 1995 })
  // An address of another range is another address, and one of the older kind stands alone.
  assert.equal(
    wireCodeOf((await calledByBrowser(app, 'wrongGuess', guess, { from: '2001:db8:77:2::1' })).wire),
    'wrong',
  )
  assert.equal(wireCodeOf((await calledByBrowser(app, 'wrongGuess', guess, { from: '198.51.100.7' })).wire), 'wrong')
})

test('[05-10.6] a user who sends roles to a change that lets them write their own row keeps the roles they had: T3101, and T0002 where the input does not declare the field', async (t) => {
  const { app } = await stormed(t, 'stormed')
  const maya = await idByEmail(app, 'maya@example.com')
  const cookie = await signedInByEmail(app, 'maya@example.com')
  const rolesOf = async (): Promise<unknown> => (await app.rows('users')).find((one) => one.id === maya)?.roles
  for (const roles of [['staff'], ['admin', 'staff'], []]) {
    const told = await calledByBrowser(app, 'changeMine', { roles }, { cookie, as: maya })
    assert.equal(wireCodeOf(told.wire), 'T3101', JSON.stringify(roles))
    assert.deepEqual(await rolesOf(), [])
  }
  // A change whose input declares no such field.
  const undeclared = await calledByBrowser(
    app,
    'renameMine',
    { email: 'm@example.com', roles: ['staff'] },
    { cookie, as: maya },
  )
  assert.equal(wireCodeOf(undeclared.wire), 'T0002')
  assert.deepEqual(await rolesOf(), [])
  // The rest of the row is theirs to change.
  assert.equal(
    wireCodeOf((await calledByBrowser(app, 'renameMine', { email: 'm@example.com' }, { cookie, as: maya })).wire),
    'ok',
  )
  assert.deepEqual(await rolesOf(), [])
  // And the door knows no role of theirs.
  assert.equal(
    wireCodeOf((await calledByBrowser(app, 'staffNotes', {}, { cookie, as: maya, read: true })).wire),
    'T3101',
  )
})

test('[05-10.17] an identify that throws for one request is T0009 for that request, and the next is asked afresh', async (t) => {
  const { app } = await stormed(t, 'identified')
  const maya = await idByEmail(app, 'maya@example.com')
  const asks = (named: string, as?: string) =>
    calledByBrowser(app, 'whoAmI', {}, { headers: { 'company-user': named }, ...(as ? { as } : {}) })
  const broken = await asks('broken')
  assert.deepEqual([broken.status, wireCodeOf(broken.wire), broken.wire.value], [500, 'T0009', undefined])
  // What the code threw is not the caller's to read.
  assert.equal(JSON.stringify(broken.wire).includes('did not answer'), true)
  assert.equal((await asks('maya@example.com', maya)).wire.value, maya)
  assert.equal(wireCodeOf((await asks('broken')).wire), 'T0009')
  assert.equal((await asks('maya@example.com', maya)).wire.value, maya)
})

test('[05-10.18] where two cookies of the name of the session arrive, the caller is nobody, in whatever order; and over https the bare name is not read', async (t) => {
  const { app } = await stormed(t, 'stormed')
  const maya = await idByEmail(app, 'maya@example.com')
  const cookie = await signedInByEmail(app, 'maya@example.com')
  const planted = `tent_session.shop=${'B'.repeat(43)}`
  assert.equal(await who(app, cookie, maya), maya)
  for (const sent of [`${cookie}; ${planted}`, `${planted}; ${cookie}`, `${cookie}; ${cookie}`, `${cookie};${planted}`])
    assert.equal(await who(app, sent, maya), 'nobody', sent)
  // Over https a sister site cannot set the name with its prefix, and the bare name that it can set is not read.
  const secure = await signedInByEmail(app, 'maya@example.com', { origin: 'https://shop.test' })
  assert.match(secure, /^__Host-tent_session\.shop=/)
  const value = secure.slice(secure.indexOf('=') + 1)
  const asked = (sent: string) =>
    calledByBrowser(app, 'whoAmI', {}, { origin: 'https://shop.test', cookie: sent, as: maya })
  assert.equal((await asked(secure)).wire.value, maya)
  // Read as nobody, the page that was drawn for maya is told that its caller changed, and nothing of her.
  for (const sent of [`tent_session.shop=${value}`, `__Secure-tent_session.shop=${value}`])
    assert.deepEqual([(await asked(sent)).wire.caller, 'value' in (await asked(sent)).wire], ['changed', false], sent)
  // The bare name beside the true one changes nothing: it is another name.
  assert.equal((await asked(`tent_session.shop=${'B'.repeat(43)}; ${secure}`)).wire.value, maya)
})

test('[05-10.27] a second page of the browser, after another user signed in on the first, is told at its next call, its next read and on its live connection that the caller changed, and is sent nothing of either user', async (t) => {
  const { app } = await stormed(t, 'stormed')
  const [maya, omar] = [await idByEmail(app, 'maya@example.com'), await idByEmail(app, 'omar@example.com')]
  await app.as('system').call('addNote', { words: 'only the staff reads this' })
  // One browser: a page drawn for Maya, then Omar, who is staff, signs in on another page of it.
  const mayas = await signedInByEmail(app, 'maya@example.com')
  const page = watching(app, { cookie: mayas, as: maya })
  page.send({ t: 'watch', id: 'me', query: 'whoAmI', input: {} })
  await untilTurned('the page of Maya was answered', () => page.heard.length === 1)
  const omars = kept(await calledByBrowser(app, 'signIn', { email: 'omar@example.com' }, { cookie: mayas, as: maya }))
  // The live connection of the page that was drawn for Maya is told, and closed.
  await untilTurned('the page of Maya was closed', () => page.closed())
  assert.deepEqual(page.heard.at(-1), { t: 'changed' })
  // The page of Maya, with the cookie that the browser holds now: nothing is run, and nothing of Omar is told.
  for (const [name, read] of [
    ['whoAmI', false],
    ['whoAmI', true],
    ['staffNotes', true],
    ['devices', true],
  ] as const) {
    const told = await calledByBrowser(app, name, {}, { cookie: omars, as: maya, ...(read ? { read } : {}) })
    assert.deepEqual(
      [told.wire.ok, told.wire.caller, told.wire.value, wireCodeOf(told.wire)],
      [false, 'changed', undefined, 'T3101'],
    )
    assert.equal(JSON.stringify(told.wire).includes('only the staff'), false)
    assert.equal(JSON.stringify(told.wire).includes(omar), false)
  }
  // A live connection that the page of Maya opens now is taken, told `changed`, and closed: no result is sent.
  const stale = watching(app, { cookie: omars, as: maya })
  stale.send({ t: 'watch', id: 'notes', query: 'staffNotes', input: {} })
  await untilTurned('the stale page was closed', () => stale.closed())
  assert.deepEqual(stale.heard, [{ t: 'changed' }])
  // A page that was drawn for a visitor, in the browser that is Omar now, is told the same.
  const visitors = await calledByBrowser(app, 'staffNotes', {}, { cookie: omars, read: true })
  assert.deepEqual([visitors.wire.ok, visitors.wire.caller, visitors.wire.value], [false, 'changed', undefined])
})

test('[05-10.32] a call that names another user in "as" is told that the caller changed and nothing more, and sessions.end with the id of another user’s session ends nothing', async (t) => {
  const { app } = await stormed(t, 'stormed')
  const [maya, omar] = [await idByEmail(app, 'maya@example.com'), await idByEmail(app, 'omar@example.com')]
  const [mayas, omars] = [
    await signedInByEmail(app, 'maya@example.com'),
    await signedInByEmail(app, 'omar@example.com'),
  ]
  for (const name of ['whoAmI', 'devices']) {
    const told = await calledByBrowser(app, name, {}, { cookie: mayas, as: omar })
    assert.deepEqual(
      [told.wire.ok, told.wire.caller, told.wire.value, wireCodeOf(told.wire)],
      [false, 'changed', undefined, 'T3101'],
    )
  }
  // The ids of the sessions of Omar, as his own page lists them.
  const listed = await calledByBrowser(app, 'devices', {}, { cookie: omars, as: omar, read: true })
  const ids: string[] = Object(listed.wire.value).map((one: { id: string }) => one.id)
  assert.equal(ids.length, 1)
  const ended = await calledByBrowser(app, 'signOutOne', { id: ids[0] }, { cookie: mayas, as: maya })
  assert.equal(ended.wire.caller, undefined)
  assert.deepEqual(ended.set, [])
  assert.equal(await who(app, omars, omar), omar)
  assert.equal(await who(app, mayas, maya), maya)
})

test('[05-10.32] a call of a page that was drawn for a user, sent when its browser is nobody, is told that the caller changed, and is not run', async (t) => {
  const { app } = await stormed(t, 'stormed')
  const maya = await idByEmail(app, 'maya@example.com')
  // The user signed out on another page of the browser: this page still names them.
  const before = (await app.rows('notes')).length
  const told = await calledByBrowser(
    app,
    'addNote',
    { words: 'written by a page of a user who signed out' },
    { as: maya },
  )
  assert.deepEqual([told.wire.ok, told.wire.caller], [false, 'changed'])
  assert.equal((await app.rows('notes')).length, before)
})

test('[05-10.36] an action with no system that hands sessions.endAll and sessions.list the id of another user is T0013: nothing is ended, and nothing is listed', async (t) => {
  const { app } = await stormed(t, 'stormed')
  const [maya, omar] = [await idByEmail(app, 'maya@example.com'), await idByEmail(app, 'omar@example.com')]
  const [mayas, omars] = [
    await signedInByEmail(app, 'maya@example.com'),
    await signedInByEmail(app, 'omar@example.com'),
  ]
  for (const name of ['endOther', 'listOther']) {
    const told = await calledByBrowser(app, name, { user: omar }, { cookie: mayas, as: maya })
    // T0013 is no code that a caller is told: it is an error of the app, and the log names it.
    assert.deepEqual([told.wire.ok, told.wire.value], [false, undefined], name)
    assert.ok(['T0013', 'T0009'].includes(wireCodeOf(told.wire)), `${name}: ${JSON.stringify(told.wire)}`)
    assert.deepEqual(
      await app
        .as(maya)
        .call(name, { user: omar })
        .then(
          () => 'ran',
          (error) => error.code,
        ),
      'T0013',
    )
  }
  assert.equal(await who(app, omars, omar), omar)
  // Her own she may list.
  const own = await calledByBrowser(app, 'listOther', { user: maya }, { cookie: mayas, as: maya })
  assert.equal(Object(own.wire.value).length, 1)
})

// Not run on Windows, where the minute of the count began anew within the flood in the public run 40465200396.
const floodNotOnWindows = {
  skip:
    process.platform === 'win32'
      ? 'the minute began anew within the flood on Windows in the public run 40465200396'
      : false,
}

test(
  '[05-10.30] a flood of requests with no cookie and with made-up session cookies, to an app whose identify asks, is T0005 from the 601st of a minute on, before identify is asked',
  floodNotOnWindows,
  async (t) => {
    const { app } = await stormed(t, 'identified')
    const from = '203.0.113.50'
    const asked = async (): Promise<number> => Number(await app.as('system').call('asked', {}))
    const before = await asked()
    const codes = new Map<string, number>()
    for (let n = 0; n < 700; n++) {
      const cookie = n % 2 ? { cookie: `tent_session.shop=${String(n).padStart(43, 'x')}` } : {}
      const code = wireCodeOf((await calledByBrowser(app, 'whoAmI', {}, { from, ...cookie })).wire)
      codes.set(code, (codes.get(code) ?? 0) + 1)
    }
    assert.deepEqual(Object.fromEntries(codes), { ok: 600, T0005: 100 })
    assert.equal((await asked()) - before, 600)
    // Another address is not held, and the next minute counts anew.
    assert.equal(wireCodeOf((await calledByBrowser(app, 'whoAmI', {}, { from: '203.0.113.51' })).wire), 'ok')
    app.clock.advance('1 minute')
    assert.equal(wireCodeOf((await calledByBrowser(app, 'whoAmI', {}, { from })).wire), 'ok')
  },
)

test('[05-10.30] identify is asked for a request that passes step 3 alone: a file of the bundle and the address of health ask it nothing, and use up none of identifyPerMinute', async (t) => {
  const { app } = await stormed(t, 'identified')
  const from = '203.0.113.60'
  const asked = async (): Promise<number> => Number(await app.as('system').call('asked', {}))
  const before = await asked()
  for (let n = 0; n < 5; n++) {
    const answer = await app.request(new Request('http://localhost/_t/health'), { from })
    assert.equal(answer.status, 200)
    await answer.arrayBuffer()
  }
  assert.equal((await asked()) - before, 0, 'identify was asked for /_t/health, which passes step 1 alone')
})

test('[05-5.6@7a] a user whose session ends while they watch has the connection closed, and one who loses a role is sent failed at the next run: neither is sent a row after it', async (t) => {
  const { app } = await stormed(t, 'stormed')
  const omar = await idByEmail(app, 'omar@example.com')
  await app.as('system').call('addNote', { words: 'first' })
  const [one, two] = [await signedInByEmail(app, 'omar@example.com'), await signedInByEmail(app, 'omar@example.com')]
  const [ended, kept2] = [watching(app, { cookie: one, as: omar }), watching(app, { cookie: two, as: omar })]
  for (const page of [ended, kept2]) page.send({ t: 'watch', id: 'notes', query: 'staffNotes', input: {} })
  await untilTurned('both pages were answered', () => ended.heard.length === 1 && kept2.heard.length === 1)
  assert.equal(ended.heard[0].t, 'result')
  // The session of the first page ends, on another page of its browser.
  assert.equal((await calledByBrowser(app, 'signOut', {}, { cookie: one, as: omar })).wire.ok, true)
  await untilTurned('the page of the ended session was closed', () => ended.closed())
  assert.deepEqual(ended.heard.at(-1), { t: 'changed' })
  await app.as('system').call('addNote', { words: 'second, after the session ended' })
  await untilTurned('the other session was sent the row', () => kept2.heard.length === 2)
  await turn(40)
  assert.equal(JSON.stringify(ended.heard).includes('after the session ended'), false)
  assert.equal(kept2.closed(), false)
  // The user loses the role while the second page watches.
  await app.as('system').call('takeRole', { user: omar, role: 'staff' })
  await app.as('system').call('addNote', { words: 'third, after the role was taken' })
  await untilTurned('the page was sent failed', () => kept2.heard.some((message) => message.t === 'failed'))
  await turn(40)
  assert.equal(JSON.stringify(kept2.heard).includes('after the role was taken'), false)
})

test('[05-4.15@7a] an action that a screen reads, which starts a session, clears a count of attempts or sends mail, is refused in the draw and in a later read, and has done none of it', async (t) => {
  const { app, dataFolder } = await stormed(t, 'stormed')
  // A count that the read would clear.
  for (let n = 0; n < 2; n++) await calledByBrowser(app, 'wrongGuess', { email: 'maya@example.com', tries: 2 })
  const counts = (): unknown[] => rowsOf(dataFolder, '_t_attempts').map((row) => row.count)
  assert.deepEqual(counts(), [2])
  const browser = app.browser()
  for (const [path, name, done] of [
    ['/session', 'peekSession', 'a session was started'],
    ['/attempts', 'peekAttempts', 'a count was cleared'],
    ['/mail', 'peekMail', 'a mail was sent'],
  ]) {
    // In the draw.
    const drawn = await app.request(new Request(`http://localhost${path}`))
    const html = await drawn.text()
    assert.equal(html.includes(done), false, `${path} drew what the action answered`)
    assert.deepEqual(drawn.headers.getSetCookie(), [], path)
    // In a later read.
    const read = await calledByBrowser(app, name, {}, { read: true })
    assert.deepEqual([read.wire.ok, read.wire.value, read.set], [false, undefined, []], name)
    assert.ok(['T0013', 'T0009'].includes(wireCodeOf(read.wire)), `${name}: ${JSON.stringify(read.wire)}`)
    assert.equal((await browser.read(name, {})).ok, false, name)
  }
  assert.deepEqual(rowsOf(dataFolder, '_t_sessions'), [])
  assert.deepEqual(counts(), [2])
  assert.equal(app.mailbox.length, 0)
  // Called, and not read, each does its work.
  assert.equal((await calledByBrowser(app, 'peekAttempts', {})).wire.value, 'a count was cleared')
  assert.deepEqual(counts(), [])
})

test('[05-4.15@7a] a query that starts a session is refused, and no session is started', async (t) => {
  const { app, dataFolder } = await stormed(t, 'stormed')
  const maya = await idByEmail(app, 'maya@example.com')
  for (const read of [true, false]) {
    const told = await calledByBrowser(app, 'startInQuery', { user: maya }, read ? { read } : {})
    assert.deepEqual([told.wire.ok, told.wire.value, told.set], [false, undefined, []])
  }
  assert.deepEqual(rowsOf(dataFolder, '_t_sessions'), [])
})

test('[05-2.22@7a] a route whose db is limited to its caller reads a table with a private column and answers the rows as they are: the column is in no row', async (t) => {
  const { app } = await stormed(t, 'stormed')
  const answer = await app.request(new Request('http://localhost/staff.json'))
  assert.equal(answer.status, 200)
  const text = await answer.text()
  const rows: Record<string, unknown>[] = JSON.parse(text)
  assert.deepEqual(
    rows.map((row) => [row.name, 'pay' in row]),
    [
      ['Ada', false],
      ['Bob', false],
    ],
  )
  for (const pay of ['5100', '4200', 'pay']) assert.equal(text.includes(pay), false, pay)
})
