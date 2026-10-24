import assert from 'node:assert/strict'
import test from 'node:test'
import type { TestApp } from '../index.ts'
import { addOrder, addTeam, deskBundle, deskOf, fileOf, listed, readFile } from './desks.ts'
import { codeOf, moment, until } from './many.ts'

/** The id of the version that an app runs. */
const running = (app: TestApp): string | undefined => app.versions().find((one) => one.running)?.id

/** The indexes of `orders` in one data file that hold a rule of their own: no two rows share what they name. */
const counted = `SELECT count(*) AS "n" FROM pragma_index_list('orders') WHERE "unique" = 1 AND "origin" <> 'pk'`

/** Reads that count where the file is free, and answers nothing while a file thread writes it. */
function uniqueIn(file: string): number | undefined {
  try {
    return Number(readFile(file, counted)[0]?.n ?? 0)
  } catch (error) {
    if (/locked|busy/.test(String(error))) return undefined
    throw error
  }
}

/** Reads that count once the file is free. */
async function uniqueOf(file: string): Promise<number> {
  for (let i = 0; i < 600; i++) {
    const count = uniqueIn(file)
    if (count !== undefined) return count
    await moment(10)
  }
  return assert.fail(`never: the file ${file} is free to read`)
}

test('[50-5@6] the index of a new unique rule is made at the check, in each file, before the pass brings the file up: and where the check refuses the switch, no file keeps it', async (t) => {
  const { app, dataFolder } = await deskOf(t, { filesAtOnce: 1 })
  const first = running(app)
  const teams: string[] = []
  for (let i = 0; i < 10; i++) {
    teams.push(await addTeam(app, `team ${i}`))
    await addOrder(app, teams[i], `first of ${i}`, { code: 'A' })
    await addOrder(app, teams[i], `second of ${i}`, { code: 'B' })
  }
  const stood: number[] = []
  for (const team of teams) stood.push(await uniqueOf(fileOf(dataFolder, team)))
  const unique = await deskBundle(t, { codeUnique: true, filesAtOnce: 1 })

  // One team holds two orders of one code: the check holds the files that fit, and refuses the switch for that one.
  await addOrder(app, teams[9], 'a third', { code: 'A' })
  const version = await app.add(unique)
  assert.equal(await codeOf(app.switch(version)), 'T2001')
  assert.equal(running(app), first)
  // No hold outlives its check, and neither does its index: every file is as it stood.
  await until(
    'no file keeps the index of the refused check',
    () => teams.every((team, k) => uniqueIn(fileOf(dataFolder, team)) === stood[k]),
    3000,
  )
  // The old version writes a second row of a code that another row holds: nothing holds it back any more.
  await addOrder(app, teams[0], 'a second A', { code: 'A' })
  await app.write([{ remove: 'orders', of: teams[0], id: (await app.rows('orders', { of: teams[0] })).at(-1)?.id }], {
    as: 'system',
  })

  // The row is mended, and the switch is taken: the check has made the index in every file, also in the files
  // that the pass has not brought up yet.
  const third = (await app.rows('orders', { of: teams[9] })).find((row) => row.title === 'a third')
  await app.write([{ change: 'orders', of: teams[9], id: third?.id, values: { code: 'C' } }], { as: 'system' })
  const taken = await app.switch(version)
  assert.deepEqual([taken.refused, running(app)], [undefined, version])
  const behindNow = async (): Promise<string[]> =>
    (await listed(app, dataFolder)).files.filter((one) => one.behind).map((one) => one.id)
  const behind = await behindNow()
  assert.ok(behind.length > 0, 'a file is still behind when the switch has answered')
  // A file is read while it is behind, and held to the count only where it is still behind after the reading.
  let held = 0
  for (const team of behind.reverse()) {
    const count = await uniqueOf(fileOf(dataFolder, team))
    if (!(await behindNow()).includes(team)) continue
    assert.equal(count, stood[teams.indexOf(team)] + 1, `the file of ${team} holds the index before it is brought up`)
    held++
  }
  assert.ok(held > 0, 'a file was read while the pass had not reached it')
  await until('the pass has ended', async () => (await listed(app, dataFolder)).files.every((one) => !one.behind), 3000)
  await moment(100)
  assert.equal(await codeOf(addOrder(app, teams[1], 'a second A', { code: 'A' })), 'T2101')
})
