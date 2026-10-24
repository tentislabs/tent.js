import assert from 'node:assert/strict'
import { test } from 'node:test'
import { system } from './apps.ts'
import { flowing, settle, untilWithin } from './flowing.ts'

test('[46-2] the runs of a paused flow in files of tenants that closed are counted and stopped by stopAll, counted by replayAll, and go on after resume', async (t) => {
  const { app } = await flowing(t, {
    project: 'attackingTenants',
    // One file of a tenant stands open at a time: the file of the other team is closed while the test works.
    change: (description) => {
      description.project.limits = { ...Object(description.project.limits), openFiles: 1 }
    },
  })
  const teams: string[] = []
  for (const name of ['a', 'b']) teams.push(String(Object(await app.call('addTeam', { name }, { as: system })).id))
  app.runs.pause('drip')
  for (const team of teams) await app.call('addOrder', { team, title: 'order' }, { as: system })
  await settle()
  const drips = async () => app.runs.find({ flow: 'drip', of: 'all' })
  assert.deepEqual(
    (await drips()).map((run) => run.state),
    ['queued', 'queued'],
    'a start in the file of each team is kept',
  )

  const counted = await app.runs.stopAll({ flow: 'drip' }, { dry: true })
  assert.equal(counted.count, 2, 'the run of the closed file is counted too')
  const replays = await app.runs.replayAll({ flow: 'drip' }, { dry: true })
  assert.equal(replays.count, 2)

  await app.runs.resume('drip')
  await untilWithin(
    async () => (await drips()).every((run) => run.state === 'waiting'),
    'each kept start went on, the one of the closed file too',
  )
  const stopped = await app.runs.stopAll({ flow: 'drip' })
  assert.equal(stopped.count, 2)
  await untilWithin(async () => (await drips()).every((run) => run.state === 'stopped'), 'both runs are stopped')
})
