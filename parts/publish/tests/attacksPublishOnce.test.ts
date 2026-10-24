import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { Point } from '../../history/index.ts'
import { idOf } from '../../history/index.ts'
import { blobsBody, blobsType } from '../blobsBody.ts'
import { publish } from '../index.ts'
import type { Computer, Server } from './server.ts'
import { ada, computer, fetched, folderOf, sent, started } from './server.ts'

const print = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
const functions = 'functions/orders.ts'
const tables = 'tables/orders.ts'

const running = (server: Server): string | undefined => server.app.versions().find((one) => one.running)?.id

/** What a promise was refused with, or nothing where it was kept. */
const refusal = (done: Promise<unknown>): Promise<{ code?: string; fields?: Record<string, string> } | undefined> =>
  done.then(
    () => undefined,
    (error: { code?: string; fields?: Record<string, string> }) => error,
  )

/** A server, a computer, and a first publish of the project as it lies. */
async function published(t: TestContext): Promise<{ server: Server; here: Computer; to: ReturnType<Server['key']> }> {
  const folder = folderOf(t)
  const server = await started(t, folder)
  const here = computer(t, folder, 'here')
  const to = server.key(['read', 'push', 'publish'])
  await here.save()
  await publish({ project: here.project, history: here.history, to, fetch: fetched })
  return { server, here, to }
}

/** The columns of a table of the server's data file, as the data file holds them. */
function columnsOf(server: Server, table: string): string[] {
  const db = new DatabaseSync(join(server.data, 'data.db'), { readOnly: true })
  try {
    return db
      .prepare(`SELECT "name" FROM pragma_table_info('${table}')`)
      .all()
      .map((row) => String(row.name))
      .sort()
  } finally {
    db.close()
  }
}

/**
 * Builds the computer's project as it lies, and sends what a publish of it sends before `/_t/publish`: its blobs,
 * and a point named by its version whose parent is what is live. Answers the body that asks for its publish.
 */
async function readied(server: Server, here: Computer, key: string, out: string): Promise<string> {
  const built = await buildProject(here.project, { for: 'release', out })
  const files = new Map<string, Uint8Array>()
  for (const one of readdirSync(built.bundleFolder, { recursive: true, withFileTypes: true }))
    if (one.isFile()) {
      const lies = join(one.parentPath, one.name)
      files.set(lies.slice(built.bundleFolder.length + 1).replaceAll('\\', '/'), readFileSync(lies))
    }
  await sent(
    server,
    '/_t/sync/blobs?for=bundle',
    blobsBody([...files.values()].map((one) => [print(one), one])),
    key,
    blobsType,
  )
  const held: Omit<Point, 'id'> = {
    parents: [String(server.history.pointer('live'))],
    at: Date.now(),
    by: ada,
    kind: 'published',
    name: built.versionId,
    files: {},
  }
  const point = { id: idOf(held), ...held }
  await sent(server, '/_t/sync/points', { points: [point] }, key)
  const listed = Object.fromEntries([...files].map(([path, bytes]) => [path, print(bytes)]))
  return JSON.stringify({ point: point.id, version: built.versionId, files: listed })
}

test('[05-15.8] two publishes at once: one runs, and the other is T9103', async (t) => {
  const { server, here, to } = await published(t)
  here.edit(functions, ".limit(input('limit'))", '.limit(50)')
  const first = await readied(server, here, to.key, join(here.project, '..', 'first'))
  here.edit(functions, '.limit(50)', '.limit(70)')
  const second = await readied(server, here, to.key, join(here.project, '..', 'second'))
  // Both are asked in one moment, each as a publish asks.
  const answers = await Promise.all(
    [first, second].map(async (body) => {
      const answer = await fetch(`${server.address}/_t/publish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${to.key}` },
        body,
      })
      return Object(await answer.json())
    }),
  )
  const codes = answers.map((one) => (one.ok === true ? 'ok' : String(Object(one.error).code))).sort()
  assert.deepEqual(codes, ['T9103', 'ok'], JSON.stringify(answers))
  const won = answers.findIndex((one) => one.ok === true)
  assert.equal(running(server), JSON.parse([first, second][won]).version, 'the one that ran is live')
})

test('[05-15.9] a publish whose version fails its health check, and one whose table change a row does not fit, is T9103, with the old version running and its tables as they were', async (t) => {
  const { server, here, to } = await published(t)
  await server.app.write([{ add: 'orders', values: { title: 'one', total: 5, state: 'open' } }], { as: 'system' })
  const before = {
    version: running(server),
    orders: columnsOf(server, 'orders'),
    clients: columnsOf(server, 'clients'),
  }
  const rows = async (): Promise<unknown> => {
    const db = new DatabaseSync(join(server.data, 'data.db'), { readOnly: true })
    try {
      return db
        .prepare('SELECT "title" FROM "orders"')
        .all()
        .map((row) => row.title)
    } finally {
      db.close()
    }
  }
  // A health query that fails: once where it reads no table the publish changes, and once where it reads that table.
  here.edit('tent.ts', "{ title: 'Shop' }", "{ title: 'Shop', publish: { health: 'failing' } }")
  here.edit(
    tables,
    '    note: text({ optional: true, max: NOTE_LENGTH }),',
    '    note: text({ optional: true, max: NOTE_LENGTH }),\n    rush: number({ optional: true }),',
  )
  const anchor = "export const openOrders = query('openOrders', {"
  for (const read of ['clients', 'orders']) {
    const failing = `export const failing = query('failing', {\n  access: 'nobody',\n  run: ({ db }) => {\n    if (db.${read}.count() >= 0) throw new Error('down')\n    return []\n  },\n})\n\n`
    here.edit(functions, anchor, `${failing}${anchor}`)
    await here.save()
    const health = await refusal(publish({ project: here.project, history: here.history, to, fetch: fetched }))
    assert.deepEqual([health?.code, health?.fields?.reason], ['T9103', 'health'], `a health query of ${read}`)
    assert.equal(running(server), before.version, `the old version runs, after a health query of ${read}`)
    assert.deepEqual(
      columnsOf(server, 'orders'),
      before.orders,
      `the orders as they were, after a health query of ${read}`,
    )
    assert.deepEqual(columnsOf(server, 'clients'), before.clients)
    assert.deepEqual(await rows(), ['one'])
    here.edit(functions, failing, '')
  }
  here.edit('tent.ts', "{ title: 'Shop', publish: { health: 'failing' } }", "{ title: 'Shop' }")
  // A table change that the live row does not fit: the note it has none of is made required.
  here.edit(tables, '    note: text({ optional: true, max: NOTE_LENGTH }),', '    note: text({ max: NOTE_LENGTH }),')
  await here.save()
  const refused = await refusal(publish({ project: here.project, history: here.history, to, fetch: fetched }))
  assert.deepEqual([refused?.code, refused?.fields?.reason], ['T9103', 'rows'])
  assert.equal(running(server), before.version)
  assert.deepEqual(columnsOf(server, 'orders'), before.orders)
  assert.deepEqual(await rows(), ['one'])
})
