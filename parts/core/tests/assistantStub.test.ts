import assert from 'node:assert/strict'
import { test } from 'node:test'
import { agent, model, project, secret } from '../index.ts'
import { describe, stubOf } from '../internal.ts'

test('[31-1] the stub of an agent: its name, its kind, the input types of a start, and its four members, with nothing of a rule or of its model', () => {
  const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('KEY') })
  const made = describe({
    definitions: [
      { value: project('shop', {}) },
      { value: writer },
      {
        value: agent('helper', {
          about: 'Helps',
          model: writer,
          instructions: 'You help.',
          tools: [],
          access: 'signedIn',
          limits: { steps: 4, perRun: { calls: 10 } },
        }),
      },
    ],
  })
  const optionalText = { kind: 'text', optional: true }
  const optionalCheck = { required: false, type: optionalText }
  const ask = {
    run: { kind: 'text' },
    step: { kind: 'text' },
    repeat: { kind: 'number', optional: true },
    n: { kind: 'number', optional: true },
  }
  const askChecks = {
    run: { required: true, type: { kind: 'text' } },
    step: { required: true, type: { kind: 'text' } },
    repeat: { required: false, type: { kind: 'number', optional: true } },
    n: { required: false, type: { kind: 'number', optional: true } },
  }
  assert.deepEqual(stubOf(made.description, 'helper'), {
    definition: 'helper',
    kind: 'agent',
    input: {
      message: { kind: 'text', lines: 'many', optional: true },
      thread: optionalText,
      files: { kind: 'list', of: { kind: 'file' }, optional: true },
      audio: { kind: 'file', optional: true },
      speak: { kind: 'boolean', optional: true },
    },
    // What a form checks of a start, made of the same types: every field may be left out.
    checks: {
      message: { required: false, type: { kind: 'text', lines: 'many', optional: true } },
      thread: { required: false, type: optionalText },
      files: { required: false, type: { kind: 'list', of: { kind: 'file' }, optional: true } },
      audio: { required: false, type: { kind: 'file', optional: true } },
      speak: { required: false, type: { kind: 'boolean', optional: true } },
    },
    working: {
      definition: 'helper.working',
      kind: 'query',
      input: { thread: optionalText, run: optionalText },
      checks: { thread: optionalCheck, run: optionalCheck },
      live: true,
    },
    // By the ruling that a question is a wait, `approve` carries the answer to one as its `data`.
    approve: {
      definition: 'helper.approve',
      kind: 'action',
      input: { ...ask, data: { kind: 'json', optional: true } },
      checks: { ...askChecks, data: { required: false, type: { kind: 'json', optional: true } } },
    },
    refuse: { definition: 'helper.refuse', kind: 'action', input: ask, checks: askChecks },
    stop: {
      definition: 'helper.stop',
      kind: 'action',
      input: { run: optionalText, thread: optionalText },
      checks: { run: optionalCheck, thread: optionalCheck },
    },
  })
  // A member named by its own name is the same record.
  assert.deepEqual(stubOf(made.description, 'helper.approve'), {
    definition: 'helper.approve',
    kind: 'action',
    input: { ...ask, data: { kind: 'json', optional: true } },
    checks: { ...askChecks, data: { required: false, type: { kind: 'json', optional: true } } },
  })
  const all = JSON.stringify(stubOf(made.description, 'helper'))
  for (const word of ['access', 'signedIn', 'instructions', 'writer', 'model'])
    assert.ok(!all.includes(`"${word}"`), word)
})
