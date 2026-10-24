import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { RunRow } from '../rows.ts'
import { addRun } from '../rows.ts'
import { bench, version } from './bench.ts'

// How long the runs that ended are kept: a run at the top of its calls by its own end, a called run with its top.

const hour = 3_600_000
const day = 24 * hour

test('[51-5] the run of an action that nobody called is gone runKept of the action after it ended, and a flow run of that age stays', async (t) => {
  const b = bench(t, { waits: async ({ step }) => step.waitFor('approval') })
  // The actions of the version, as `describe` stores them: `runKept` stands where it is not the default of an hour.
  Object.assign(b.env.description(version).functions, { long: { limits: { runKept: 4 * hour } }, short: {} })
  const top = b.start('waits')
  await b.until(top, 'waiting')
  const now = b.clock.now()
  const ended = (id: string, flow: string, kind: string, ago: number, parent?: string): RunRow => ({
    id,
    flow,
    kind,
    version,
    state: 'done',
    startedBy: { kind: 'system' },
    as: 'system',
    top: parent ?? id,
    ...(parent ? { parent } : {}),
    used: [],
    workedMs: 0,
    createdAt: now - ago - 1000,
    endedAt: now - ago,
  })
  b.store.write((tx) => {
    addRun(tx, ended('short-old', 'short', 'action', 2 * hour))
    addRun(tx, ended('short-new', 'short', 'action', hour / 2))
    addRun(tx, ended('long-mid', 'long', 'action', 2 * hour))
    addRun(tx, ended('called', 'short', 'action', 2 * hour, top))
    addRun(tx, ended('flow-old', 'waits', 'flow', 2 * day))
  })
  b.runner.remove({ endedBefore: now - 30 * day })
  const there = ['short-old', 'short-new', 'long-mid', 'called', 'flow-old'].filter((id) => b.runner.read(id))
  // Past an hour the run of an action goes; one that states four hours stays; a called one stays with its top.
  assert.deepEqual(there, ['short-new', 'long-mid', 'called', 'flow-old'])
})
