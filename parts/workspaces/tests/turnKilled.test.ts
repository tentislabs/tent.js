import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { runKilled } from '../../../rig/kill.ts'
import { folderOf } from './held.ts'

const program = join(import.meta.dirname, 'killed', 'turn.ts')

for (const [phase, line, rounds] of [
  ['step2', 'in step 2', 1],
  ['step3', 'in step 3', 2],
] as const) {
  test(`[40-13] a turn whose program is killed in ${phase.replace('step', 'step ')} ends after the restart, with its second point and its row`, async (t) => {
    const folder = join(folderOf(t), phase)
    const killed = await runKilled(program, { times: 1, when: line, args: [folder, phase], wait: 300_000 })
    assert.equal(killed.kills, 1)
    const [after] = killed.ended
    assert.equal(after.code, 0, after.out)
    const found = /^ended: (.*)$/m.exec(after.out)
    assert.ok(found, after.out)
    const ended = JSON.parse(found[1])
    assert.equal(ended.row.state, 'done', JSON.stringify(ended.row))
    assert.equal(ended.row.rounds, rounds)
    assert.ok(ended.row.after, 'the row names its second point')
    assert.equal(ended.points, 2, 'the turn recorded its two points')
    assert.equal(ended.written, true, 'what the run wrote after the restart stands')
    // The run that was under way is the one that goes on, and the thread holds the person's message once.
    assert.equal(ended.told, 1, 'the thread holds the message of the person once')
    if (phase === 'step2') assert.equal(ended.row.run, ended.runBefore, 'the run that was under way goes on')
  })
}
