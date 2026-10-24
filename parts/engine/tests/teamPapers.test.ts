import assert from 'node:assert/strict'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import type { Caller } from '../../core/index.ts'
import type { App } from '../index.ts'
import type { Running } from './apps.ts'
import { codeOf, running, send, system, userOf } from './apps.ts'

/** The rows of a table of the shared data file, read beside the engine. */
function dataRows(dataFolder: string, table: string): Record<string, unknown>[] {
  const data = new DatabaseSync(join(dataFolder, 'data.db'), { readOnly: true })
  try {
    return data.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all()
  } finally {
    data.close()
  }
}

/** Sends a command to the admin channel of an app, as a command of this computer does, and answers its value. */
async function did(app: App, dataFolder: string, name: string, args: object): Promise<Record<string, unknown>> {
  const { token, port } = JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8'))
  const answered = await send(app, `http://localhost:${port}/_t/admin/${name}`, {
    body: JSON.stringify({ args }),
    headers: { authorization: `Bearer ${String(token)}` },
  })
  assert.equal(answered.status, 200, JSON.stringify(answered.body))
  return Object(answered.body.value)
}

/** The place of the data file of a team. */
const fileOf = (folder: string, team: string): string => join(folder, 'tenants', 'teams', team.slice(-2), `${team}.db`)

/** A person with a team, and a paper of theirs in the file of that team: the row holds one file, and its kept version another. */
async function withPaper(t: test.TestContext) {
  const run = await running(t, { project: 'teamPapers' })
  const ada = userOf(String(Object(await run.app.call('addUser', { email: 'ada@example.com' }, { as: system })).id))
  const north = String(Object(await run.app.call('addTeam', { name: 'North' }, { as: system })).id)
  const put = async (words: string): Promise<string> => String(await run.app.call('putText', { words }, { as: ada }))
  const [first, second] = [await put('the first paper'), await put('the second paper')]
  const row = String(await run.app.call('keepPaper', { team: north, title: 'kept', paper: first }, { as: ada }))
  await run.app.call('swapPaper', { team: north, row, paper: second }, { as: ada })
  return { run, ada, north, first, second, row }
}

const holdsOf = (dataFolder: string, file: string): Record<string, unknown>[] =>
  dataRows(dataFolder, '_t_holds').filter((one) => one.file === file)

/** Opens the app again on its folder, as an engine that was stopped opens it: no file of a tenant is open then. */
async function again(run: Running): Promise<App> {
  await run.app.close()
  return run.engine.open(run.bundle.folder, { dataFolder: run.dataFolder, mode: 'test' })
}

test('[50-8@7a] a kept earlier version of a row of a tenant holds its file with the tenant, and who may read that history downloads it', async (t) => {
  const { run, ada, north, first, second } = await withPaper(t)
  const [kept] = holdsOf(run.dataFolder, first)
  assert.equal(kept?.of, north)
  assert.notEqual(kept?.keptAt, '')
  // The person reads the history of their row, and downloads the file of the version as the file of the row.
  assert.equal(await run.app.call('readPaper', { id: first }, { as: ada }), 'the first paper')
  assert.equal(await run.app.call('readPaper', { id: second }, { as: ada }), 'the second paper')
  // Another person may read neither the row nor its history.
  const bob: Caller = userOf(
    String(Object(await run.app.call('addUser', { email: 'bob@example.com' }, { as: system })).id),
  )
  assert.equal(await codeOf(run.app.call('readPaper', { id: first }, { as: bob })), 'T0001')
})

test("[50-4@7a] a person's removal reaches a data file of a tenant that nobody opens, and answers once the pass has ended: their rows there are gone, with every file that a row or a kept version of theirs held", async (t) => {
  const { run, north, first, second } = await withPaper(t)
  const app = await again(run)
  const removed = await did(app, run.dataFolder, 'data', {
    what: 'user',
    do: 'remove',
    id: String(Object(dataRows(run.dataFolder, 'users')[0]).id),
    yes: true,
  })
  assert.equal(removed.removed, true)
  // Answered once the pass has ended: the row of the team's file is gone already, and so are the files.
  assert.deepEqual(await app.call('papersOf', { team: north }, { as: system }), [])
  for (const file of [first, second]) {
    assert.deepEqual(holdsOf(run.dataFolder, file), [], file)
    assert.equal(
      dataRows(run.dataFolder, '_t_files').some((one) => one.id === file),
      false,
      file,
    )
  }
  await app.close()
})

test('[50-8@7a] one tenant put back from a backup holds again the files its rows held then, and a file that its rows let go of since is loose', async (t) => {
  const { run, ada, north, first, second, row } = await withPaper(t)
  const backup = await did(run.app, run.dataFolder, 'data', { what: 'backup' })
  // After the backup the row holds a third file, and the second is loose.
  const third = String(await run.app.call('putText', { words: 'the third paper' }, { as: ada }))
  await run.app.call('swapPaper', { team: north, row, paper: third }, { as: ada })
  assert.equal(holdsOf(run.dataFolder, second).filter((one) => one.keptAt === '').length, 0)
  // The team is put back alone: its row holds the second file again, and no row holds the third.
  await did(run.app, run.dataFolder, 'data', { what: 'restore', file: backup.file, of: north })
  const rows = dataRows(run.dataFolder, '_t_files')
  const fileRow = (id: string) => rows.find((one) => one.id === id)
  assert.deepEqual(
    holdsOf(run.dataFolder, second).map((one) => [one.keptAt, one.of]),
    [['', north]],
  )
  assert.equal(fileRow(second)?.looseAt ?? null, null)
  assert.equal(holdsOf(run.dataFolder, first).length, 1)
  assert.deepEqual(holdsOf(run.dataFolder, third), [])
  assert.notEqual(fileRow(third)?.looseAt ?? null, null)
})

test('[50-8@7a] removing a tenant with a stop between the write and the removal of its file leaves nothing behind after the next start', async (t) => {
  const { run, north } = await withPaper(t)
  const place = fileOf(run.dataFolder, north)
  assert.equal(existsSync(place), true)
  // The file of the team as it was before the team was removed.
  await run.app.close()
  const kept = join(run.dataFolder, '..', 'kept.db')
  copyFileSync(place, kept)
  const app = await run.engine.open(run.bundle.folder, { dataFolder: run.dataFolder, mode: 'test' })
  await app.call('dropTeam', { team: north }, { as: system })
  // The file is removed once the write is committed.
  for (let i = 0; i < 500 && existsSync(place); i++) await new Promise((done) => setTimeout(done, 10))
  assert.equal(existsSync(place), false)
  // A stop left the file where it lay: the write that removed the team was committed, and the file was not removed.
  await app.close()
  mkdirSync(dirname(place), { recursive: true })
  copyFileSync(kept, place)
  const next = await run.engine.open(run.bundle.folder, { dataFolder: run.dataFolder, mode: 'test' })
  // The start removes the file of a tenant that is gone, and no hold names the tenant.
  assert.equal(existsSync(place), false)
  assert.equal(
    dataRows(run.dataFolder, '_t_holds').some((one) => one.of === north),
    false,
  )
  await next.close()
})
