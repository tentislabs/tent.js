import assert from 'node:assert/strict'
import { test } from 'node:test'
import { agent, model, project } from '../index.ts'
import { describe } from '../internal.ts'

// Each sentence of the engine's own that the options of an agent add, and the one that a start joining a run adds.
const words = {
  answer: 'Give the answer here.',
  guarded: 'Not here.',
  handOver: 'Hand it on.',
  handedOver: 'Now with {}.',
  question: 'Ask the person.',
  recalled: 'Said before:',
  facts: 'Known:',
  joins: 'It joins the run under way.',
}

test('[13-1@10g] `words` of an agent gives anew the sentences of a typed answer, guards, hand-overs, questions, facts and recall, and `joins`, as `27`, section 11, names them', () => {
  const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5' })
  const helper = agent('helper', {
    model: writer,
    instructions: 'Help.',
    tools: [],
    limits: { steps: 4, perRun: { tokensOut: 1000 } },
    words,
  })
  const { description, findings } = describe({
    definitions: [{ value: project('words', {}) }, { value: writer }, { value: helper }],
  })
  assert.deepEqual(
    findings.map((one) => `${one.code} ${one.message}`),
    [],
  )
  assert.deepEqual(Reflect.get(Object(description.flows.helper?.agent), 'words'), words)
})

test('[13-1@10g] the words of tools that went with the fold are no words of an agent: `ask`, `remember` and `forget` are T1003, options the word does not have', () => {
  const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5' })
  const helper = agent('helper', {
    model: writer,
    instructions: 'Help.',
    tools: [],
    limits: { steps: 4, perRun: { tokensOut: 1000 } },
    words: { ask: 'Ask.', remember: 'Keep.', forget: 'Drop.' },
  })
  const { findings } = describe({
    definitions: [{ value: project('words', {}) }, { value: writer }, { value: helper }],
  })
  const unknown = findings.filter((one) => one.code === 'T1003').map((one) => one.message)
  assert.equal(unknown.length, 3)
  for (const word of ['ask', 'remember', 'forget'])
    assert.ok(
      unknown.some((one) => one.includes(word)),
      word,
    )
})
