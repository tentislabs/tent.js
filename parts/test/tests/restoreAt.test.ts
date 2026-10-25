import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { App } from '../../engine/index.ts'
import { createEngine } from '../../engine/index.ts'
import type { TestClock } from '../clock.ts'
import { testClock } from '../clock.ts'
import { testSecrets } from '../secrets.ts'
import { command } from './desks.ts'
import { closing, copyOf } from './projects.ts'
import type { S3StandIn } from './s3StandIn.ts'
import { s3StandIn } from './s3StandIn.ts'
import { held as heldToBar } from '../../../rig/budgets.ts'

const system = { as: { kind: 'system' } } as const

/** The app of the archive in an engine of the test's own, on a data folder of the test, with a clock it moves. */
interface Archived {
  app: App
  clock: TestClock
  dataFolder: string
  /** What the clock of the app reads: the time of the runtime with the moves of the test. */
  now(): number
  /** Closes the engine, and opens the bundle again on the same data folder. `between` is done while it is closed. */
  reopen(between?: () => void): Promise<void>
}

/** Builds the project of the archive, where `store` names a store of the S3 protocol for its backups. */
async function archivedBundle(t: TestContext, store?: S3StandIn): Promise<string> {
  const project = copyOf(t, 'archived')
  if (store) {
    const file = join(project, 'tent.ts')
    const text = readFileSync(file, 'utf8')
    const stated = `backups: { every: false, keep: 8, store: s3({ url: '${store.url}', bucket: 'tent', key: secret('storeKey') }) },`
    writeFileSync(
      file,
      text
        .replace("import { project } from 'tentjs'", "import { project, s3, secret } from 'tentjs'")
        .replace('backups: { every: false, keep: 8 },', stated),
    )
  }
  const built = await buildProject(project, { for: 'dev', out: join(project, 'bundle') })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error').map((one) => `${one.code} ${one.message}`),
    [],
  )
  return built.bundleFolder
}

/** Opens the app of the archive, and with a store sets the secret of its key on the data folder first. */
async function archivedApp(t: TestContext, store?: S3StandIn): Promise<Archived> {
  const bundle = await archivedBundle(t, store)
  const dataFolder = join(bundle, '..', 'data')
  const { clock, moves } = testClock()
  let engine = createEngine({ port: 0, makers: { clock: () => clock } })
  const description = JSON.parse(readFileSync(join(bundle, 'description.json'), 'utf8'))
  const open = async (): Promise<App> => {
    testSecrets(dataFolder, description, store ? { storeKey: store.key } : {})
    return engine.open(bundle, { dataFolder, mode: 'test', address: '*' })
  }
  const held: Archived = {
    app: await open(),
    clock: moves,
    dataFolder,
    now: () => clock.now(),
    async reopen(between) {
      await engine.close()
      between?.()
      engine = createEngine({ port: 0, makers: { clock: () => clock } })
      held.app = await open()
    },
  }
  closing(t, () => engine.close())
  return held
}

/** Every row of the app, in each file, as the system reads it: the shared tables, and the tasks of each team. */
async function rowsOf(app: App): Promise<Record<string, unknown>> {
  const read = async (plan: object): Promise<Record<string, unknown>[]> => {
    const rows: unknown = await app.read({ ...plan, sort: [{ by: 'id' }] }, system)
    return Array.isArray(rows) ? rows : []
  }
  const teams = await read({ from: 'teams' })
  const tasks: Record<string, unknown> = {}
  for (const team of teams) tasks[String(team.id)] = await read({ from: 'tasks', of: team.id })
  return { teams, notes: await read({ from: 'notes' }), tasks }
}

/** The fingerprint of every row of the app as it stands. */
const printOf = async (app: App): Promise<string> =>
  createHash('sha256')
    .update(JSON.stringify(await rowsOf(app)))
    .digest('hex')

/** One minute of writes: a note of the shared file, and a task in the file of each team. */
async function minute(held: Archived, teams: string[], m: number): Promise<void> {
  held.clock.advance('1 minute')
  await held.app.call('writeNote', { title: `note ${m}`, secret: `the secret of minute ${m}` }, system)
  for (const team of teams) await held.app.call('writeTask', { team, title: `task ${m}` }, system)
}

