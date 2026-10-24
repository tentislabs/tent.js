import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import type { TestApp } from '../index.ts'
import { addOrder, addTeam, deskBundle, deskOf, listed } from './desks.ts'
import { until } from './many.ts'

/** The id of the version that an app runs. */
const running = (app: TestApp): string | undefined => app.versions().find((one) => one.running)?.id

/** The backups of a data folder, by their names, in their order. */
// The archive of the changes stands beside the backups, and is none of them.
const backupsIn = (dataFolder: string): string[] =>
  existsSync(join(dataFolder, 'backups'))
    ? readdirSync(join(dataFolder, 'backups'))
        .filter((name) => name !== 'archive')
        .sort()
    : []

/** Every file under a folder, by its path below it. */
const filesUnder = (folder: string, below = ''): string[] =>
  readdirSync(join(folder, below), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesUnder(folder, join(below, entry.name)) : [join(below, entry.name)],
  )

test('[50-5@6] [20-9] a switch that changes a tenant table takes a backup first, as a switch that changes the shared file does: it holds the file of each tenant as it stood before the change', async (t) => {
  const { app, dataFolder } = await deskOf(t)
  const teams = [await addTeam(app, 'North'), await addTeam(app, 'South')]
  for (const [i, team] of teams.entries()) await addOrder(app, team, `first of ${i}`, { code: `C${i}` })
  const before = backupsIn(dataFolder)

  // The version renames a column of `orders`, which is a tenant table: the shared file takes no step of its own.
  const renamed = await app.add(await deskBundle(t, { renamed: true }))
  const taken = await app.switch(renamed)
  assert.deepEqual([taken.refused, running(app)], [undefined, renamed])
  await until('the pass has ended', async () => (await listed(app, dataFolder)).files.every((one) => !one.behind), 2000)
  const made = backupsIn(dataFolder).filter((name) => !before.includes(name))
  assert.equal(made.length, 1, `the backups after the switch: ${backupsIn(dataFolder).join(', ')}`)
  // The backup holds the file of each tenant, taken before any file was brought up.
  const held = filesUnder(join(dataFolder, 'backups', made[0])).map((file) => file.replaceAll('\\', '/'))
  for (const team of teams)
    assert.ok(
      held.some((file) => file.includes(team)),
      `the backup holds the file of ${team}: ${held.join(', ')}`,
    )
})
