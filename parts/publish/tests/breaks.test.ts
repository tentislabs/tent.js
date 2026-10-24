import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Description } from '../../core/internal.ts'
import { breaks } from '../index.ts'

/** A description that holds the functions it is handed, and nothing else. */
const holding = (functions: Record<string, object>): Description =>
  Object({ app: { name: 'shop' }, project: {}, tables: {}, functions, flows: {}, screens: {}, components: {} })

const text = { kind: 'text' }
const open = { rule: 'signedIn' }

const offered = (o: object = {}): object => ({
  kind: 'query',
  form: 'plain',
  access: open,
  offer: ['api'],
  input: { order: { ...text, optional: true } },
  output: { kind: 'object', shape: { id: text, total: { kind: 'number' } } },
  ...o,
})

test('[40-16] breaks lists a function that is gone, an input that became required, an output that lost a field and a rule that became narrower', () => {
  const live = holding({ gone: offered(), stays: offered(), kept: offered({ offer: [] }) })
  const next = holding({
    stays: offered({
      access: { rule: 'role', role: 'staff' },
      input: { order: text, more: { kind: 'number' } },
      output: { kind: 'object', shape: { id: text } },
    }),
  })
  assert.deepEqual(
    breaks(live, next).map((one) => [one.change, one.name, (one.path ?? []).join('.')]),
    [
      ['removed', 'gone', ''],
      ['changed', 'stays', 'input.order'],
      ['changed', 'stays', 'input.more'],
      ['changed', 'stays', 'output.total'],
      ['changed', 'stays', 'access'],
    ],
  )
})

test('[40-16] breaks lists a function that is no longer offered to a door, an input whose type changed and a rule made with allow, and nothing for a rule that became wider', () => {
  const live = holding({
    api: offered({ offer: ['api', 'mcp'] }),
    typed: offered(),
    ruled: offered(),
    wider: offered({ access: { rule: 'role', role: 'staff' } }),
  })
  const next = holding({
    api: offered({ offer: ['api'] }),
    typed: offered({ input: { order: { kind: 'number', optional: true } } }),
    ruled: offered({ access: { rule: 'allow', module: 'm', export: 'e' } }),
    wider: offered(),
  })
  assert.deepEqual(
    breaks(live, next).map((one) => [one.name, (one.path ?? []).join('.')]),
    [
      ['api', 'offer'],
      ['typed', 'input.order'],
      ['ruled', 'access'],
    ],
  )
})

test('[40-16] breaks lists nothing for a deprecated function past its day, and the function that goes before its day', () => {
  const live = holding({ old: offered({ deprecated: '2026-01-01' }), soon: offered({ deprecated: '2099-01-01' }) })
  assert.deepEqual(
    breaks(live, holding({})).map((one) => one.name),
    ['soon'],
  )
})
