import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
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

/** Every file of the archive under the folder of the backups, by its path from there: what a killed program left. */
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

/** Puts the files of the archive back as a killed program left them: what was written since is gone. */
function archiveAsLeft(dataFolder: string, left: Map<string, Buffer>): void {
  const folder = join(dataFolder, 'backups')
  for (const name of readdirSync(folder))
    if (name.startsWith('archive')) rmSync(join(folder, name), { recursive: true, force: true })
  for (const [path, bytes] of left) {
    mkdirSync(dirname(join(folder, path)), { recursive: true })
    writeFileSync(join(folder, path), bytes)
  }
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

/** What a program killed now leaves: its data files and the files of its archive, as they stand. */
const killedNow = (dataFolder: string): { data: Map<string, Buffer>; archive: Map<string, Buffer> } => ({
  data: dataFiles(dataFolder),
  archive: archiveFiles(dataFolder),
})

/**
 * Puts a closed folder back as a killed program left it: its data files, and the files of its archive, by
 * default those of the moment of the kill. Nothing that the close wrote after is left.
 */
async function asKilled(
  dataFolder: string,
  killed: { data: Map<string, Buffer>; archive: Map<string, Buffer> },
  archive = killed.archive,
): Promise<void> {
  // A data file is given up a moment after the close that let it go: SQLite then takes away what it kept beside it.
  for (let tries = 0; tries < 250 && readdirSync(dataFolder).some((name) => name.endsWith('-shm')); tries++)
    await new Promise((done) => setTimeout(done, 20))
  for (const [path] of dataFiles(dataFolder))
    rmSync(join(dataFolder, path), { force: true, maxRetries: 20, retryDelay: 50 })
  for (const [path, bytes] of killed.data) {
    rmSync(join(dataFolder, `${path.replace(/-wal$/, '')}-shm`), { force: true })
    mkdirSync(dirname(join(dataFolder, path)), { recursive: true })
    writeFileSync(join(dataFolder, path), bytes)
  }
  archiveAsLeft(dataFolder, archive)
}

/** The backups that the folder of the backups holds. */
const backupsIn = (dataFolder: string): string[] =>
  readdirSync(join(dataFolder, 'backups')).filter((name) => name !== 'archive' && !name.startsWith('.'))

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

test('[45-1] an app with an archive and no reader keeps no change in its data file and works no running fingerprint out', async (t) => {
  const { held, teams } = await archivedWithTeams(t)
  for (let m = 1; m <= 5; m++) await minute(held, teams, m)
  await held.reopen(() => {
    const db = new DatabaseSync(join(held.dataFolder, 'data.db'), { readOnly: true })
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()
      const names = tables.map((one) => String(one.name))
      const kept = names.includes('_t_changes')
        ? Number(db.prepare('SELECT count(*) AS n FROM _t_changes').get()?.n)
        : 0
      assert.equal(kept, 0, 'no change is kept in the data file')
      assert.equal(db.prepare("SELECT 1 FROM _t_here WHERE key = 'sum'").get(), undefined, 'no running fingerprint')
    } finally {
      db.close()
    }
  })
})

test('[45-1] a part of the archive that a killed program left open is sent at the next start: a restore reaches a change that only that part held', async (t) => {
  const { held, teams } = await archivedWithTeams(t)
  for (let m = 1; m <= 10; m++) await minute(held, teams, m)
  const end = held.now()
  const print = await printOf(held.app)
  // The archive writes its open part beside each commit as it goes: on a busy computer the part stands a moment
  // after the last call answered, and the kill is taken once it does.
  const open = join(held.dataFolder, 'archive', 'open.part')
  for (const until = performance.now() + 10_000; !existsSync(open) && performance.now() < until; )
    await new Promise((done) => setTimeout(done, 20))
  const killed = killedNow(held.dataFolder)
  assert.ok(killed.archive.has(join('archive', 'open.part')), 'the kill left a part open')
  const sent = (): number =>
    existsSync(join(held.dataFolder, 'backups', 'archive'))
      ? readdirSync(join(held.dataFolder, 'backups', 'archive')).filter((name) => /^\d+-\d+.*\.changes$/.test(name))
          .length
      : 0
  const before = [...killed.archive.keys()].filter((path) => path.endsWith('.changes'))
  await held.reopen(() => asKilled(held.dataFolder, killed))
  for (let tries = 0; tries < 200 && sent() <= before.length; tries++) await new Promise((done) => setTimeout(done, 25))
  assert.equal(sent(), before.length + 1, 'the part that was left open is sent')
  assert.equal(existsSync(join(held.dataFolder, 'backups', 'archive', 'open.part')), false)
  for (let m = 11; m <= 12; m++) await minute(held, teams, m)
  await command(held.app, held.dataFolder, 'data', { what: 'restore', at: momentOf(end) })
  assert.equal(await printOf(held.app), print, 'the rows of the last moment before the kill')
})

