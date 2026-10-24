import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { runKilled } from '../../../rig/kill.ts'
import { workFolder } from './bench.ts'

/** What the second start of the killed program printed when it ended. */
interface Ended {
  answer: unknown
  steps: string[]
  ran: string[]
  seen: string[]
}

/** Reads the line that the program prints when its run has ended. */
function endedOf(out: string): Ended {
  const found = /^ended: (.*)$/m.exec(out)
  assert.ok(found, `the program printed no end: ${out}`)
  return JSON.parse(found[1])
}

test('[23-1] a flow with five steps, killed after each step in turn and started again, ends with every step having run exactly once', async (t) => {
  const program = join(import.meta.dirname, 'killed', 'fiveSteps.ts')
  for (const step of [1, 2, 3, 4, 5]) {
    const folder = workFolder(t)
    const killed = await runKilled(program, { times: 1, when: `saved step ${step}`, args: [folder, String(step)] })
    assert.equal(killed.kills, 1)
    const [second] = killed.ended
    assert.equal(second.code, 0, `killed after step ${step}: ${second.out}`)
    const ended = endedOf(second.out)
    assert.deepEqual(ended.ran, ['1', '2', '3', '4', '5'], `killed after step ${step}, every step ran exactly once`)
    assert.deepEqual(
      ended.steps,
      [1, 2, 3, 4, 5].map((n) => `step ${n}:done`),
    )
    assert.equal(ended.answer, 5)

    // What each pass read. The first start was killed when the step was saved and before its answer reached the
    // flow, so it wrote a line for each step before that one. The second start read every step, from the first on.
    const handed = 'pass with input a Date of 2025-06-01T00:00:00.000Z'
    const answers = [1, 2, 3, 4, 5].map((n) => `step ${n} string 2026-01-0${n}T00:00:00.000Z`)
    assert.deepEqual(
      ended.seen,
      [handed, ...answers.slice(0, step - 1), handed, ...answers],
      `killed after step ${step}: \`input\` hands a date as a \`Date\` on both passes, and a step answers its date as the same text on the pass that made it and after the restart`,
    )
  }
})