/** Adds two teams, each of which then has a data file of its own. */
async function twoTeams(app: App): Promise<string[]> {
  const teams: string[] = []
  for (const name of ['north', 'south']) teams.push(String(await app.call('addTeam', { name }, system)))
  return teams
}

/** The moment of the clock of the app, as `--at` takes it. */
const momentOf = (clockNow: number): string => new Date(clockNow).toISOString()

test('[45-1] an hour of writes after a backup is restored to a moment in the middle: the shared file and the file of each team hold exactly the rows of that moment, `--dry` says it first, and a moment after the restore is reached too', async (t) => {
  const held = await archivedApp(t)
  const teams = await twoTeams(held.app)
  const backup: Record<string, unknown> = Object(await command(held.app, held.dataFolder, 'data', { what: 'backup' }))
  assert.equal(typeof backup.file, 'string')
  let middle = 0
  let print = ''
  for (let m = 1; m <= 60; m++) {
    await minute(held, teams, m)
    if (m === 30) {
      middle = held.now()
      print = await printOf(held.app)
    }
  }
  const end = await printOf(held.app)
  assert.notEqual(end, print)

  // The archive is cut into parts, each named by the number of its first change and its time.
  const parts = readdirSync(join(held.dataFolder, 'backups', 'archive')).filter((name) =>
    /^\d+-\d+\.changes$/.test(name),
  )
  assert.ok(parts.length >= 2, `several parts: ${parts.join(', ')}`)
  const firsts = parts.map((name) => Number(name.split('-')[0])).sort((a, b) => a - b)
  assert.deepEqual([...new Set(firsts)].length, firsts.length, 'each part begins at its own change')

  // `--dry` says which backup, how many changes, and the moment it reaches, and changes nothing.
  const said: Record<string, unknown> = Object(
    await command(held.app, held.dataFolder, 'data', { what: 'restore', at: momentOf(middle), dry: true }),
  )
  assert.equal(said.backup, String(backup.file).split(/[\\/]/).at(-1))
  assert.equal(typeof said.changes, 'number')
  assert.ok(Number(said.changes) >= 30, `the changes of thirty minutes: ${String(said.changes)}`)
  const reaches = Date.parse(String(said.reaches))
  assert.ok(
    reaches <= middle && reaches > middle - 60_000,
    `the moment of the last change before it: ${String(said.reaches)}`,
  )
  assert.equal(await printOf(held.app), end, 'a dry restore changes nothing')

  const restored: Record<string, unknown> = Object(
    await command(held.app, held.dataFolder, 'data', { what: 'restore', at: momentOf(middle) }),
  )
  assert.deepEqual([restored.backup, restored.changes, restored.reaches], [said.backup, said.changes, said.reaches])
  assert.equal(await printOf(held.app), print, 'every file holds exactly the rows of that moment')

  // The app goes on from there, and a moment after the restore is reached as it stood then.
  for (let m = 61; m <= 70; m++) await minute(held, teams, m)
  const later = held.now()
  const laterPrint = await printOf(held.app)
  for (let m = 71; m <= 80; m++) await minute(held, teams, m)
  await command(held.app, held.dataFolder, 'data', { what: 'restore', at: momentOf(later) })
  assert.equal(await printOf(held.app), laterPrint, 'a moment after the first restore')
  // And a moment before it is still the moment that was.
  await command(held.app, held.dataFolder, 'data', { what: 'restore', at: momentOf(middle) })
  assert.equal(await printOf(held.app), print, 'the moment in the middle, once more')
})

