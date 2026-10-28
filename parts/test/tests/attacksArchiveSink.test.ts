import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { App } from '../../engine/index.ts'
import { createEngine } from '../../engine/index.ts'
import type { TestClock } from '../clock.ts'
import { testClock } from '../clock.ts'
import { testSecrets } from '../secrets.ts'
import { DatabaseSync } from 'node:sqlite'
import {
  addOrder,
  addTeam,
  command,
  dataPlace,
  deskBundle,
  deskOf,
  ordersOf,
  pairOf,
  readerFolder,
  titlesOf,
} from './desks.ts'
import { beat, current, level, readersHeld } from './many.ts'
import { closing, copyOf } from './projects.ts'

const system = { as: { kind: 'system' } } as const

/** An app of the tests in an engine of the test's own, on a data folder of the test, with a clock it moves. */
interface Held {
  app: App
  clock: TestClock
  dataFolder: string
  now(): number
  /** Closes the engine, and opens the bundle again on the same data folder. `between` is done while it is closed. */
  reopen(between?: () => void | Promise<void>): Promise<void>
}

/** Builds a project of the tests and opens it, in the mode `test`. */
async function heldApp(t: TestContext, name: string): Promise<Held> {
  const project = copyOf(t, name)
  const built = await buildProject(project, { for: 'dev', out: join(project, 'bundle') })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error').map((one) => `${one.code} ${one.message}`),
    [],
  )
  const dataFolder = join(built.bundleFolder, '..', 'data')
  const { clock, moves } = testClock()
  let engine = createEngine({ port: 0, makers: { clock: () => clock } })
  const open = async (): Promise<App> => {
    testSecrets(dataFolder, built.description, {})
    return engine.open(built.bundleFolder, { dataFolder, mode: 'test', address: '*' })
  }
  const held: Held = {
    app: await open(),
    clock: moves,
    dataFolder,
    now: () => clock.now(),
    async reopen(between) {
      await engine.close()
      await between?.()
      engine = createEngine({ port: 0, makers: { clock: () => clock } })
      held.app = await open()
    },
  }
  closing(t, () => engine.close())
  return held
}

/** Every file of the archive under the folder of the backups, by its path from there. */
function archiveFiles(dataFolder: string): Map<string, Buffer> {
  const folder = join(dataFolder, 'backups')
  const found = new Map<string, Buffer>()
  const walk = (path: string): void => {
    const full = join(folder, path)
    if (statSync(full).isDirectory()) for (const name of readdirSync(full)) walk(join(path, name))
    else found.set(path, readFileSync(full))
  }
  if (existsSync(folder)) for (const name of readdirSync(folder)) if (name.startsWith('archive')) walk(name)
  return found
}

/** The data files of a folder as they stand, by their paths from it: the shared file and each tenant's, with their logs. */
function dataFiles(dataFolder: string, under = ''): Map<string, Buffer> {
  const found = new Map<string, Buffer>()
  for (const entry of readdirSync(join(dataFolder, under), { withFileTypes: true })) {
    const path = under ? join(under, entry.name) : entry.name
    if (entry.isDirectory()) {
      if (path === 'tenants' || (path.startsWith('tenants') && entry.name !== '.tmp'))
        for (const [one, bytes] of dataFiles(dataFolder, path)) found.set(one, bytes)
    } else if (/\.db(-wal)?$/.test(entry.name)) found.set(path, readFileSync(join(dataFolder, path)))
  }
  return found
}

interface Killed {
  data: Map<string, Buffer>
  archive: Map<string, Buffer>
}

/** What a program killed now leaves: its data files and the files of its archive, as they stand. */
const killedNow = (dataFolder: string): Killed => ({ data: dataFiles(dataFolder), archive: archiveFiles(dataFolder) })

