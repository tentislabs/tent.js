import assert from 'node:assert/strict'
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { App, Engine } from '../../engine/index.ts'
import { createEngine, writeKey } from '../../engine/index.ts'
import type { History } from '../../history/index.ts'
import { openHistory } from '../../history/index.ts'
import type { Target } from '../index.ts'
import { publish, push, serveSync } from '../index.ts'
import { ada, closing, computer, fetched, folderOf } from './server.ts'

const tables = 'tables/orders.ts'
const system = { as: 'system' } as const

/** A server that keeps previews, in the mode `test` or `live`: the project `shop`, its history, and how to reach it. */
async function testServer(
  t: TestContext,
  folder: string,
  mode: 'test' | 'live' = 'test',
): Promise<{ engine: Engine; app: App; history: History; data: string; port: number; key(rights: string[]): Target }> {
  const project = join(folder, 'server-project')
  cpSync(join(import.meta.dirname, 'shop'), project, { recursive: true })
  const built = await buildProject(project, { for: 'release', out: join(folder, 'bundle') })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error'),
    [],
  )
  const data = join(folder, 'server-data')
  const engine = createEngine({ port: 0 })
  let history: History | undefined
  closing(t, async () => {
    await engine.close()
    history?.close()
  })
  const app = await engine.open(built.bundleFolder, { dataFolder: data, mode })
  history = openHistory(data)
  serveSync(engine, app, history, { dataFolder: data, mode })
  const port = Number(JSON.parse(readFileSync(join(data, 'engine.json'), 'utf8')).port)
  const address = `http://localhost:${port}`
  return {
    engine,
    app,
    history,
    data,
    port,
    key: (rights) => ({ address, key: writeKey(app, { name: rights.join(' '), rights }).key }),
  }
}

/** What `/_t/health` answers on a server under a name of the request's own. */
function healthAt(port: number, host: string): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((done, failed) => {
    const asked = request({ host: '127.0.0.1', port, path: '/_t/health', headers: { host } }, (response) => {
      const parts: Buffer[] = []
      response.on('data', (part: Buffer) => parts.push(part))
      response.on('end', () => {
        let body: unknown
        try {
          body = JSON.parse(Buffer.concat(parts).toString('utf8'))
        } catch {
          body = {}
        }
        done({ status: response.statusCode ?? 0, body: Object(Reflect.get(Object(body), 'value')) })
      })
    })
    asked.on('error', failed)
    asked.end()
  })
}

test('[45-13] `tent publish --preview` from a branch serves the branch at its own name, in the mode test, on a copy of the test data, and is removed when the branch is merged', async (t) => {
  const folder = folderOf(t)
  const server = await testServer(t, folder)
  const here = computer(t, folder, 'here')
  const to = server.key(['read', 'push', 'publish'])
  await here.save()
  const live = await publish({ project: here.project, history: here.history, to, fetch: fetched })
  await server.app.write([{ add: 'orders', values: { title: 'kept', total: 3, state: 'open' } }], system)
  // A branch whose orders gain a column.
  here.history.branch('rush')
  here.history.switch(here.project, 'rush', ada)
  here.edit(
    tables,
    '    note: text({ optional: true, max: NOTE_LENGTH }),',
    '    note: text({ optional: true, max: NOTE_LENGTH }),\n    rush: boolean({ optional: true }),',
  )
  await here.save()
  const preview = await publish({ project: here.project, history: here.history, to, fetch: fetched, preview: true })
  const name = `rush.localhost:${server.port}`
  assert.equal(preview.preview, `http://${name}`)
  assert.notEqual(preview.version, live.version)
  // The target goes on with what is live, and the branch answers at its own name.
  assert.equal(server.history.pointer('live'), live.point)
  assert.equal(server.app.versions().find((one) => one.running)?.id, live.version)
  const atTarget = await healthAt(server.port, `localhost:${server.port}`)
  assert.equal(atTarget.body.version, live.version)
  const atPreview = await healthAt(server.port, name)
  assert.equal(atPreview.status, 200)
  assert.equal(atPreview.body.version, preview.version)
  // Its data is a copy of the test data, with the branch's tables.
  const file = join(server.data, 'previews', 'rush', 'data', 'data.db')
  const data = new DatabaseSync(file, { readOnly: true })
  const rows = data.prepare('SELECT "title" FROM "orders"').all()
  const columns = data
    .prepare('SELECT "name" FROM pragma_table_info(\'orders\')')
    .all()
    .map((one) => one.name)
  data.close()
  assert.deepEqual(
    rows.map((one) => one.title),
    ['kept'],
  )
  assert.ok(columns.includes('rush'))
  // A write on the preview reaches nothing of the target.
  const targetRows: unknown = await server.app.read({ from: 'orders' }, system)
  assert.equal(Array.isArray(targetRows) ? targetRows.length : 0, 1)
  // The branch is merged and pushed: the preview is gone.
  here.history.switch(here.project, 'main', ada)
  here.history.merge(here.project, 'rush', ada)
  await push({ history: here.history, to, fetch: fetched, unchecked: true })
  for (let tries = 0; tries < 50 && (await healthAt(server.port, name)).status === 200; tries++)
    await new Promise((done) => setTimeout(done, 100))
  assert.equal((await healthAt(server.port, name)).status, 421, 'the name of the preview names no app any more')
  assert.equal(existsSync(join(server.data, 'previews', 'rush')), false)
  assert.equal((await healthAt(server.port, `localhost:${server.port}`)).body.version, live.version)
})

