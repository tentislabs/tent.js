import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'
import { runKilled } from '../../../rig/kill.ts'
import { copyOf, workFolder } from './projects.ts'

// The steps of a run with two tools on a conversation, by the names of a run of an agent.
const steps = ['remember', 'model 1', 'tool 1.1 myOrders', 'tool 1.2 markPaid', 'remember 1', 'model 2', 'remember 2']

test('[27-1] a run with two tools has the steps of its names; killed after each step in turn and started again, it ends with every step run once and each round in the conversation once', async (t) => {
  const project = copyOf(t, 'helpdesk')
  const program = join(import.meta.dirname, 'killed', 'agent.ts')
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
    assert.deepEqual(ended.rows, ['user', 'assistant', 'tool', 'tool', 'assistant'], `killed after ${step}`)
  }
})
