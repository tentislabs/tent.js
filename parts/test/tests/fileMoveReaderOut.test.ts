import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { TestApp } from '../index.ts'
import { appIn, fileOf, readFile, readerFolder } from './desks.ts'
import { current, level, until } from './many.ts'
import { copyOf } from './projects.ts'

const system = { as: 'system' } as const

const running = (app: TestApp): string | undefined => app.versions().find((one) => one.running)?.id

/** How many notes a data file holds, read alone: none where it holds no such table or is not there. */
function notesIn(file: string): number {
  if (!existsSync(file)) return 0
  try {
    return Number(readFile(file, 'SELECT count(*) AS "n" FROM "notes"')[0]?.n ?? 0)
  } catch {
    return 0
  }
}

test('[50-5@6] [29-8] a reader keeps no row of a table that moved out of the files of its tenants: each of its files is emptied of it, as each file of its writer is', async (t) => {
  const folder = copyOf(t, 'moving')
  const tables = join(folder, 'tables.ts')
  let bundles = 0
  const built = async (from: string, to: string): Promise<string> => {
    writeFileSync(tables, readFileSync(tables, 'utf8').replace(from, to))
    const made = await buildProject(folder, { for: 'dev', out: join(folder, '..', `bundle-${++bundles}`) })
    assert.deepEqual(
      made.findings.filter((one) => one.level === 'error').map((one) => one.message),
      [],
    )
    return made.bundleFolder
  }
  const desk = await appIn(t, folder)
  const { app } = desk
  const near = await app.reader()
  await current(app, near)
  const first = String(running(app))
  const teams: string[] = []
  for (const name of ['North', 'South'])
    teams.push(String(Object(await app.call('addTeam', { name }, { as: { kind: 'system' } })).id))
  for (const team of teams)
    await app.write(
      [1, 2].map((n) => ({ add: 'notes', values: { team, body: `note ${n}` } })),
      system,
    )
  const kept = await app.add(await built('  // where the notes live\n', "  tenant: 'team',\n"))
  await until('the reader holds the version', () => near.versions().some((one) => one.id === kept))
  await app.switch(kept, { move: true })
  await level(app, near)
  await until('the reader runs the version', () => running(near) === kept)
  const there = readerFolder(desk, 2)
  for (const team of teams) assert.equal(notesIn(fileOf(there, team)), 2, 'the reader holds the moved rows')

  assert.equal(await app.add(await built("  tenant: 'team',\n", '  // where the notes live\n')), first)
  await app.switch(first, { move: true })
  await until(
    'the files of the writer hold no note',
    () => teams.every((team) => notesIn(fileOf(desk.dataFolder, team)) === 0),
    3000,
  )
  await until(
    'the reader holds every write of the writer',
    () => running(near) === first && near.at().n === app.at().n && near.at().settled === app.at().n,
    3000,
  )
  for (const team of teams)
    assert.equal(notesIn(fileOf(there, team)), 0, `the file of ${team} on the reader holds no note`)
})
