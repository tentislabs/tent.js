import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { App } from '../../engine/index.ts'
import { createEngine } from '../../engine/index.ts'
import { testClock } from '../clock.ts'
import { testSecrets } from '../secrets.ts'
import { command } from './desks.ts'
import { closing, copyOf } from './projects.ts'
import { s3StandIn } from './s3StandIn.ts'

const system = { as: { kind: 'system' } } as const

/** Whether bytes that a store is handed are a part of the archive: each change of one stands behind the count of its head. */
const isPart = (bytes: Uint8Array): boolean => Buffer.from(bytes.subarray(4, 6)).toString('latin1') === '{"'

/** The fingerprint of every row of the app as it stands: the shared tables, and the tasks of each team. */
async function printOf(app: App): Promise<string> {
  const read = async (plan: object): Promise<Record<string, unknown>[]> => {
    const rows: unknown = await app.read({ ...plan, sort: [{ by: 'id' }] }, system)
    return Array.isArray(rows) ? rows : []
  }
  const teams = await read({ from: 'teams' })
  const tasks: Record<string, unknown> = {}
  for (const team of teams) tasks[String(team.id)] = await read({ from: 'tasks', of: team.id })
  const all = { teams, notes: await read({ from: 'notes' }), tasks }
  return createHash('sha256').update(JSON.stringify(all)).digest('hex')
}

test('[45-1] a part of the archive that its store fails to take is written with the next one, in order: a restore to a moment reaches it', async (t) => {
  const store = await s3StandIn(t)
  // The store fails the second part it is handed, once, as a store answers 500 for a moment.
  let parts = 0
  store.fails = (bytes) => isPart(bytes) && ++parts === 2
  const project = copyOf(t, 'archived')
  const file = join(project, 'tent.ts')
  writeFileSync(
    file,
    readFileSync(file, 'utf8')
      .replace("import { project } from 'tentjs'", "import { project, s3, secret } from 'tentjs'")
      .replace(
        'backups: { every: false, keep: 8 },',
        `backups: { every: false, keep: 8, store: s3({ url: '${store.url}', bucket: 'tent', key: secret('storeKey') }) },`,
      ),
  )
  const built = await buildProject(project, { for: 'dev', out: join(project, 'bundle') })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error').map((one) => `${one.code} ${one.message}`),
    [],
  )
  const dataFolder = join(built.bundleFolder, '..', 'data')
  const description = JSON.parse(readFileSync(join(built.bundleFolder, 'description.json'), 'utf8'))
  const { clock, moves } = testClock()
  const open = async (): Promise<{ app: App; close(): Promise<void> }> => {
    testSecrets(dataFolder, description, { storeKey: store.key })
    const engine = createEngine({ port: 0, makers: { clock: () => clock } })
    closing(t, () => engine.close())
    return {
      app: await engine.open(built.bundleFolder, { dataFolder, mode: 'test', address: '*' }),
      close: () => engine.close(),
    }
  }
  const first = await open()
  const teams: string[] = []
  for (const name of ['north', 'south']) teams.push(String(await first.app.call('addTeam', { name }, system)))
  await command(first.app, dataFolder, 'data', { what: 'backup' })
  let middle = 0
  let print = ''
  for (let m = 1; m <= 40; m++) {
    moves.advance('1 minute')
    await first.app.call('writeNote', { title: `note ${m}`, secret: `the secret of minute ${m}` }, system)
    for (const team of teams) await first.app.call('writeTask', { team, title: `task ${m}` }, system)
    if (m === 20) {
      middle = clock.now()
      print = await printOf(first.app)
    }
  }
  // Every part is written by the time the engine has closed.
  await first.close()
  assert.ok(parts > 2, `the store was handed several parts: ${parts}`)
  const again = await open()
  await command(again.app, dataFolder, 'data', { what: 'restore', at: new Date(middle).toISOString() })
  assert.equal(await printOf(again.app), print, 'the rows of that moment')
})
