import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { publish } from '../index.ts'
import type { Server } from './server.ts'
import { computer, fetched, folderOf, started } from './server.ts'

const system = { as: { kind: 'system' } } as const
const tables = 'tables/tables.ts'

/** Waits until something holds, and fails where it never does. It waits for what it reads, and for no length of time. */
async function until(what: string, holds: () => Promise<boolean>): Promise<void> {
  for (let n = 0; n < 1500; n++) {
    if (await holds()) return
    await new Promise((done) => setTimeout(done, 10))
  }
  assert.fail(`never: ${what}`)
}

const running = (server: Server): string | undefined => server.app.versions().find((one) => one.running)?.id

/** How many files of tenants a dry switch to the running version counts as behind. */
const behind = async (server: Server): Promise<number> =>
  (await server.app.switch(String(running(server)), { dry: true })).behind ?? 0

test('[50-10] a publish that makes a column required checks every file of a tenant, is refused by one misfit, and with none leaves every file brought up; try says how many files are behind, and going back right after a failed health check is taken at once', async (t) => {
  const folder = folderOf(t)
  const server = await started(t, folder, { project: 'desk' })
  const here = computer(t, folder, 'here', join(import.meta.dirname, 'desk'))
  const to = server.key(['read', 'push', 'publish'])
  await here.save()
  await publish({ project: here.project, history: here.history, to, fetch: fetched })
  const teams: string[] = []
  for (const name of ['one', 'two', 'three'])
    teams.push(String(Object(await server.app.call('addTeam', { name }, system)).id))
  const [missing] = await Promise.all(
    teams.map((team, k) =>
      server.app.call('addOrder', { team, title: `order of ${k}`, ...(k === 0 ? {} : { code: `c${k}` }) }, system),
    ),
  )

  // A column made required: the file of the first team holds a row that does not fit.
  here.edit(tables, '    code: text({ optional: true }),', '    code: text(),')
  await here.save()
  const before = running(server)
  const tried = await publish({ project: here.project, history: here.history, to, fetch: fetched, try: true })
  assert.match(String(tried.refused), /^rows/)
  assert.equal(typeof tried.findings, 'object')
  const refused = await publish({ project: here.project, history: here.history, to, fetch: fetched }).then(
    () => undefined,
    (error: { code?: string; fields?: Record<string, string> }) => error,
  )
  assert.deepEqual([refused?.code, refused?.fields?.reason], ['T9103', 'rows'])
  assert.equal(running(server), before)

  // With the row mended, the publish goes, and the pass brings every file up.
  await server.app.write(
    [{ change: 'orders', of: teams[0], id: String(Object(missing).id), values: { code: 'mended' } }],
    {
      as: 'system',
    },
  )
  const done = await publish({ project: here.project, history: here.history, to, fetch: fetched })
  assert.equal(running(server), done.version)
  await until('every file is brought up', async () => (await behind(server)) === 0)

  // A health query that fails after a switch that changes a table it reads: the switch back is taken at once.
  here.edit(tables, '    code: text(),', '    code: text(),\n    rush: number({ optional: true }),')
  here.edit(
    'tent.ts',
    '  backups: { every: false, keep: 2 },',
    "  backups: { every: false, keep: 2 },\n  publish: { health: 'failing' },",
  )
  here.edit(
    'functions/functions.ts',
    "export const listOrders = query('listOrders', {",
    "export const failing = query('failing', {\n  access: 'nobody',\n  run: ({ db }) => {\n    if (db.orders.count() >= 0) throw new Error('down')\n    return []\n  },\n})\n\nexport const listOrders = query('listOrders', {",
  )
  await here.save()
  const tryNext = await publish({ project: here.project, history: here.history, to, fetch: fetched, try: true })
  assert.equal(typeof tryNext.behind, 'number', 'try says how many files are behind')
  const health = await publish({ project: here.project, history: here.history, to, fetch: fetched }).then(
    () => undefined,
    (error: { code?: string; fields?: Record<string, string> }) => error,
  )
  assert.deepEqual([health?.code, health?.fields?.reason], ['T9103', 'health'])
  assert.equal(running(server), done.version, 'the switch back was taken')
})
