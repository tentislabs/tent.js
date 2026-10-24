import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { runKilled } from '../../../rig/kill.ts'
import { copyOf, workFolder } from './projects.ts'

test('[45-16] a tool call that a run makes again after a kill, its write committed and its step not saved, runs once', async (t) => {
  const project = copyOf(t, 'helpdesk')
  // The agent is handed a tool that adds a row, so a second carrying out would show as a second row.
  const functions = join(project, 'functions.ts')
  writeFileSync(
    functions,
    readFileSync(functions, 'utf8').replace('tools: [myOrders, markPaid, closeShop]', 'tools: [myOrders, addOrder]'),
  )
  const folder = workFolder(t)
  const program = join(import.meta.dirname, 'killed', 'toolOnce.ts')
  const killed = await runKilled(program, {
    times: 1,
    when: 'added',
    args: [project, join(folder, 'bundle'), join(folder, 'data'), join(folder, 'told')],
  })
  assert.equal(killed.kills, 1)
  const [again] = killed.ended
  assert.equal(again.code, 0, again.out)
  const found = /^ended: (.*)$/m.exec(again.out)
  assert.ok(found, again.out)
  const ended = JSON.parse(found[1])
  assert.deepEqual(ended.answer, { text: 'Done.' })
  assert.deepEqual(ended.orders, ['lamp'])
})