/** Puts a closed folder back as a killed program left it: its data files, and the files of its archive given. */
async function asKilled(dataFolder: string, killed: Killed, archive = killed.archive): Promise<void> {
  for (let tries = 0; tries < 250 && readdirSync(dataFolder).some((name) => name.endsWith('-shm')); tries++)
    await new Promise((done) => setTimeout(done, 20))
  for (const [path] of dataFiles(dataFolder))
    rmSync(join(dataFolder, path), { force: true, maxRetries: 20, retryDelay: 50 })
  for (const [path, bytes] of killed.data) {
    rmSync(join(dataFolder, `${path.replace(/-wal$/, '')}-shm`), { force: true })
    mkdirSync(dirname(join(dataFolder, path)), { recursive: true })
    writeFileSync(join(dataFolder, path), bytes)
  }
  const folder = join(dataFolder, 'backups')
  for (const name of readdirSync(folder))
    if (name.startsWith('archive')) rmSync(join(folder, name), { recursive: true, force: true })
  for (const [path, bytes] of archive) {
    mkdirSync(dirname(join(folder, path)), { recursive: true })
    writeFileSync(join(folder, path), bytes)
  }
}

/** The backups that the folder of the backups holds. */
const backupsIn = (dataFolder: string): string[] =>
  readdirSync(join(dataFolder, 'backups')).filter((name) => name !== 'archive' && !name.startsWith('.'))

/** What the list of the archive names: its parts, the backups it rests on, and its gaps. */
interface Listed {
  generation: number
  parts: { name: string; from: number; to: number }[]
  backups: { name: string; n: number; at: number }[]
  gaps?: object[]
}

/** The list of the archive as it stands: the copy of the higher generation. */
function listOf(dataFolder: string): Listed {
  let newest: Listed = { generation: -1, parts: [], backups: [] }
  for (const name of ['list-a.json', 'list-b.json']) {
    const path = join(dataFolder, 'backups', 'archive', name)
    if (!existsSync(path)) continue
    const read = JSON.parse(readFileSync(path, 'utf8'))
    if (read.generation > newest.generation) newest = read
  }
  return newest
}

/** Waits a little while a condition does not hold yet. */
async function until(holds: () => boolean): Promise<void> {
  for (let tries = 0; tries < 200 && !holds(); tries++) await new Promise((done) => setTimeout(done, 25))
}

/** The fingerprint of every row of the archived app as it stands: the notes, the teams and the tasks of each. */
async function printOf(app: App): Promise<string> {
  const read = async (plan: object): Promise<Record<string, unknown>[]> => {
    const rows: unknown = await app.read({ ...plan, sort: [{ by: 'id' }] }, system)
    return Array.isArray(rows) ? rows : []
  }
  const teams = await read({ from: 'teams' })
  const tasks: Record<string, unknown> = {}
  for (const team of teams) tasks[String(team.id)] = await read({ from: 'tasks', of: team.id })
  return createHash('sha256')
    .update(JSON.stringify({ teams, notes: await read({ from: 'notes' }), tasks }))
    .digest('hex')
}

/** One minute of writes of the archived app: a note of the shared file, and a task in the file of each team. */
async function minute(held: Held, teams: string[], m: number): Promise<void> {
  held.clock.advance('1 minute')
  await held.app.call('writeNote', { title: `note ${m}`, secret: `the secret of minute ${m}` }, system)
  for (const team of teams) await held.app.call('writeTask', { team, title: `task ${m}` }, system)
}

/** The archived app with two teams, each with a file of its own, and a backup to rest on. */
async function archivedWithTeams(t: TestContext): Promise<{ held: Held; teams: string[] }> {
  const held = await heldApp(t, 'archived')
  const teams: string[] = []
  for (const name of ['north', 'south']) teams.push(String(await held.app.call('addTeam', { name }, system)))
  await command(held.app, held.dataFolder, 'data', { what: 'backup' })
  return { held, teams }
}

const momentOf = (at: number): string => new Date(at).toISOString()

/** A restore to a moment either reaches exactly the rows of that moment, or is refused with T0009, naming a gap. */
async function reachedOrRefused(held: Held, at: number, print: string): Promise<void> {
  try {
    await command(held.app, held.dataFolder, 'data', { what: 'restore', at: momentOf(at) })
  } catch (error) {
    assert.equal(Reflect.get(Object(error), 'code'), 'T0009', String(error))
    assert.match(String(Reflect.get(Object(error), 'message')), /gap/)
    return
  }
  assert.equal(await printOf(held.app), print, 'the restore reached the rows of that moment, or was refused')
}

