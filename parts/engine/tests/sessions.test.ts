import assert from 'node:assert/strict'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { running, send, system } from './apps.ts'

/** The rows of `_t_sessions` as the data file holds them, read beside the engine. */
function sessionRows(dataFolder: string): Record<string, unknown>[] {
  const data = new DatabaseSync(join(dataFolder, 'data.db'), { readOnly: true })
  try {
    return data.prepare('SELECT * FROM "_t_sessions" ORDER BY "createdAt", rowid').all()
  } finally {
    data.close()
  }
}

test('[21-20@7a] session.started is heard once for each session that was started, with the app and the user, and never for one that a change undid', async (t) => {
  const { app, engine, origin, dataFolder } = await running(t, { project: 'signs' })
  const heard: Record<string, unknown>[] = []
  engine.on('session.started', (told) => void heard.push({ ...told }))
  const ada = String(Object(await app.call('addUser', { email: 'ada@example.com' }, { as: system })).id)
  const headers = { origin }

  // An action starts a session: the event is raised once, and names the app and the user.
  const first = await send(app, `${origin}/_t/call/signIn`, { input: { email: 'ada@example.com' }, headers })
  assert.deepEqual(first.body, { ok: true, caller: 'changed' })
  assert.deepEqual(heard, [{ app, user: ada }])

  // In a change the session is part of the write: it is heard of once the write is committed.
  heard.length = 0
  const second = await send(app, `${origin}/_t/call/signInWrite`, { input: { email: 'ada@example.com' }, headers })
  assert.deepEqual(second.body, { ok: true, caller: 'changed' })
  assert.deepEqual(heard, [{ app, user: ada }])

  // A change that is undone leaves no session, no cookie and no event, and its answer says nothing of the caller.
  heard.length = 0
  const undone = await send(app, `${origin}/_t/call/signInWrite`, {
    input: { email: 'ada@example.com', undo: true },
    headers,
  })
  assert.deepEqual([undone.body.ok, undone.error.code, undone.body.caller], [false, 'undone', undefined])
  assert.equal(undone.headers.getSetCookie().length, 0)
  assert.equal(heard.length, 0)
  assert.equal(sessionRows(dataFolder).length, 2)

  // The end of a session raises nothing, and its row is gone from the data.
  const cookie = first.headers.getSetCookie()[0].split(';')[0]
  const out = await send(app, `${origin}/_t/call/signOut`, {
    headers: { ...headers, cookie },
    body: JSON.stringify({ input: {}, as: ada }),
  })
  assert.deepEqual(out.body, { ok: true, caller: 'changed' })
  assert.equal(heard.length, 0)
  assert.equal(sessionRows(dataFolder).length, 1)
})

test('[16-4@7a] _t_sessions holds exactly its columns: the fingerprint of the bytes of a cookie and never the bytes, with the life of a session that was started with one of its own', async (t) => {
  const { app, origin, dataFolder } = await running(t, { project: 'signs' })
  const ada = String(Object(await app.call('addUser', { email: 'ada@example.com' }, { as: system })).id)
  const headers = { origin }
  const whole = await send(app, `${origin}/_t/call/signIn`, { input: { email: 'ada@example.com' }, headers })
  const short = await send(app, `${origin}/_t/call/signIn`, {
    input: { email: 'ada@example.com', for: '30 minutes', browserOnly: true },
    headers,
  })
  assert.deepEqual([whole.body.ok, short.body.ok], [true, true])
  const rows = sessionRows(dataFolder)
  assert.equal(rows.length, 2)
  for (const row of rows)
    assert.deepEqual(Object.keys(row).sort(), [
      'browserOnly',
      'createdAt',
      'expiresAt',
      'fingerprint',
      'life',
      'usedAt',
      'user',
    ])
  const [first, second] = rows[0].life === null ? rows : [rows[1], rows[0]]
  assert.deepEqual([first.user, first.browserOnly, first.life], [ada, 0, null])
  assert.deepEqual([second.user, second.browserOnly, second.life], [ada, 1, 30 * 60_000])
  // A session lasts `sessionTime` from its last use, and one with a life of its own that long.
  const ms = (value: unknown): number => new Date(String(value)).getTime() || Number(value)
  assert.equal(ms(first.expiresAt) - ms(first.usedAt), 30 * 86_400_000)
  assert.equal(ms(second.expiresAt) - ms(second.usedAt), 30 * 60_000)
  // What the data keeps is the fingerprint of the 32 bytes, in hex: a copy of the data signs nobody in.
  const kept = JSON.stringify(rows)
  for (const answer of [whole, short]) {
    const [line] = answer.headers.getSetCookie()
    const value = line.split(';')[0].split('=')[1]
    assert.match(value, /^[A-Za-z0-9_-]{43}$/)
    assert.equal(kept.includes(value), false)
  }
  for (const row of rows) assert.match(String(row.fingerprint), /^[0-9a-f]{64}$/)
  // A cookie that ends with the browser has no life of its own.
  assert.match(whole.headers.getSetCookie()[0], /; Max-Age=2592000$/)
  assert.doesNotMatch(short.headers.getSetCookie()[0], /Max-Age/)
})
