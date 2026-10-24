import assert from 'node:assert/strict'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { addOrder, addTeam, deskOf, titlesOf } from './desks.ts'

const system = { as: { kind: 'system' } } as const

/** How many rows of `calls` the log of a data folder holds. */
function calls(dataFolder: string): number {
  const log = new DatabaseSync(join(dataFolder, 'logs.db'), { readOnly: true })
  try {
    return Number(log.prepare('SELECT count(*) AS n FROM "calls"').get()?.n)
  } finally {
    log.close()
  }
}

test('[17-1@4] app.kill() answers nothing and writes nothing more: an action that is under way at the kill is refused to its caller and not answered, and the log holds the rows of calls that it held before the kill, and no row of that action', async (t) => {
  const { app, dataFolder } = await deskOf(t)
  const north = await addTeam(app, 'North')
  await addOrder(app, north, 'of the north')
  const before = calls(dataFolder)
  // The action is under way: it was called, and nothing has waited for its answer.
  const answered: unknown[] = []
  const under = app.call('countLater', { team: north }, system).then(
    (value) => void answered.push(['answered', value]),
    (error: unknown) => void answered.push(['refused', Reflect.get(Object(error), 'code')]),
  )
  await app.kill()
  await under
  assert.deepEqual(answered, [['refused', 'T0029']])
  assert.equal(calls(dataFolder), before)
  // Opened again, the folder holds what it held, and answers.
  await app.restart()
  assert.deepEqual(await titlesOf(app, north), ['of the north'])
  assert.equal(await app.call('countLater', { team: north }, system), 1)
})
