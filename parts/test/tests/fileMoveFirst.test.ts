import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import { appIn, fileOf, readFile } from './desks.ts'
import { copyOf } from './projects.ts'

const system = { as: 'system' } as const

/** How many notes one data file holds, read with no engine: none where it is not there. */
const countIn = (file: string): number =>
  existsSync(file) ? Number(readFile(file, 'SELECT count(*) AS "n" FROM "notes"')[0]?.n ?? 0) : 0

test('[50-7] a switch with move in an app that keeps no data file of a tenant yet: the first table that gains tenant is moved into the files of its tenants, and the app answers each row as before', async (t) => {
  const folder = copyOf(t, 'moving')
  const tables = join(folder, 'tables.ts')
  const text = readFileSync(tables, 'utf8')
  const start = text.indexOf('// A tenant table in every version')
  const end = text.indexOf('// The table that moves')
  assert.ok(start > 0 && end > start, 'the project holds the tenant table from the first version on')
  writeFileSync(tables, text.slice(0, start) + text.slice(end))
  const { app, dataFolder } = await appIn(t, folder)
  assert.equal(existsSync(join(dataFolder, 'tenants')), false, 'the app keeps no file of a tenant')
  const teams: string[] = []
  for (let i = 0; i < 3; i++)
    teams.push(String(Object(await app.call('addTeam', { name: `team ${i}` }, { as: { kind: 'system' } })).id))
  await app.write(
    Array.from({ length: 30 }, (_, i) => ({ add: 'notes', values: { team: teams[i % 3], body: `note ${i}` } })),
    system,
  )
  const before = (await app.rows('notes')).map((row) => String(row.body)).sort()

  const now = readFileSync(tables, 'utf8')
  writeFileSync(tables, now.replace('  // where the notes live\n', "  tenant: 'team',\n"))
  const built = await buildProject(folder, { for: 'dev', out: join(folder, '..', 'bundle-tenant') })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error').map((one) => one.message),
    [],
  )
  const kept = await app.add(built.bundleFolder)
  await app.switch(kept, { move: true })
  assert.equal(app.versions().find((one) => one.running)?.id, kept)
  for (const team of teams) assert.equal(countIn(fileOf(dataFolder, team)), 10, `the file of ${team}`)
  const after: string[] = []
  for (const team of teams) for (const row of await app.rows('notes', { of: team })) after.push(String(row.body))
  assert.deepEqual(after.sort(), before)
})
