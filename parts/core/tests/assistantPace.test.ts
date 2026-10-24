import assert from 'node:assert/strict'
import { test } from 'node:test'
import { agent, flow, model, project, secret } from '../index.ts'
import { describe } from '../internal.ts'

const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('KEY') })
const limits = { steps: 4, perRun: { calls: 10 } }
const options = { model: writer, instructions: 'You help.', tools: [], limits }

/** The record of each definition of a description that is stored as a flow, by its name. */
function flowsOf(definitions: object[]): Record<string, Record<string, unknown>> {
  const { description, findings } = describe({
    definitions: [{ value: project('shop', {}) }, { value: writer }, ...definitions.map((value) => ({ value }))],
  })
  assert.deepEqual(
    findings.filter((one) => one.level === 'error'),
    [],
  )
  return description.flows
}

test('[46-9] an agent may state `key`, `pace` and `onStop` as a flow does, and each is stored as the same on a flow is', () => {
  const key = ({ input }: { input: { thread?: string } }) => input.thread
  const pace = { drop: { max: 1, per: '1 hour' }, order: () => 1, turns: 'key' } as const
  const onStop = async () => undefined
  const together = { then: 'join' } as const
  const flows = flowsOf([
    agent('desk', { model: writer, instructions: 'You help.', tools: [], limits, key, pace, onStop, together }),
    flow('same', { key, pace, onStop, together, run: async () => undefined }),
  ])
  const [desk, same] = [flows.desk, flows.same]
  assert.ok(desk && same)
  assert.deepEqual(desk.key, { export: 'desk_key' })
  assert.deepEqual(desk.onStop, { export: 'desk_onStop' })
  // The arrow of `order` is kept as code under the name of its own definition.
  assert.deepEqual(desk.pace, { ...Object(same.pace), order: { export: 'desk_pace_order' } })
  assert.deepEqual(desk.together, same.together)
  // An agent is driven, and stays plain: its arrows are code beside its record.
  assert.equal(desk.form, 'plain')
  assert.ok(desk.agent)
})

test('[46-9] an agent whose `key` is no arrow is T1014, as a flow is', () => {
  const { findings } = describe({
    definitions: [
      { value: project('shop', {}) },
      { value: writer },
      // A key that is no arrow is written past the types, as code that is not checked may write it.
      { value: Object(Reflect.apply(agent, undefined, ['desk', { ...options, key: 'thread' }])) },
    ],
  })
  assert.deepEqual(
    findings.map((one) => one.code),
    ['T1014'],
  )
})