test('[45-13] a server in the mode `live` previews a branch on the seed alone, never on its rows, and in the mode test', async (t) => {
  const folder = folderOf(t)
  const server = await testServer(t, folder, 'live')
  const here = computer(t, folder, 'here')
  const to = server.key(['read', 'push', 'publish'])
  await here.save()
  await publish({ project: here.project, history: here.history, to, fetch: fetched })
  await server.app.write([{ add: 'orders', values: { title: 'live', total: 3, state: 'open' } }], system)
  here.history.branch('try-it')
  here.history.switch(here.project, 'try-it', ada)
  here.edit(tables, '    title: text({ min: 1, max: 80 }),', '    title: text({ min: 1, max: 120 }),')
  await here.save()
  const preview = await publish({ project: here.project, history: here.history, to, fetch: fetched, preview: true })
  assert.equal(preview.preview, `http://try-it.localhost:${server.port}`)
  const data = new DatabaseSync(join(server.data, 'previews', 'try-it', 'data', 'data.db'), { readOnly: true })
  const rows = data.prepare('SELECT count(*) AS "n" FROM "orders"').get()
  data.close()
  assert.equal(rows?.n, 0, 'no live row is copied')
  const robots = await new Promise<string>((done, failed) => {
    const asked = request(
      {
        host: '127.0.0.1',
        port: server.port,
        path: '/robots.txt',
        headers: { host: `try-it.localhost:${server.port}` },
      },
      (response) => {
        const parts: Buffer[] = []
        response.on('data', (part: Buffer) => parts.push(part))
        response.on('end', () => done(Buffer.concat(parts).toString('utf8')))
      },
    )
    asked.on('error', failed)
    asked.end()
  })
  assert.match(robots, /Disallow: \//, 'the preview runs in the mode test')
})

test('[45-13] a preview has the secrets of the target test app and a key of its own, handed to it and laid in no file: on a test server the key of those secrets, on a live server a new one', async (t) => {
  for (const mode of ['test', 'live'] as const) {
    const folder = join(folderOf(t), mode)
    const server = await testServer(t, folder, mode)
    // The key of the folder, and a file of secrets for each kind of data, as `tent secrets set` leaves them.
    const key = `${Buffer.alloc(32, 7).toString('base64')}\n`
    writeFileSync(join(server.data, 'secret.key'), key)
    for (const held of ['test', 'live'])
      writeFileSync(
        join(server.data, `secrets.${held}`),
        `${JSON.stringify({ format: 'tent.secrets/1', values: { MAIL_KEY: `sealed for ${held}` } })}\n`,
      )
    const here = computer(t, folder, 'here')
    const to = server.key(['read', 'push', 'publish'])
    await here.save()
    await publish({ project: here.project, history: here.history, to, fetch: fetched })
    here.history.branch('look')
    here.history.switch(here.project, 'look', ada)
    here.edit(tables, '    title: text({ min: 1, max: 80 }),', '    title: text({ min: 1, max: 90 }),')
    await here.save()
    await publish({ project: here.project, history: here.history, to, fetch: fetched, preview: true })
    const data = join(server.data, 'previews', 'look', 'data')
    const there = (name: string): string | undefined =>
      existsSync(join(data, name)) ? readFileSync(join(data, name), 'utf8') : undefined
    // The key a preview opens with is kept with the preview, for its next opening, and never as a key file.
    const kept = Object(JSON.parse(readFileSync(join(server.data, 'previews', 'previews.json'), 'utf8'))).look
    assert.equal(there('secret.key'), undefined, 'no file of a key')
    assert.match(String(kept.key), /^[A-Za-z0-9+/]{43}=$/)
    if (mode === 'test') {
      assert.equal(`${kept.key}\n`, key, 'the key of the test data, which sealed its secrets')
      assert.match(there('secrets.test') ?? '', /sealed for test/, 'the secrets of the test app')
    } else {
      assert.notEqual(`${kept.key}\n`, key, 'no key of the live server')
      assert.equal(there('secrets.test'), undefined)
    }
    assert.equal(there('secrets.live'), undefined, 'never the secrets of live')
  }
})
