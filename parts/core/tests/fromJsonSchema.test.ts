import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fromJsonSchema } from '../internal.ts'

test('[27-17] a schema that a model or an outside server wrote is read with each field under the name it writes, `__proto__` among them, and one nested past what is stored is json', () => {
  const read = fromJsonSchema(
    JSON.parse('{"type":"object","properties":{"__proto__":{"type":"string"},"n":{"type":"number"}},"required":["n"]}'),
  )
  assert.equal(read.kind, 'object')
  assert.deepEqual(Object.keys(read.kind === 'object' ? read.shape : {}), ['__proto__', 'n'])
  // A hundred thousand lists inside each other, as a text of JSON can hold them.
  const deep = JSON.parse(`${'{"type":"array","items":'.repeat(100_000)}{"type":"string"}${'}'.repeat(100_000)}`)
  assert.deepEqual(fromJsonSchema(deep), { kind: 'json' })
})
