import assert from 'node:assert/strict'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { TestApp } from '../index.ts'
import { appIn, fileOf, readFile } from './desks.ts'
import { until } from './many.ts'
import { copyOf } from './projects.ts'

const system = { as: 'system' } as const

// A change that writes a note by a statement of its own, and states no table that it touches.
const rawBody = `
export const rawBody = change('rawBody', {
  access: anyone('a test calls it'),
  system: 'it writes a note by a statement of its own',
  input: { from: text(), to: text() },
  run: ({ db, input: given }) => {
    db.sql('UPDATE "notes" SET "body" = ? WHERE "body" = ?', [given.to, given.from])
  },
})
`

/** The id of the version that an app runs. */
const running = (app: TestApp): string | undefined => app.versions().find((one) => one.running)?.id

/** How many notes one data file holds, read with no engine: none where it holds no such table, or is not there. */
function countIn(file: string): number {
  if (!existsSync(file)) return 0
  try {
    return Number(readFile(file, 'SELECT count(*) AS "n" FROM "notes"')[0]?.n ?? 0)
  } catch {
    return 0
  }
}

test('[50-7] a change that writes a table which moves by raw SQL, and states no table, waits for the move as any write of that table does: what it wrote is in the file of its tenant when the move has ended', async (t) => {
  const folder = copyOf(t, 'moving')
  appendFileSync(join(folder, 'functions.ts'), rawBody)
  const built = async (out: string): Promise<string> =>
    (await buildProject(folder, { for: 'dev', out: join(folder, '..', out) })).bundleFolder
  await built('bundle-1')
  const { app, dataFolder } = await appIn(t, folder)
  const first = running(app)
  const teams: string[] = []
  for (let i = 0; i < 20; i++)
    teams.push(String(Object(await app.call('addTeam', { name: `team ${i}` }, { as: { kind: 'system' } })).id))
  for (let part = 0; part < 4; part++)
    await app.write(
      Array.from({ length: 1000 }, (_, i) => ({
        add: 'notes',
        values: { team: teams[i % 20], body: `note ${part * 1000 + i}` },
      })),
      system,
    )
  const tables = join(folder, 'tables.ts')
  writeFileSync(tables, readFileSync(tables, 'utf8').replace('  // where the notes live\n', "  tenant: 'team',\n"))
  const kept = await app.add(await built('bundle-2'))

  const moving = app.switch(kept, { move: true })
  // The rows of one tenant stand in its file already, and the move goes on over the others.
  let reached = -1
  await until(
    'the move has reached a file',
    () => {
      reached = teams.findIndex((team) => countIn(fileOf(dataFolder, team)) > 0)
      return reached >= 0
    },
    4000,
  )
  assert.equal(running(app), first)
  // A note of that tenant is written by raw SQL now. The call is answered, at once or once the move has ended.
  await app.call('rawBody', { from: `note ${reached}`, to: 'written while the rows moved' }, { as: { kind: 'system' } })
  await moving
  assert.equal(running(app), kept)
  // The write was answered, so it stands: the note holds what was written, in the file of its tenant.
  const bodies = (await app.rows('notes')).filter((row) => row.team === teams[reached]).map((row) => String(row.body))
  assert.equal(bodies.length, 200)
  assert.deepEqual(
    [bodies.includes('written while the rows moved'), bodies.includes(`note ${reached}`)],
    [true, false],
    'the write that was answered while the rows moved is lost',
  )
})
