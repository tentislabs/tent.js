import assert from 'node:assert/strict'
import test from 'node:test'
import type { TestApp } from '../index.ts'
import { addOrder, addTeam, deskBundle, deskOf, listed, ordersOf, titlesOf } from './desks.ts'
import { codeOf, moment, until } from './many.ts'

const system = { as: { kind: 'system' } } as const

/** The id of the version that an app runs. */
const running = (app: TestApp): string | undefined => app.versions().find((one) => one.running)?.id

/** Adds so many teams, each with one order that holds a code. */
async function teamsOf(app: TestApp, count: number): Promise<string[]> {
  const teams: string[] = []
  for (let i = 0; i < count; i++) {
    teams.push(await addTeam(app, `team ${i}`))
    await addOrder(app, teams[i], `first of ${i}`, { code: `C${i}` })
  }
  return teams
}

/** Waits until no pass has a file left to bring up: each file is at the running layout, or failed. */
async function passed(app: TestApp, dataFolder: string): Promise<void> {
  for (let i = 0; i < 600; i++) {
    if ((await listed(app, dataFolder)).files.every((one) => !one.behind || one.failed)) return
    await moment(25)
  }
  assert.fail('never: the pass has ended')
}

test('[50-5@6] a switch back over a column that the switch before renamed leaves no file failed: every tenant is answered its rows as they were, also where the pass had brought its file up', async (t) => {
  const { app, dataFolder } = await deskOf(t, { filesAtOnce: 1 })
  const first = String(running(app))
  const teams = await teamsOf(app, 12)
  const renamed = await app.add(await deskBundle(t, { renamed: true, filesAtOnce: 1 }))
  const taken = await app.switch(renamed)
  assert.deepEqual([taken.refused, taken.behind, taken.hard], [undefined, 12, true])
  // The pass has brought some files up, and not yet all of them, when the program goes back.
  await until(
    'the pass has brought a file up',
    async () => (await listed(app, dataFolder)).files.some((one) => !one.behind),
    4000,
  )
  assert.equal(await app.add(await deskBundle(t, { filesAtOnce: 1 })), first)
  const back = await app.switch(first)
  assert.deepEqual([back.refused, running(app)], [undefined, first])
  await passed(app, dataFolder)
  // No file is failed, and each tenant reads its order under the name that the column had before.
  assert.deepEqual(
    (await listed(app, dataFolder)).files.map((one) => [one.behind, one.failed?.code]),
    teams.map(() => [false, undefined]),
  )
  for (const [i, team] of teams.entries())
    assert.deepEqual(
      (await ordersOf(app, team)).map((row) => [row.title, 'name' in row]),
      [[`first of ${i}`, false]],
      `team ${i}`,
    )
})

test('[50-5@6] a switch forward again while the pass of a switch back runs is held against every file as any switch is: a row that the old version wrote meanwhile refuses it, and no file is failed', async (t) => {
  const { app, dataFolder } = await deskOf(t, { filesAtOnce: 1 })
  const first = String(running(app))
  const teams = await teamsOf(app, 12)
  const bundle = await deskBundle(t, { codeRequired: true, filesAtOnce: 1 })
  const required = await app.add(bundle)
  await app.switch(required)
  assert.equal(await app.add(await deskBundle(t, { filesAtOnce: 1 })), first)
  await app.switch(first)
  assert.equal(running(app), first)
  // The version before runs again, and no hold counts: it writes a row that holds no code.
  const last = teams[11]
  assert.equal(await codeOf(app.call('addOrder', { team: last, title: 'no code' }, system)), undefined)
  // The switch forward is a switch of its own: it is refused for that row, or waits for the pass, and is not taken.
  assert.equal(await app.add(bundle), required)
  const again = await app.switch(required).then(
    (told) => told.refused ?? 'taken',
    (error: unknown) => String(Object(error).code),
  )
  assert.ok(['T2001', 'behind'].includes(again), `the switch forward was ${again}`)
  assert.equal(running(app), first)
  await passed(app, dataFolder)
  assert.deepEqual(
    (await listed(app, dataFolder)).files.filter((one) => one.failed).map((one) => one.failed?.code),
    [],
  )
  assert.deepEqual(await titlesOf(app, last), ['first of 11', 'no code'])
})
