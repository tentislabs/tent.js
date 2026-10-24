import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pastKeep } from '../removal.ts'
import type { RunRow } from '../rows.ts'

const day = 86_400_000

test('[51-5] the runs that are past their keep are found among 60,000 runs at once, each called run by its top', (t) => {
  const now = 400 * day
  const row = (id: string, top: string): RunRow => ({
    id,
    flow: 'tidy',
    kind: 'flow',
    version: 'v1',
    state: 'done',
    startedBy: { kind: 'system' },
    as: 'system',
    top,
    ...(top === id ? {} : { parent: top }),
    used: [],
    workedMs: 0,
    createdAt: now - 40 * day,
    endedAt: now - 40 * day,
  })
  // Half of them stand at the top of their calls, and each of the others was called by one of those.
  const tops = Array.from({ length: 30_000 }, (_, k) => row(`top-${k}`, `top-${k}`))
  const called = tops.map((one, k) => row(`called-${k}`, one.id))
  const runs = [...called, ...tops]
  // What the runner is handed of the engine where every run is found among the runs it was handed.
  const held = Object({
    env: { clock: { now: () => now }, description: () => ({ functions: {} }) },
  })
  const began = performance.now()
  const past = pastKeep(held, runs, now - 30 * day)
  const took = performance.now() - began
  t.diagnostic(`${past.length} runs found past their keep in ${took.toFixed(0)} ms`)
  assert.equal(past.length, 60_000)
  // A walk that reads each run once takes a few milliseconds; one that looks for each top among every run, seconds.
  assert.ok(took < 1000, `the runs past their keep were found in ${took.toFixed(0)} ms`)
})
