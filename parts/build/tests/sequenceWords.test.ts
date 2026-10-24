import assert from 'node:assert/strict'
import test from 'node:test'
import { readBody } from '../index.ts'

const tools = ['myOrders', 'refund']

/** What the reader says of a text that it refuses. */
function why(text: string): string {
  const made = readBody(text, { tools, fill: false })
  assert.ok('why' in made, `${text} is refused`)
  return made.why
}

test('[27-18@9a] the reader of a sequence names what it refused and how it is written, so that a model mends it at once: a call with its fields as values, two inputs, a method, and a name that is worked out', () => {
  assert.match(why("refund('o1')"), /`refund`.*one record of its fields.*refund\(\{/)
  assert.match(why("refund({ order: 'o1' }, { amount: 2 })"), /`refund`.*2 values.*one record of its fields/)
  assert.match(why('const open = myOrders({})\nopen.push(1)'), /`\.push`.*no method.*each\(/)
  assert.match(why("const name = 'refund'\nreturn call(name, {})"), /worked out.*call\('refund'/)
  // A call with one record, and one with a name that holds a record, are read.
  assert.ok(
    'body' in readBody("const input = { order: 'o1' }\nrefund(input)\nrefund({ order: 'o2' })", { tools, fill: false }),
  )
})
