import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { describeProject } from '../../build/index.ts'
import { readFacts } from '../../engine/index.ts'
import { addOrder, addTeam, deskOf } from './desks.ts'
import { copyOf } from './projects.ts'

test('[15-7] [50-6] readFacts, with no engine, holds a project against the file of each tenant of a data folder that stands: a row of one tenant that a table change does not fit is a finding with its tenant, and the files are left as they were', async (t) => {
  const { app, dataFolder } = await deskOf(t)
  const [north, south] = [await addTeam(app, 'North'), await addTeam(app, 'South')]
  await addOrder(app, north, 'an order that holds no code')
  await addOrder(app, south, 'an order with its code', { code: 'S-1' })
  const next = copyOf(t, 'desk')
  const tables = join(next, 'tables', 'tables.ts')
  writeFileSync(tables, readFileSync(tables, 'utf8').replace('code: text({ optional: true }),', 'code: text(),'))
  const { description } = await describeProject(next)
  const running = await app.facts(description)
  // The app is ended as a killed program is: its data folder stands, where a close of a test app removes it.
  await app.kill()
  assert.equal(existsSync(join(dataFolder, 'data.db')), true)
  const read = await readFacts(dataFolder, description)
  for (const facts of [running, read]) {
    assert.deepEqual(
      facts.tableFindings.map((one) => [one.code, one.message.includes(north), one.message.includes(south)]),
      [['T2001', true, false]],
    )
    assert.match(facts.tableFindings[0].message, /^1 row of `orders`/)
  }
  // The same description as the data holds finds nothing, in either way.
  const { description: same } = await describeProject(copyOf(t, 'desk'))
  assert.deepEqual((await readFacts(dataFolder, same)).tableFindings, [])
  // The folder opens again: the reading held no file and changed none.
  await app.restart()
  assert.deepEqual((await app.rows('orders', { of: north })).length, 1)
})
