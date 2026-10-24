import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { runKilled } from '../../../rig/kill.ts'
import { workFolder } from './bench.ts'

test('[46-3] a program killed after each start of a paced flow in turn loses no start that waits: after the restart each runs once', async (t) => {
  const program = join(import.meta.dirname, 'killed', 'paced.ts')
  for (const start of [1, 4, 5, 9, 12]) {
    const folder = workFolder(t)
    const killed = await runKilled(program, { times: 1, when: `added ${start}`, args: [folder] })
    assert.equal(killed.kills, 1)
    const [second] = killed.ended
    assert.equal(second.code, 0, `killed after start ${start}: ${second.out}`)
    const found = /^ended: (.*)$/m.exec(second.out)
    assert.ok(found, second.out)
    const ended = JSON.parse(found[1])
    const all = Array.from({ length: 12 }, (_, n) => n + 1)
    assert.deepEqual(ended.answers, all, `killed after start ${start}: one run for each start, and each ended`)
    assert.deepEqual(ended.noted, all, `killed after start ${start}: the work of each was done`)
  }
})