test('[45-1] writes made just before the app is closed reach the archive: the next start finds no gap and a restore reaches them', async (t) => {
  const { held, teams } = await archivedWithTeams(t)
  await minute(held, teams, 1)
  held.clock.advance('1 minute')
  await Promise.all(
    Array.from({ length: 20 }, (_, m) =>
      held.app.call('writeNote', { title: `last ${m}`, secret: `the secret of ${m}` }, system),
    ),
  )
  const end = held.now()
  const print = await printOf(held.app)
  const backups = backupsIn(held.dataFolder).length
  await held.reopen()
  await until(() => !existsSync(join(held.dataFolder, 'backups', 'archive', 'open.part')))
  assert.deepEqual(listOf(held.dataFolder).gaps ?? [], [], 'a close is no stop: it leaves no gap')
  assert.equal(backupsIn(held.dataFolder).length, backups, 'no backup is owed')
  await command(held.app, held.dataFolder, 'data', { what: 'restore', at: momentOf(end) })
  assert.equal(await printOf(held.app), print)
})

test('[45-1] a part that a kill caught after the list named it and before its file that waits was removed is not sent twice, and a restore over it reaches its moment', async (t) => {
  const { held, teams } = await archivedWithTeams(t)
  for (let m = 1; m <= 10; m++) await minute(held, teams, m)
  await until(() => listOf(held.dataFolder).parts.length > 0)
  const end = held.now()
  const print = await printOf(held.app)
  const killed = killedNow(held.dataFolder)
  const last = listOf(held.dataFolder).parts.at(-1)
  assert.ok(last, 'a part was sent')
  const bytes = killed.archive.get(join('archive', last.name))
  assert.ok(bytes)
  killed.archive.set(join('archive', `sending-${last.name}`), bytes)
  await held.reopen(() => asKilled(held.dataFolder, killed))
  await until(() => !readdirSync(join(held.dataFolder, 'backups', 'archive')).some((one) => one.startsWith('sending-')))
  const named = listOf(held.dataFolder).parts.filter((one) => one.from === last.from)
  await minute(held, teams, 11)
  await command(held.app, held.dataFolder, 'data', { what: 'restore', at: momentOf(end) })
  assert.equal(await printOf(held.app), print)
  assert.equal(named.length, 1, 'the part is listed once')
})

test('[45-1] a part that a kill caught after it was put in its place and before the list named it is sent once', async (t) => {
  const { held, teams } = await archivedWithTeams(t)
  let before = killedNow(held.dataFolder)
  let m = 0
  // The moment a part is sent: the archive as it stood just before, and as it stands now.
  while (listOf(held.dataFolder).parts.length === 0 && m < 40) {
    before = killedNow(held.dataFolder)
    await minute(held, teams, ++m)
    await until(() => listOf(held.dataFolder).parts.length > 0)
  }
  const part = listOf(held.dataFolder).parts[0]
  assert.ok(part, 'a part was sent')
  const end = held.now()
  const print = await printOf(held.app)
  const killed = killedNow(held.dataFolder)
  // The lists as they were before; the part in its place, and its file that waits.
  const archive = new Map(killed.archive)
  for (const name of ['list-a.json', 'list-b.json']) {
    const was = before.archive.get(join('archive', name))
    if (was) archive.set(join('archive', name), was)
    else archive.delete(join('archive', name))
  }
  const bytes = killed.archive.get(join('archive', part.name))
  assert.ok(bytes)
  archive.set(join('archive', `sending-${part.name}`), bytes)
  await held.reopen(() => asKilled(held.dataFolder, killed, archive))
  await until(() => !readdirSync(join(held.dataFolder, 'backups', 'archive')).some((one) => one.startsWith('sending-')))
  assert.equal(listOf(held.dataFolder).parts.filter((one) => one.from === part.from).length, 1, 'listed once')
  await minute(held, teams, ++m)
  await command(held.app, held.dataFolder, 'data', { what: 'restore', at: momentOf(end) })
  assert.equal(await printOf(held.app), print)
})

