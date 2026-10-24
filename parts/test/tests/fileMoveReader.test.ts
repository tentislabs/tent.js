import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { TestApp } from '../index.ts'
import { appIn, fileOf, logLines, readerFolder } from './desks.ts'
import { current, level, until } from './many.ts'
import { copyOf } from './projects.ts'

const system = { as: 'system' } as const

/** The id of the version that an app runs. */
const running = (app: TestApp): string | undefined => app.versions().find((one) => one.running)?.id

/** The bodies of the notes that a machine holds, of every team, in their order. */
const bodies = async (machine: TestApp): Promise<string[]> =>
  (await machine.rows('notes')).map((row) => String(row.body)).sort()

test('[50-5@6] [29-8] a move with a reader joined: the reader holds each moved row in the file of its tenant once the switch is taken, and in its shared file again after the move back', async (t) => {
  const folder = copyOf(t, 'moving')
  const tables = join(folder, 'tables.ts')
  let bundles = 0
  const built = async (from: string, to: string): Promise<string> => {
    const text = readFileSync(tables, 'utf8')
    assert.ok(text.includes(from))
    writeFileSync(tables, text.replace(from, to))
    const made = await buildProject(folder, { for: 'dev', out: join(folder, '..', `bundle-${++bundles}`) })
    assert.deepEqual(
      made.findings.filter((one) => one.level === 'error').map((one) => `${one.code} ${one.message}`),
      [],
    )
    return made.bundleFolder
  }
  const desk = await appIn(t, folder)
  const { app } = desk
  const near = await app.reader()
  await current(app, near)
  const first = running(app)
  const teams: string[] = []
  for (const name of ['North', 'South', 'East'])
    teams.push(String(Object(await app.call('addTeam', { name }, { as: { kind: 'system' } })).id))
  for (const [i, team] of teams.entries())
    await app.write(
      [1, 2, 3, 4].map((n) => ({ add: 'notes', values: { team, body: `note ${n} of ${i}` } })),
      system,
    )
  await level(app, near)
  const all = await bodies(app)
  assert.equal(all.length, 12)
  assert.deepEqual(await bodies(near), all)
  const there = readerFolder(desk, 2)

  // The notes are a tenant table, with their team as the tenant: the writer moves the rows, and the reader follows every write of it.
  const kept = await app.add(await built('  // where the notes live\n', "  tenant: 'team',\n"))
  await until('the reader holds the version', () => near.versions().some((one) => one.id === kept))
  const taken = await app.switch(kept, { move: true })
  assert.deepEqual([taken.refused, running(app)], [undefined, kept])
  await level(app, near)
  await until('the reader runs the version', () => running(near) === kept)
  assert.deepEqual(await bodies(app), all)
  assert.deepEqual(await bodies(near), all)
  for (const team of teams) {
    assert.equal(existsSync(fileOf(there, team)), true, `the reader holds the file of ${team}`)
    assert.deepEqual(
      (await near.rows('notes', { of: team })).map((row) => String(row.body)).sort(),
      (await app.rows('notes', { of: team })).map((row) => String(row.body)).sort(),
    )
  }
  // A note that is written after the move stands in the file of its team on both machines.
  await app.write([{ add: 'notes', of: teams[0], values: { team: teams[0], body: 'written after the move' } }], system)
  await level(app, near)
  assert.equal((await bodies(near)).includes('written after the move'), true)

  // And back, into the shared file: both machines hold every row once.
  assert.equal(await app.add(await built("  tenant: 'team',\n", '  // where the notes live\n')), first)
  const back = await app.switch(String(first), { move: true })
  assert.deepEqual([back.refused, running(app)], [undefined, first])
  // After the write of the switch the writer takes the rows out of the files they left, a file at a time: the
  // reader is waited for where the writer stands then, and not where it stood when the switch answered.
  await until(
    'the reader runs the first version again, and holds every write of the writer',
    () => running(near) === first && near.at().n === app.at().n && near.at().settled === app.at().n,
    3000,
  )
  assert.deepEqual(
    logLines(there, 'could not').map((one) => one.message),
    [],
  )
  assert.deepEqual(await bodies(app), [...all, 'written after the move'].sort())
  assert.deepEqual(await bodies(near), [...all, 'written after the move'].sort())
})