test('[45-1] a moment before the oldest backup is refused with T0002 and nothing is restored; and with `archive: false` no part is kept', async (t) => {
  const held = await archivedApp(t)
  const teams = await twoTeams(held.app)
  const before = held.now()
  held.clock.advance('1 minute')
  await command(held.app, held.dataFolder, 'data', { what: 'backup' })
  for (let m = 1; m <= 3; m++) await minute(held, teams, m)
  const print = await printOf(held.app)
  await assert.rejects(command(held.app, held.dataFolder, 'data', { what: 'restore', at: momentOf(before - 60_000) }), {
    code: 'T0002',
  })
  assert.equal(await printOf(held.app), print)

  const project = copyOf(t, 'archived')
  const file = join(project, 'tent.ts')
  writeFileSync(file, readFileSync(file, 'utf8').replace('keep: 8 }', 'keep: 8, archive: false }'))
  const built = await buildProject(project, { for: 'dev', out: join(project, 'bundle') })
  const engine = createEngine({ port: 0 })
  closing(t, () => engine.close())
  const dataFolder = join(project, 'data')
  testSecrets(dataFolder, built.description, {})
  const off = await engine.open(built.bundleFolder, { dataFolder, mode: 'test', address: '*' })
  await twoTeams(off)
  await command(off, dataFolder, 'data', { what: 'backup' })
  await off.call('writeNote', { title: 'one', secret: 'two' }, system)
  await engine.close()
  assert.equal(existsSync(join(dataFolder, 'backups', 'archive')), false, 'no archive')
})

test('[45-1] with the archive in a store, a deleted data folder is restored from the store alone, and a sealed value is still sealed in the archive', async (t) => {
  const store = await s3StandIn(t)
  const held = await archivedApp(t, store)
  const teams = await twoTeams(held.app)
  await command(held.app, held.dataFolder, 'data', { what: 'backup' })
  let middle = 0
  let print = ''
  for (let m = 1; m <= 40; m++) {
    await minute(held, teams, m)
    if (m === 20) {
      middle = held.now()
      print = await printOf(held.app)
    }
  }
  // The archive lies in the store, and nothing of it in the folder of the backups.
  await held.reopen()
  assert.equal(existsSync(join(held.dataFolder, 'backups', 'archive')), false)
  assert.ok(store.objects.size > 2, `the store holds the archive and the backup: ${store.objects.size}`)
  assert.deepEqual(store.refused, [], 'every request was signed by the protocol')
  // No archived byte holds a sealed value as it was written.
  for (const [name, bytes] of store.objects) {
    const text = Buffer.from(bytes).toString('latin1')
    assert.equal(text.includes('the secret of minute'), false, `${name} holds no sealed value open`)
  }

  // The disk is lost: the data folder is opened again empty, and restored from the store alone. The key of the
  // secrets is the server's own, as `TENT_SECRET_KEY` holds it there: it is laid into the empty folder again.
  const keyFile = join(held.dataFolder, 'secret.key')
  const key = readFileSync(keyFile)
  await held.reopen(() => {
    rmSync(held.dataFolder, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
    mkdirSync(held.dataFolder, { recursive: true })
    writeFileSync(keyFile, key)
  })
  assert.deepEqual(await rowsOf(held.app), { teams: [], notes: [], tasks: {} })
  await command(held.app, held.dataFolder, 'data', { what: 'restore', at: momentOf(middle) })
  assert.equal(await printOf(held.app), print, 'the rows of that moment, from the store alone')
})

test('[45-1] a restore of a day of a busy app takes seconds', async (t) => {
  const held = await archivedApp(t)
  const teams = await twoTeams(held.app)
  await command(held.app, held.dataFolder, 'data', { what: 'backup' })
  // A day of writes, one every few seconds: three changes each.
  for (let m = 1; m <= 2000; m++) {
    held.clock.advance('40 seconds')
    await held.app.call('writeNote', { title: `note ${m}`, secret: `secret ${m}` }, system)
    await held.app.call('writeTask', { team: teams[m % 2], title: `task ${m}` }, system)
  }
  const end = held.now()
  const print = await printOf(held.app)
  held.clock.advance('1 minute')
  await held.app.call('writeNote', { title: 'after', secret: 'after' }, system)
  const started = performance.now()
  const restored: Record<string, unknown> = Object(
    await command(held.app, held.dataFolder, 'data', { what: 'restore', at: momentOf(end) }),
  )
  const took = performance.now() - started
  assert.ok(Number(restored.changes) >= 4000, `the changes of the day: ${String(restored.changes)}`)
  assert.equal(await printOf(held.app), print)
  heldToBar('restore.day', took, 'ms')
})