test('[45-1] a part that a kill cut in the middle of an append is sent with its whole changes, and a restore reaches them', async (t) => {
  const { held, teams } = await archivedWithTeams(t)
  for (let m = 1; m <= 3; m++) await minute(held, teams, m)
  const end = held.now()
  const print = await printOf(held.app)
  const killed = killedNow(held.dataFolder)
  const open = killed.archive.get(join('archive', 'open.part'))
  assert.ok(open, 'a part is open')
  // The head of one more change, cut off by the kill: its count of bytes, and the first of them.
  const cut = Buffer.alloc(4)
  cut.writeUInt32BE(40)
  killed.archive.set(join('archive', 'open.part'), Buffer.concat([open, cut, Buffer.from('{"n":9')]))
  await held.reopen(() => asKilled(held.dataFolder, killed))
  await until(() => !existsSync(join(held.dataFolder, 'backups', 'archive', 'open.part')))
  await minute(held, teams, 4)
  await command(held.app, held.dataFolder, 'data', { what: 'restore', at: momentOf(end) })
  assert.equal(await printOf(held.app), print)
})

test('[45-1] after a restore to a moment, a write that a kill caught before the archive is found as a gap', async (t) => {
  const { held, teams } = await archivedWithTeams(t)
  for (let m = 1; m <= 2; m++) await minute(held, teams, m)
  const middle = held.now()
  for (let m = 3; m <= 4; m++) await minute(held, teams, m)
  held.clock.advance('1 minute')
  await command(held.app, held.dataFolder, 'data', { what: 'restore', at: momentOf(middle) })
  await until(() => !readdirSync(join(held.dataFolder, 'backups', 'archive')).some((one) => one.startsWith('sending-')))
  const archived = archiveFiles(held.dataFolder)
  await minute(held, teams, 5)
  const lost = held.now()
  const print = await printOf(held.app)
  const killed = killedNow(held.dataFolder)
  held.clock.advance('1 minute')
  await held.reopen(() => asKilled(held.dataFolder, killed, archived))
  await until(() => (listOf(held.dataFolder).gaps ?? []).length > 0)
  await reachedOrRefused(held, lost, print)
})

test('[45-1] writes of the files of tenants that a kill caught before the archive are found as a gap', async (t) => {
  const { held, teams } = await archivedWithTeams(t)
  for (let m = 1; m <= 2; m++) await minute(held, teams, m)
  // The note of minute 3 reaches the archive; the tasks of the two teams, each a write of a tenant's file, never do.
  held.clock.advance('1 minute')
  await held.app.call('writeNote', { title: 'note 3', secret: 'the secret of minute 3' }, system)
  await new Promise((done) => setTimeout(done, 100))
  const archived = archiveFiles(held.dataFolder)
  for (const team of teams) await held.app.call('writeTask', { team, title: 'task 3' }, system)
  const lost = held.now()
  const print = await printOf(held.app)
  const n = held.app.at().n
  const killed = killedNow(held.dataFolder)
  held.clock.advance('1 minute')
  await held.reopen(() => asKilled(held.dataFolder, killed, archived))
  await until(() => (listOf(held.dataFolder).gaps ?? []).length > 0)
  const gaps = (listOf(held.dataFolder).gaps ?? []).map((one) => Reflect.get(one, 'to'))
  await reachedOrRefused(held, lost, print)
  assert.deepEqual(gaps, [n], 'the gap names the last write the data held')
})

test('[45-1] a first write that a kill caught before an archive that held nothing yet is found as a gap', async (t) => {
  const held = await heldApp(t, 'archived')
  await command(held.app, held.dataFolder, 'data', { what: 'backup' })
  await until(() => !readdirSync(join(held.dataFolder, 'backups', 'archive')).some((one) => one.startsWith('sending-')))
  const archived = archiveFiles(held.dataFolder)
  held.clock.advance('1 minute')
  await held.app.call('addTeam', { name: 'north' }, system)
  const lost = held.now()
  const print = await printOf(held.app)
  const killed = killedNow(held.dataFolder)
  held.clock.advance('1 minute')
  await held.reopen(() => asKilled(held.dataFolder, killed, archived))
  await until(() => (listOf(held.dataFolder).gaps ?? []).length > 0)
  await reachedOrRefused(held, lost, print)
})

