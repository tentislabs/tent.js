import assert from 'node:assert/strict'
import { cpSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runKilled } from '../../../rig/kill.ts'
import { setHere, sqliteStore } from '../../data/index.ts'
import type { App } from '../index.ts'
import { makeSecretKey, replaceSecretKey } from '../index.ts'
import { forgetSeal, sealedAt } from '../values/seal.ts'
import type { Running } from './apps.ts'
import { running, send, system } from './apps.ts'

const program = fileURLToPath(new URL('./held/replacing.ts', import.meta.url))

/** An app that keeps a data file for each team, with a key, and so many sealed notes in the file of each team. */
async function withTeams(t: test.TestContext, count: number, rows: number): Promise<{ run: Running; teams: string[] }> {
  const run = await running(t, { project: 'sealedTeams' })
  makeSecretKey(run.dataFolder)
  const teams: string[] = []
  for (let k = 0; k < count; k++)
    teams.push(String(Object(await run.app.call('addTeam', { name: `team ${k}` }, { as: system })).id))
  for (const [k, team] of teams.entries())
    for (let j = 0; j < rows; j++)
      await run.app.call(
        'keep',
        { team, title: `note ${String(j).padStart(4, '0')}`, note: `what team ${k} keeps in ${j}` },
        { as: system },
      )
  await run.app.close()
  return { run, teams }
}

/** The place of the data file of a team under a folder that holds the files of tenants. */
const fileOf = (folder: string, team: string): string => join(folder, 'tenants', 'teams', team.slice(-2), `${team}.db`)

/** The sealed texts of the notes of a data file, as it holds them. */
function storedNotes(path: string): string[] {
  const data = new DatabaseSync(path, { readOnly: true })
  try {
    return data
      .prepare('SELECT note FROM "vault" ORDER BY title')
      .all()
      .map((row) => String(row.note))
  } finally {
    data.close()
  }
}

/** The notes of every team, as an app that is opened on the folder reads them. */
async function notesOf(run: Running, teams: string[]): Promise<{ app: App; notes: string[][] }> {
  const app = await run.engine.open(run.bundle.folder, { dataFolder: run.dataFolder, mode: 'test' })
  const notes: string[][] = []
  for (const team of teams) {
    const rows: unknown = await app.call('kept', { team }, { as: system })
    notes.push((Array.isArray(rows) ? rows : []).map((row) => String(Object(row).note)))
  }
  return { app, notes }
}

const keyOf = (dataFolder: string): string => readFileSync(join(dataFolder, 'secret.key'), 'utf8')

test('[22-14@7a] the key of an app that keeps a data file for each tenant is replaced: every sealed value of each file still opens, the old key opens none, and the backup after it holds every file sealed again', async (t) => {
  const { run, teams } = await withTeams(t, 3, 4)
  const { dataFolder } = run
  const [oldKey, before] = [keyOf(dataFolder), teams.map((team) => storedNotes(fileOf(dataFolder, team)))]
  const done = await replaceSecretKey(dataFolder)
  // Four notes of each of three teams were sealed again, each in the file of its team.
  assert.deepEqual(done, { role: 'writer', sealed: 12, secrets: 0 })
  assert.notEqual(keyOf(dataFolder), oldKey)
  assert.deepEqual(
    readdirSync(dataFolder).filter((name) => /\.(next|again)$/.test(name)),
    [],
  )
  const after = teams.map((team) => storedNotes(fileOf(dataFolder, team)))
  for (const [k, notes] of after.entries()) {
    assert.equal(notes.length, 4)
    for (const [j, note] of notes.entries()) assert.notEqual(note, before[k][j])
  }
  const read = await notesOf(run, teams)
  assert.deepEqual(
    read.notes,
    teams.map((_, k) => Array.from({ length: 4 }, (_, j) => `what team ${k} keeps in ${j}`)),
  )
  // The backup after it holds the file of every team as it was sealed again.
  const token = String(JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8')).token)
  const port = Number(JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8')).port)
  const backup = await send(read.app, `http://localhost:${port}/_t/admin/data`, {
    body: JSON.stringify({ args: { what: 'backup' } }),
    headers: { authorization: `Bearer ${token}` },
  })
  assert.equal(backup.status, 200, JSON.stringify(backup.body))
  const folder = String(Object(backup.body.value).file)
  for (const [k, team] of teams.entries()) assert.deepEqual(storedNotes(fileOf(folder, team)), after[k])
  await read.app.close()
  // The old key opens none of the notes of a team.
  const newKey = keyOf(dataFolder)
  writeFileSync(join(dataFolder, 'secret.key'), oldKey)
  forgetSeal(dataFolder)
  assert.throws(() => sealedAt(dataFolder).seal?.open(after[0][0], 'vault.note.any'), { code: 'T0019' })
  writeFileSync(join(dataFolder, 'secret.key'), newKey)
  forgetSeal(dataFolder)
})

test('[22-14@7a] a kill between two files of tenants loses no sealed value: the next run finishes it', async (t) => {
  const { run, teams } = await withTeams(t, 30, 20)
  const { dataFolder } = run
  const before = keyOf(dataFolder)
  // The program is killed at any moment of its work, five times, and each time started again until it ends by itself.
  const ended = await runKilled(program, { times: 5, within: 1500, args: [dataFolder], wait: 120_000 })
  assert.equal(ended.kills, 5)
  for (const round of ended.ended) assert.equal(round.code, 0, round.out)
  assert.notEqual(keyOf(dataFolder), before)
  assert.deepEqual(
    readdirSync(dataFolder).filter((name) => /\.(next|again)$/.test(name)),
    [],
  )
  const read = await notesOf(run, teams)
  for (const [k, notes] of read.notes.entries())
    assert.deepEqual(
      notes,
      Array.from({ length: 20 }, (_, j) => `what team ${k} keeps in ${j}`),
    )
  await read.app.close()
})

test('[22-14@7a] on the folder of a reader of an app with files of tenants, the command stops while a value of a file of a tenant opens under the old key alone, and goes on once the reader holds the files that its writer sealed again', async (t) => {
  const { run } = await withTeams(t, 2, 2)
  const writer = run.dataFolder
  // The folder of a reader: a copy of the data and of the files of the writer, with the role of a reader.
  const reader = join(writer, '..', 'reader')
  const copied = (): void => {
    for (const name of ['data.db', 'tenants']) cpSync(join(writer, name), join(reader, name), { recursive: true })
    const store = sqliteStore()
    store.open(reader)
    setHere(store, { role: 'reader', from: 'https://writer.example' })
    store.close()
  }
  copied()
  cpSync(join(writer, 'secret.key'), join(reader, 'secret.key'))
  const oldKey = keyOf(reader)
  await replaceSecretKey(writer)
  writeFileSync(join(reader, 'secret.key.next'), keyOf(writer))
  // The files of its tenants still hold what the old key sealed: it stops, and writes nothing.
  const behind = await replaceSecretKey(reader).catch((error) => error)
  assert.equal(behind.code, 'T0013')
  assert.match(`${behind.message} ${behind.fix}`, /join its writer/)
  assert.equal(keyOf(reader), oldKey)
  // Once it holds the files as the writer sealed them, it takes the key and seals nothing itself.
  copied()
  assert.deepEqual(await replaceSecretKey(reader), { role: 'reader', sealed: 0, secrets: 0 })
  assert.equal(keyOf(reader), keyOf(writer))
})
