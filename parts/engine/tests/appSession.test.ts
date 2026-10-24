import assert from 'node:assert/strict'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { list as addresses } from '../addresses/list.ts'
import { list as admins } from '../admin/list.ts'
import type { App } from '../app.ts'
import { list as members } from '../app/list.ts'
import { list as callers } from '../callers/list.ts'
import { drivenSession } from '../drivenSession.ts'
import { addUser, codeOf, running, send, testClock } from './apps.ts'

/** The rows of `_t_sessions` as the data file holds them, read beside the engine. */
function sessionRows(dataFolder: string): Record<string, unknown>[] {
  const data = new DatabaseSync(join(dataFolder, 'data.db'), { readOnly: true })
  try {
    return data.prepare('SELECT * FROM "_t_sessions" ORDER BY "createdAt", rowid').all()
  } finally {
    data.close()
  }
}

/**
 * Who a call through the door is taken for: the id of its user, or `no user`. A page of a session names the user
 * it was drawn for, as `as`, as every page of a browser does.
 */
async function who(app: App, origin: string, cookie?: string, as?: string, from?: string): Promise<unknown> {
  const answer = await send(app, `${origin}/_t/call/whoAmI`, {
    ...(cookie === undefined ? {} : { headers: { cookie } }),
    ...(as === undefined ? {} : { body: JSON.stringify({ input: {}, as }) }),
    ...(from === undefined ? {} : { from }),
  })
  return answer.body.value ?? answer.error.code
}

/** An app of the desk in the mode `test`, with a user, and a clock that the test moves. */
async function desk(t: TestContext, o: Parameters<typeof running>[1] = {}) {
  const { clock, advance } = testClock()
  const run = await running(t, { ...o, engine: { makers: { clock: () => clock }, ...o.engine } })
  const ada = await addUser(run.app, 'Ada', ['staff'])
  return { ...run, advance, ada: String(ada.user?.id) }
}

test('[17-5] app.session makes a session for a user as sessions.start does, with no request, and answers its cookie: a request that carries it is that user', async (t) => {
  const { app, engine, origin, dataFolder, ada } = await desk(t)
  const heard: Record<string, unknown>[] = []
  engine.on('session.started', (told) => void heard.push({ ...told }))
  const line = app.session(ada)
  assert.match(line, /^tent_session\.desk=[A-Za-z0-9_-]{43}$/)
  assert.equal(await who(app, origin, line, ada), ada)
  // It is a session as any other: a row of `_t_sessions` that holds the fingerprint of the cookie, never the cookie.
  const rows = sessionRows(dataFolder)
  assert.deepEqual(
    rows.map((row) => row.user),
    [ada],
  )
  assert.equal(JSON.stringify(rows).includes(line.split('=')[1]), false)
  assert.deepEqual(heard, [{ app, user: ada }])
  // A user is named by the id of its row, or as a caller, and each session is a new one.
  const again = app.session({ kind: 'user', user: { id: ada, roles: [] } })
  assert.notEqual(again, line)
  assert.equal(await who(app, origin, again, ada), ada)
  assert.equal(await who(app, origin, line, ada), ada)
  // The roles are those of the row today, as of every session.
  const page = await send(app, `${origin}/_t/call/whoAmI`, { headers: { cookie: line } })
  assert.equal(page.error.code, 'T3101', 'a call of a session names the user its page was drawn for')
})

test('[17-5] app.session of an id that names no row of users is T2103, and of no user at all too', async (t) => {
  const { app, dataFolder } = await desk(t)
  assert.equal(await codeOf(Promise.resolve().then(() => app.session('nobody-of-that-id'))), 'T2103')
  for (const none of ['nobody', 'system'])
    assert.equal(await codeOf(Promise.resolve().then(() => app.session(none))), 'T2103', none)
  assert.equal(await codeOf(Promise.resolve().then(() => app.session({ kind: 'system' }))), 'T2103')
  assert.equal(sessionRows(dataFolder).length, 0)
})