test('[45-1] a part that a kill caught after it was closed and before it was sent is sent at the next start, once', async (t) => {
  const { held, teams } = await archivedWithTeams(t)
  for (let m = 1; m <= 3; m++) await minute(held, teams, m)
  const end = held.now()
  const print = await printOf(held.app)
  const killed = killedNow(held.dataFolder)
  const open = killed.archive.get(join('archive', 'open.part'))
  assert.ok(open, 'a part is open')
  // The part was closed into the name of one that waits, and the kill came before it was sent.
  killed.archive.delete(join('archive', 'open.part'))
  killed.archive.set(join('archive', 'sending-1-1.changes'), open)
  const listed = listOf(held.dataFolder).parts.length
  await held.reopen(() => asKilled(held.dataFolder, killed))
  await until(() => !readdirSync(join(held.dataFolder, 'backups', 'archive')).some((one) => one.startsWith('sending-')))
  assert.equal(listOf(held.dataFolder).parts.length, listed + 1, 'the part that waited is sent, once')
  assert.deepEqual(listOf(held.dataFolder).gaps ?? [], [], 'nothing was lost')
  await minute(held, teams, 4)
  await command(held.app, held.dataFolder, 'data', { what: 'restore', at: momentOf(end) })
  assert.equal(await printOf(held.app), print)
})

test('[45-1] a moment after the backup that a gap took is reached, with no other restore before it', async (t) => {
  const { held, teams } = await archivedWithTeams(t)
  for (let m = 1; m <= 2; m++) await minute(held, teams, m)
  const archived = archiveFiles(held.dataFolder)
  await minute(held, teams, 3)
  const backups = backupsIn(held.dataFolder).length
  const killed = killedNow(held.dataFolder)
  await held.reopen(() => asKilled(held.dataFolder, killed, archived))
  const rested = (): number => listOf(held.dataFolder).backups.length
  const listed = rested()
  await until(() => rested() > listed)
  assert.equal(backupsIn(held.dataFolder).length, backups + 1, 'a backup is taken at once')
  await minute(held, teams, 4)
  const after = held.now()
  const print = await printOf(held.app)
  await minute(held, teams, 5)
  await command(held.app, held.dataFolder, 'data', { what: 'restore', at: momentOf(after) })
  assert.equal(await printOf(held.app), print, 'a moment after the backup the gap took')
})

test('[45-1] an app with an archive and no reader keeps no change and no running fingerprint in the file of a tenant either', async (t) => {
  const { held, teams } = await archivedWithTeams(t)
  for (let m = 1; m <= 3; m++) await minute(held, teams, m)
  await held.reopen(() => {
    const files = [...dataFiles(held.dataFolder).keys()].filter((path) => path.endsWith('.db'))
    assert.ok(files.length >= 3, 'the shared file and a file for each team')
    for (const path of files) {
      const db = new DatabaseSync(join(held.dataFolder, path), { readOnly: true })
      try {
        const names = db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
          .all()
          .map((one) => String(one.name))
        if (names.includes('_t_changes'))
          assert.equal(
            Number(db.prepare('SELECT count(*) AS n FROM _t_changes').get()?.n),
            0,
            `${path} keeps no change`,
          )
        if (names.includes('_t_here'))
          assert.equal(db.prepare("SELECT 1 FROM _t_here WHERE key = 'sum'").get(), undefined, `${path} has no sum`)
      } finally {
        db.close()
      }
    }
  })
})

