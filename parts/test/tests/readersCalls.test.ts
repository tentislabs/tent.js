import assert from 'node:assert/strict'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { testApp } from '../index.ts'
import { api, keyedApp, keyOf } from './keyedApp.ts'
import { current, level, readersHeld, until } from './many.ts'
import { closing, copyOf, tempOf } from './projects.ts'

/** Every file of a folder and below it, by its place. */
function filesUnder(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const lies = join(folder, name)
    return statSync(lies).isDirectory() ? filesUnder(lies) : [lies]
  })
}

/** How many calls of a name the log of the writer holds. */
function writerCalls(temp: string, name: string): number {
  const file = filesUnder(temp).find((one) => one.replaceAll('\\', '/').endsWith('/data/logs.db'))
  assert.ok(file, 'the writer keeps a log')
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    return Number(Object(db.prepare('SELECT count(*) AS n FROM calls WHERE name = ?').get(name)).n)
  } finally {
    db.close()
  }
}

test(
  '[29-3@8a] `/api/<name>` of a query is answered by the reader with no write reaching the writer, and of a change by the writer',
  readersHeld,
  async (t) => {
    const temp = tempOf(t)
    const app = await keyedApp(t)
    const near = await app.reader()
    await current(app, near)
    const maya = await app.user({ name: 'Maya', roles: [] })
    const { key } = await keyOf(app, { scopes: ['*'], user: maya.user?.id })
    await app.as(maya).call('addOrder', { title: 'one' })
    await level(app, near)
    // The key was used once on the writer: its next use within the minute writes nothing.
    await api(app, 'GET', 'myOrders', { key })
    await level(app, near)
    const before = app.at().n
    const calls = writerCalls(temp, 'myOrders')
    const read = await api(near, 'GET', 'myOrders', { key })
    assert.deepEqual([read.status, read.body], [200, [{ title: 'one' }]])
    assert.equal(app.at().n, before, 'no write reached the writer')
    assert.equal(writerCalls(temp, 'myOrders'), calls, 'the writer answered no call of it')
    const added = await api(near, 'POST', 'addOrder', { key, input: { title: 'two' } })
    assert.equal(added.status, 204, JSON.stringify(added.body))
    assert.deepEqual(
      (await app.rows('orders')).map((one) => one.title).sort(),
      ['one', 'two'],
      'the writer carried the change out',
    )
  },
)

test("[29-3@8a] an `incoming` sent to a reader is handed on, and its run is the writer's", readersHeld, async (t) => {
  const app = await testApp({ folder: copyOf(t, 'hooked') })
  closing(t, () => app.close())
  const near = await app.reader()
  await current(app, near)
  const answer = await near.request(
    new Request('http://localhost/hooks/open', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"from":"the reader"}',
    }),
    { from: '203.0.113.9' },
  )
  assert.equal(answer.status, 200)
  await until('the run of the writer noted the call', async () => (await app.rows('events')).length === 1)
  assert.deepEqual(Object((await app.rows('events'))[0].event).body, { from: 'the reader' })
})

test(
  '[29-3@8a] a key that is used on a reader alone has its `lastUsedAt` moved on the writer',
  readersHeld,
  async (t) => {
    const app = await keyedApp(t)
    const near = await app.reader()
    await current(app, near)
    const { key } = await keyOf(app, { scopes: ['*'] })
    await level(app, near)
    const used = async (): Promise<unknown> => Object(await app.as('system').call('listKeys', {}))[0]?.lastUsedAt
    assert.equal(await used(), undefined)
    assert.equal((await api(near, 'GET', 'myOrders', { key })).status, 200)
    await until('the writer noted the use', async () => (await used()) !== undefined)
  },
)

test(
  '[29-9@8a] the removal of a key is answered after the far reader confirmed: from then on the key is nobody on every machine',
  readersHeld,
  async (t) => {
    const app = await keyedApp(t)
    const far = await app.reader({ far: true })
    await current(app, far)
    const { id, key } = await keyOf(app, { scopes: ['*'] })
    await level(app, far)
    assert.equal((await api(far, 'GET', 'myOrders', { key })).status, 200)
    await app.as('system').call('removeKey', { id })
    const after = await api(far, 'GET', 'myOrders', { key })
    assert.equal(Object(after.body).code, 'T0006', 'the far reader holds the removal once it is answered')
  },
)
