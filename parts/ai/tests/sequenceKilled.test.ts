import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'
import { runKilled } from '../../../rig/kill.ts'
import { copyOf, workFolder } from './projects.ts'

// The steps of a run whose model hands one sequence that marks the three late orders.
const steps = [
  'model 1',
  'sequence 1.1',
  'tool 1.1.1 myOrders',
  'tool 1.1.2 markLate',
  'tool 1.1.3 markLate',
  'tool 1.1.4 markLate',
  'model 2',
]

test('[27-18] a sequence killed after each step in turn and started again on an engine that was handed no reader of source makes every call once, reads the text no second time, and goes on', async (t) => {
  const project = copyOf(t, 'sequenced')
  const program = join(import.meta.dirname, 'killed', 'sequence.ts')
  for (const step of steps.slice(0, -1)) {
    const folder = workFolder(t)
    const killed = await runKilled(program, {
      times: 1,
      when: `saved ${step}`,
      args: [project, join(folder, 'bundle'), join(folder, 'data'), join(folder, 'told'), step],
    })
    assert.equal(killed.kills, 1, step)
    const [again] = killed.ended
    assert.equal(again.code, 0, `killed after ${step}: ${again.out}`)
    const found = /^ended: (.*)$/m.exec(again.out)
    assert.ok(found, again.out)
    const ended = JSON.parse(found[1])
    assert.deepEqual(ended.answer, { text: 'Done.' }, step)
    assert.deepEqual(
      ended.steps,
      steps.map((one) => `${one}:done`),
      `killed after ${step}, every step ran once`,
    )
    assert.equal(ended.lates, 3, `killed after ${step}, each order was marked once`)
  }
})
