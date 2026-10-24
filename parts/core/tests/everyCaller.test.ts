import assert from 'node:assert/strict'
import { test } from 'node:test'
import { agent, count, link, model, number, project, query, role, table, text } from '../index.ts'
import { answerOf, describe, openApiOf, toJsonSchema, toolLine } from '../internal.ts'

const desk = project('desk', { title: 'Desk' })
const staff = table('staff', {
  columns: { name: text(), salary: number({ read: role('hr') }), bonus: number({ optional: true, read: 'owner' }) },
  access: { read: 'signedIn' },
})
const orders = table('orders', {
  columns: { status: text(), customer: link('customers') },
  access: { read: 'signedIn' },
})
const customers = table('customers', {
  columns: { name: text(), openOrders: number({ from: count({ of: orders, by: 'customer' }) }) },
  access: { read: 'signedIn' },
})
const allStaff = query('allStaff', {
  about: 'Every person of the staff.',
  offer: ['api'],
  access: 'signedIn',
  input: {},
  rows: staff.oldest('createdAt').limit(100),
})
const allCustomers = query('allCustomers', {
  about: 'Every customer.',
  access: 'signedIn',
  input: {},
  rows: customers.oldest('createdAt').limit(100),
})
const writer = model('writer', { provider: 'mine', name: 'm-1', abilities: ['reply', 'tools'] })
const helper = agent('helper', {
  model: writer,
  instructions: 'You help.',
  tools: [allStaff, allCustomers],
  access: 'signedIn',
  limits: { steps: 4, perRun: { calls: 10 } },
})
const { description, findings } = describe({
  definitions: [desk, staff, orders, customers, allStaff, allCustomers, writer, helper].map((value) => ({ value })),
})

/** The fields of a row of an answer as a JSON schema gives them, and those it requires. */
function rowSchema(schema: unknown): { fields: string[]; required: string[] } {
  const items: Record<string, unknown> = Object(Reflect.get(Object(schema), 'items'))
  const required: unknown = items.required
  return {
    fields: Object.keys(Object(items.properties)).sort(),
    required: (Array.isArray(required) ? required.map(String) : []).sort(),
  }
}

test('[45-16] a column with a read rule is optional in the line of a tool, which says who reads it, in the schema an MCP tool gives, and in the description of the API', () => {
  assert.deepEqual(
    findings.filter((one) => one.level === 'error'),
    [],
  )
  const line = toolLine(description, 'helper', 'allStaff')
  assert.match(line, /salary\?: number \(read by hr\)/)
  assert.match(line, /bonus\?: number \(read by its owner\)/)
  assert.match(line, /name: string/)
  // The schema of what the tool answers, as an MCP tool and the API give it.
  const answer = answerOf(description, 'allStaff')
  assert.ok(answer)
  const mcp = rowSchema(toJsonSchema(answer))
  assert.ok(mcp.fields.includes('salary'))
  assert.equal(mcp.required.includes('salary'), false, 'an MCP tool gives the salary as optional')
  assert.ok(mcp.required.includes('name'))
  const api = Object(openApiOf(description))
  const schema = Object(api.paths['/allStaff']?.get ?? api.paths['/allStaff']?.post).responses['200'].content[
    'application/json'
  ].schema
  assert.equal(rowSchema(schema).required.includes('salary'), false, 'the API gives the salary as optional')
})

test('[45-16] a kept count is a plain field of its row in the line of a tool', () => {
  assert.match(toolLine(description, 'helper', 'allCustomers'), /openOrders\??: number/)
})
