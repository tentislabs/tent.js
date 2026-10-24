import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { publish } from '../index.ts'
import type { Server } from './server.ts'
import { computer, fetched, folderOf, started } from './server.ts'

const system = { as: { kind: 'system' } } as const

/** Waits until something holds, and fails where it never does. */
async function until(what: string, holds: () => Promise<boolean>): Promise<void> {
  for (let n = 0; n < 1500; n++) {
    if (await holds()) return
    await new Promise((done) => setTimeout(done, 10))
  }
  assert.fail(`never: ${what}`)
}

const running = (server: Server): string | undefined => server.app.versions().find((one) => one.running)?.id

test('[50-10] a plain health query that reads a tenant table fails after the switch that changed that table, and the switch back over the files of tenants is taken at once: every file goes back, and each tenant reads its rows', async (t) => {
  const folder = folderOf(t)
  const server = await started(t, folder, { project: 'desk' })
  const here = computer(t, folder, 'here', join(import.meta.dirname, 'desk'))
  const to = server.key(['read', 'push', 'publish'])
  await here.save()
  const first = await publish({ project: here.project, history: here.history, to, fetch: fetched })
  const teams: string[] = []
  for (const name of ['one', 'two', 'three']) {
    const team = String(Object(await server.app.call('addTeam', { name }, system)).id)
    teams.push(team)
    await server.app.call('addOrder', { team, title: `order of ${name}` }, system)
  }

  // The next version changes `orders`, which every file holds, and names as its health query a plain query of
  // `orders`: it is asked after the switch, and fails there, since a read of a tenant table names its tenant.
  here.edit(
    'tables/tables.ts',
    '    code: text({ optional: true }),',
    '    code: text({ optional: true }),\n    rush: number({ optional: true }),',
  )
  here.edit(
    'tent.ts',
    '  backups: { every: false, keep: 2 },',
    "  backups: { every: false, keep: 2 },\n  publish: { health: 'listOrders' },",
  )
  await here.save()
  const heard: string[] = []
  server.engine.on('version.switched', (told) => void heard.push(told.to))
  const refused = await publish({ project: here.project, history: here.history, to, fetch: fetched }).then(
    () => undefined,
    (error: { code?: string; fields?: Record<string, string> }) => error,
  )
  assert.deepEqual([refused?.code, refused?.fields?.reason], ['T9103', 'health'])
  assert.equal(running(server), first.version, 'the switch back was taken at once')
  assert.deepEqual(heard.length, 2, 'the version ran, and was gone back from')
  assert.equal(heard[1], first.version)
  await until('every file is back at the running layout', async () => {
    const looked = await server.app.switch(String(running(server)), { dry: true })
    return (looked.behind ?? 0) === 0
  })
  for (const [k, team] of teams.entries()) {
    const rows = await server.app.read({ from: 'orders', of: team }, system)
    assert.deepEqual(
      (Array.isArray(rows) ? rows : []).map((row) => [Object(row).title, 'rush' in Object(row)]),
      [[`order of ${['one', 'two', 'three'][k]}`, false]],
    )
  }
})