test('[45-1] a writer with a near reader keeps its changes for the reader beside its archive: the reader holds what the writer holds, and a restore to a moment reaches it on both', async (t) => {
  const pair = await pairOf(t, await deskBundle(t), dataPlace(t))
  const { writer, reader } = pair
  const beats = async (what: string, holds: () => boolean): Promise<void> => {
    for (let i = 0; i < 200; i++) {
      if (holds()) return
      await pair.beat()
    }
    assert.fail(`never: ${what}`)
  }
  await beats('the reader is current', () => reader.app.at().current)
  const [north, south] = [await addTeam(writer.app, 'North'), await addTeam(writer.app, 'South')]
  await command(writer.app, writer.dataFolder, 'data', { what: 'backup' })
  /** The orders of both teams on one machine, and the teams. */
  const rowsOf = async (app: App): Promise<string> =>
    JSON.stringify({
      teams: await app.read({ from: 'teams', sort: [{ by: 'id' }] }, system),
      north: await ordersOf(app, north),
      south: await ordersOf(app, south),
    })
  for (let m = 1; m <= 3; m++) {
    pair.clock.advance('1 minute')
    await addOrder(writer.app, north, `north ${m}`)
    await addOrder(writer.app, south, `south ${m}`)
  }
  // A moment half a minute after the last write of minute 3, and half a minute before the first of minute 4.
  const middle = new Date(String((await ordersOf(writer.app, south)).at(-1)?.createdAt)).getTime() + 30_000
  const print = await rowsOf(writer.app)
  for (let m = 4; m <= 6; m++) {
    pair.clock.advance('1 minute')
    await addOrder(writer.app, north, `north ${m}`)
  }
  await beats('the reader holds every write', () => reader.app.at().n === writer.app.at().n)
  assert.equal(
    reader.app.at().sum,
    writer.app.at().sum,
    'the reader holds the writes of the writer, by their fingerprint',
  )
  assert.equal(await rowsOf(reader.app), await rowsOf(writer.app))
  const db = new DatabaseSync(join(writer.dataFolder, 'data.db'), { readOnly: true })
  try {
    const kept = Number(db.prepare('SELECT count(*) AS n FROM _t_changes').get()?.n)
    assert.ok(kept > 0, 'the writer keeps its changes for its reader')
  } finally {
    db.close()
  }
  await command(writer.app, writer.dataFolder, 'data', { what: 'restore', at: momentOf(middle) })
  assert.equal(await rowsOf(writer.app), print, 'the writer stands at the moment')
  await beats('the reader holds what was put back', () => reader.app.at().n === writer.app.at().n)
  await beats('the reader holds the rows of the writer', () => reader.app.at().sum === writer.app.at().sum)
  assert.equal(await rowsOf(reader.app), print, 'the reader stands at the moment too')
})

test(
  '[45-1] a reader that takes over keeps an archive of its own from then on: a restore to a moment reaches what it wrote',
  readersHeld,
  async (t) => {
    const desk = await deskOf(t)
    const { app } = desk
    const near = await app.reader()
    await current(app, near)
    const north = await addTeam(app, 'North')
    await addOrder(app, north, 'by the first writer')
    await level(app, near)
    await app.kill()
    await beat(near, 7)
    await near.takeOver()
    const folder = readerFolder(desk, 2)
    await command(near, folder, 'data', { what: 'backup' })
    for (let m = 1; m <= 3; m++) {
      near.clock.advance('1 minute')
      await addOrder(near, north, `by the new writer ${m}`)
    }
    const middle = new Date(String((await ordersOf(near, north)).at(-1)?.createdAt)).getTime() + 30_000
    const print = await titlesOf(near, north)
    near.clock.advance('1 minute')
    await addOrder(near, north, 'after the moment')
    await command(near, folder, 'data', { what: 'restore', at: momentOf(middle) })
    assert.deepEqual(await titlesOf(near, north), print)
  },
)

test('[45-1] after the file of one tenant was put back from a backup, a restore to a later moment reaches its rows, or is refused', async (t) => {
  const { held, teams } = await archivedWithTeams(t)
  await minute(held, teams, 1)
  const backup = String(
    Reflect.get(Object(await command(held.app, held.dataFolder, 'data', { what: 'backup' })), 'file'),
  )
  for (let m = 2; m <= 3; m++) await minute(held, teams, m)
  held.clock.advance('1 minute')
  await command(held.app, held.dataFolder, 'data', { what: 'restore', file: backup, of: teams[0] })
  await minute(held, teams, 4)
  const end = held.now()
  const print = await printOf(held.app)
  await minute(held, teams, 5)
  try {
    await command(held.app, held.dataFolder, 'data', { what: 'restore', at: momentOf(end) })
  } catch (error) {
    assert.equal(Reflect.get(Object(error), 'code'), 'T0009', String(error))
    return
  }
  assert.equal(await printOf(held.app), print, 'the rows of that moment, the file that was put back among them')
})