test('[45-1] writes that never reached the archive are a gap: a backup is taken at once, a restore to a moment in the gap is refused and names it, and the moments before it and after that backup are reached', async (t) => {
  const { held, teams } = await archivedWithTeams(t)
  for (let m = 1; m <= 2; m++) await minute(held, teams, m)
  const before = held.now()
  const printBefore = await printOf(held.app)
  // The writes of minute 3 reach the archive; those of minutes 4 and 5 never do.
  await minute(held, teams, 3)
  const archived = archiveFiles(held.dataFolder)
  await minute(held, teams, 4)
  const inGap = held.now()
  await minute(held, teams, 5)
  const backups = backupsIn(held.dataFolder).length
  const killed = killedNow(held.dataFolder)
  await held.reopen(() => asKilled(held.dataFolder, killed, archived))
  for (let tries = 0; tries < 200 && backupsIn(held.dataFolder).length === backups; tries++)
    await new Promise((done) => setTimeout(done, 25))
  assert.equal(backupsIn(held.dataFolder).length, backups + 1, 'a backup is taken at once')
  await assert.rejects(
    command(held.app, held.dataFolder, 'data', { what: 'restore', at: momentOf(inGap), dry: true }),
    (error) => {
      assert.equal(Reflect.get(Object(error), 'code'), 'T0009')
      assert.match(String(Reflect.get(Object(error), 'message')), /gap/)
      return true
    },
  )
  await command(held.app, held.dataFolder, 'data', { what: 'restore', at: momentOf(before) })
  assert.equal(await printOf(held.app), printBefore, 'a moment before the gap')
  for (let m = 6; m <= 7; m++) await minute(held, teams, m)
  const after = held.now()
  const printAfter = await printOf(held.app)
  await minute(held, teams, 8)
  await command(held.app, held.dataFolder, 'data', { what: 'restore', at: momentOf(after) })
  assert.equal(await printOf(held.app), printAfter, 'a moment after the backup the gap took')
})

test('[45-17] an undo that reaches into a gap of the archive is refused and names it', async (t) => {
  const held = await heldApp(t, 'undone')
  const ids: string[] = []
  for (const title of ['first', 'second', 'third'])
    ids.push(String(Reflect.get(Object(await held.app.call('addNote', { title }, system)), 'id')))
  const archived = archiveFiles(held.dataFolder)
  const started = await held.app.start('tidy', { rename: ids[0], finish: ids[1], drop: ids[2] }, system)
  assert.ok('run' in started, 'the start was not dropped')
  await held.app.runs.wait(started.run)
  const killed = killedNow(held.dataFolder)
  await held.reopen(() => asKilled(held.dataFolder, killed, archived))
  await assert.rejects(held.app.call('undoRun', { run: started.run }, system), (error) => {
    assert.equal(Reflect.get(Object(error), 'code'), 'T0009')
    assert.match(String(Reflect.get(Object(error), 'message')), /gap/)
    return true
  })
})

/** The heads of the changes of a part as its bytes hold them: each change is its head as JSON, then its record. */
function headsIn(bytes: Buffer): { head: Record<string, unknown>; record: number }[] {
  const heads: { head: Record<string, unknown>; record: number }[] = []
  for (let at = 0; at < bytes.length; ) {
    const size = bytes.readUInt32BE(at)
    const head = JSON.parse(bytes.subarray(at + 4, at + 4 + size).toString('utf8'))
    const record = bytes.readUInt32BE(at + 4 + size)
    heads.push({ head, record })
    at += 8 + size + record
  }
  return heads
}

test('[45-1] a part of the archive holds one copy of a change: its record, and beside it only what undo needs of each row and the record does not give', async (t) => {
  const { held, teams } = await archivedWithTeams(t)
  for (let m = 1; m <= 5; m++) await minute(held, teams, m)
  const folder = join(held.dataFolder, 'backups', 'archive')
  const heads = readdirSync(folder)
    .filter((name) => name === 'open.part' || name.endsWith('.changes'))
    .flatMap((name) => headsIn(readFileSync(join(folder, name))))
  assert.ok(heads.length >= 15, 'every write of the five minutes is there')
  const kinds = new Set<string>()
  for (const { head, record } of heads) {
    assert.ok(record > 0, `the change ${String(head.n)} holds its record`)
    assert.equal(head.raw, undefined, 'no raw text: the record holds what it did')
    const rows: unknown = head.rows
    for (const one of Array.isArray(rows) ? rows : []) {
      const row = Object(one)
      kinds.add(row.kind)
      assert.equal(String(row.table).startsWith('_t_'), false, `no row of a table of the engine: ${row.table}`)
      if (row.kind === 'removed') {
        assert.ok(Object.keys(row.row).length > 1, 'a removed row as it was, to be put back')
        continue
      }
      assert.deepEqual(Object.keys(row.row), ['id'], `the ${row.kind} row by its id alone, as the record gives it`)
      if (row.kind === 'changed') {
        assert.ok(typeof row.before === 'object' && row.before !== null, 'a changed row with what it held before')
        assert.ok(Array.isArray(row.columns) && row.columns.length > 0, 'and the columns that were set')
      } else assert.equal(row.before, undefined)
    }
  }
  assert.deepEqual([...kinds].sort(), ['added', 'changed', 'removed'])
})