test('[17-5] app.session is given in the modes development and test, and in the mode live it is T0013 and writes no session', async (t) => {
  for (const mode of ['development', 'test', 'live'] as const) {
    const { app, origin, dataFolder } = await running(t, { open: { mode } })
    const bob = String((await addUser(app, 'Bob')).user?.id)
    if (mode === 'live') {
      assert.equal(await codeOf(Promise.resolve().then(() => app.session(bob))), 'T0013', mode)
      assert.equal(sessionRows(dataFolder).length, 0, mode)
      continue
    }
    assert.equal(await who(app, origin, app.session(bob), bob), bob, mode)
  }
})

test('[17-5] no address of a running app makes anyone a user: the engine holds no address, no admin command, no way of telling who calls and no member of a pass', async (t) => {
  const { app, origin, ada } = await desk(t)
  assert.equal(Reflect.has(app, 'pass'), false)
  assert.deepEqual(
    [addresses, admins, callers, members].map((one) =>
      one.map(({ name }) => name).filter((name) => /^(as|pass)$/.test(name)),
    ),
    [[], [], [], []],
  )
  // The callers of step 3 are the session and what the documents name beside it, and no other.
  assert.deepEqual(
    callers.map(({ name }) => name),
    ['frame', 'identify', 'key', 'session', 'token'],
  )
  // A session cookie that the engine did not make names nobody, and one that `app.session` made names its user.
  assert.equal(await who(app, origin, `tent_session.desk=${'a'.repeat(43)}`), 'no user')
  assert.equal(await who(app, origin, app.session(ada), ada), ada)
})

test("[17-5] a session for a browser that a program drives counts on no bound of the user's own sessions, and ends when that browser closes, or with the app", async (t) => {
  const { app, origin, dataFolder, ada } = await desk(t, {
    change: (description) => Object.assign(description.project, { limits: { sessionsPerUser: 1 } }),
  })
  const own = app.session(ada)
  // Two browsers that a program drives are Ada, and her own browser is still signed in.
  const [first, second] = [drivenSession(app, ada), drivenSession(app, ada)]
  for (const line of [own, first.cookie, second.cookie]) assert.equal(await who(app, origin, line, ada), ada)
  // One more session of her own ends the one she used longest ago, and none of the browsers of the program.
  const again = app.session(ada)
  assert.equal(await who(app, origin, own), 'no user')
  for (const line of [again, first.cookie, second.cookie]) assert.equal(await who(app, origin, line, ada), ada)
  // A browser that closes takes its session with it; a session of her own is never ended so.
  await first.end()
  assert.equal(await who(app, origin, first.cookie), 'no user')
  assert.equal(sessionRows(dataFolder).length, 2)
  // The app that closes ends the session of the browser that is still open, and leaves her own.
  await app.close()
  assert.equal(sessionRows(dataFolder).length, 1)
  await second.end()
})

test('[21-21@5] a signed-in caller is held to callerPerMinute, by who they are and not by their address', async (t) => {
  const limits = { anyonePerMinute: 2, callerPerMinute: 4 }
  const { app, origin, ada, advance } = await desk(t, {
    change: (description) => Object.assign(description.project, { limits }),
  })
  const cookie = app.session(ada)
  const body = JSON.stringify({ input: {}, as: ada })
  const status = async (o: Parameters<typeof send>[2]) => (await send(app, `${origin}/_t/call/whoAmI`, o)).status
  // Four calls of the user are taken in a minute and the fifth is not, from whichever address they come.
  const seen: number[] = []
  for (const from of ['127.0.0.1', '127.0.0.2', '127.0.0.3', '127.0.0.4', '127.0.0.5'])
    seen.push(await status({ headers: { cookie }, body, from }))
  assert.deepEqual(seen, [200, 200, 200, 200, 429])
  // A visitor at the same address has a count of their own, which is the smaller one.
  assert.deepEqual([await status({}), await status({}), await status({})], [200, 200, 429])
  // Another user is counted apart.
  const bob = String((await addUser(app, 'Bob')).user?.id)
  const other = app.session(bob)
  assert.equal(await status({ headers: { cookie: other }, body: JSON.stringify({ input: {}, as: bob }) }), 200)
  // The next minute starts every count anew.
  advance(60_000)
  assert.equal(await status({ headers: { cookie }, body }), 200)
})
