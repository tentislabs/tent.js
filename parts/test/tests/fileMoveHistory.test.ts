import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { TestApp } from '../index.ts'
import { appIn, fileOf, readFile } from './desks.ts'
import { until } from './many.ts'
import { copyOf } from './projects.ts'

const system = { as: 'system' } as const

/** The id of the version that an app runs. */
const running = (app: TestApp): string | undefined => app.versions().find((one) => one.running)?.id

/** The kept earlier versions of the notes in one data file, read with no engine: the body of each, by its row. */
function keptIn(file: string): string[] {
  if (!existsSync(file)) return []
  // A file that never kept a version holds no table for them.
  const holds = readFile(file, `SELECT count(*) AS "n" FROM "sqlite_master" WHERE "name" = '_t_history'`)[0]?.n === 1
  if (!holds) return []
  return readFile(file, `SELECT "rowId", "value" FROM "_t_history" WHERE "tableName" = 'notes' ORDER BY "id"`).map(
    (row) => `${String(row.rowId)} ${String(Object(JSON.parse(String(row.value))).body)}`,
  )
}

test('[50-5@6] the kept earlier versions of a row move with it: into the file of its tenant, out of the shared file, and back again', async (t) => {
  const folder = copyOf(t, 'moving')
  const tables = join(folder, 'tables.ts')
  const last = '  access: { read: open, add: open, change: open },\n})'
  assert.ok(readFileSync(tables, 'utf8').includes(last))
  writeFileSync(tables, readFileSync(tables, 'utf8').replace(last, `  keepHistory: true,\n${last}`))
  let bundles = 0
  const built = async (from?: string, to?: string): Promise<string> => {
    const text = readFileSync(tables, 'utf8')
    if (from !== undefined && to !== undefined) {
      assert.ok(text.includes(from))
      writeFileSync(tables, text.replace(from, to))
    }
    const made = await buildProject(folder, { for: 'dev', out: join(folder, '..', `bundle-${++bundles}`) })
    assert.deepEqual(
      made.findings.filter((one) => one.level === 'error').map((one) => `${one.code} ${one.message}`),
      [],
    )
    return made.bundleFolder
  }
  await built()
  const { app, dataFolder } = await appIn(t, folder)
  const first = String(running(app))
  const teams: string[] = []
  for (const name of ['North', 'South'])
    teams.push(String(Object(await app.call('addTeam', { name }, { as: { kind: 'system' } })).id))
  // Each team holds two notes: one was changed twice, so two earlier versions of it are kept.
  const expected: Record<string, string[]> = {}
  for (const [i, team] of teams.entries()) {
    await app.write(
      [
        { add: 'notes', values: { team, body: `first of ${i}` } },
        { add: 'notes', values: { team, body: `quiet of ${i}` } },
      ],
      system,
    )
    const note = String((await app.rows('notes')).find((row) => row.body === `first of ${i}`)?.id)
    await app.write([{ change: 'notes', id: note, values: { body: `second of ${i}` } }], system)
    await app.write([{ change: 'notes', id: note, values: { body: `third of ${i}` } }], system)
    expected[team] = [`${note} first of ${i}`, `${note} second of ${i}`]
  }
  const shared = join(dataFolder, 'data.db')
  assert.deepEqual(keptIn(shared).sort(), Object.values(expected).flat().sort())

  // The notes are a tenant table: each earlier version stands in the file of its tenant, and no longer in the shared file.
  const kept = await app.add(await built('  // where the notes live\n', "  tenant: 'team',\n"))
  const taken = await app.switch(kept, { move: true })
  assert.deepEqual([taken.refused, running(app)], [undefined, kept])
  for (const team of teams) assert.deepEqual(keptIn(fileOf(dataFolder, team)), expected[team], `the file of ${team}`)
  assert.deepEqual(keptIn(shared), [])
  // A change after the move is kept beside them.
  const quiet = (await app.rows('notes', { of: teams[0] })).find((row) => row.body === 'quiet of 0')
  await app.write([{ change: 'notes', of: teams[0], id: String(quiet?.id), values: { body: 'loud of 0' } }], system)
  expected[teams[0]].push(`${String(quiet?.id)} quiet of 0`)

  // And back: every earlier version stands in the shared file, and none is left in a file.
  assert.equal(await app.add(await built("  tenant: 'team',\n", '  // where the notes live\n')), first)
  const back = await app.switch(first, { move: true })
  assert.deepEqual([back.refused, running(app)], [undefined, first])
  assert.deepEqual(keptIn(shared).sort(), Object.values(expected).flat().sort())
  await until(
    'the earlier versions have left the files',
    () => teams.every((team) => keptIn(fileOf(dataFolder, team)).length === 0),
    3000,
  )
})
