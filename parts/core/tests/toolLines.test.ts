import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Type } from '../index.ts'
import {
  action,
  agent,
  change,
  choice,
  date,
  day,
  file,
  input,
  json,
  link,
  list,
  model,
  number,
  object,
  query,
  table,
  text,
  vector,
} from '../index.ts'
import { describe, toolLine, toolList, typeText } from '../internal.ts'

const orders = table('orders', {
  columns: { status: choice(['open', 'paid']), total: number(), note: text({ private: true, optional: true }) },
  access: { read: 'signedIn', add: 'signedIn', change: 'signedIn' },
})
const refunds = table('refunds', {
  columns: { order: link('orders'), amount: number() },
  access: { read: 'signedIn', add: 'signedIn' },
})
const myOrders = query('myOrders', {
  about: 'The orders of the person asking.',
  access: 'signedIn',
  input: { status: choice(['open', 'paid'], { optional: true }), limit: number({ optional: true }) },
  rows: orders.where({ status: input('status') }).limit(20),
})
const lateOrders = query('lateOrders', {
  about: 'The orders that are late.',
  access: 'signedIn',
  input: {},
  rows: orders.where({ status: 'open' }).limit(50),
})
const refund = action('refund', {
  about: 'Gives a customer their money back for one order.',
  access: 'signedIn',
  input: { order: link('orders'), amount: number({ optional: true }) },
  output: object({ refund: link('refunds') }),
  danger: 'ask',
  run: async () => ({ refund: 'r1' }),
})
const markPaid = change('markPaid', {
  about: 'Marks an order paid.',
  access: 'signedIn',
  input: { order: link('orders') },
  set: orders.change(input('order'), { status: 'paid' }),
})
const tally = action('tally', {
  about: 'Counts in code.',
  access: 'signedIn',
  input: {},
  run: async () => 1,
})
const writer = model('writer', { provider: 'mine', name: 'm-1', abilities: ['reply', 'tools'] })
const inner = agent('inner', {
  about: 'Answers from inside.',
  model: writer,
  instructions: 'You answer.',
  tools: [],
  access: 'signedIn',
  limits: { steps: 4, perRun: { calls: 10 } },
})
const helper = agent('helper', {
  model: writer,
  instructions: 'You help.',
  tools: [
    myOrders,
    lateOrders,
    refund,
    markPaid,
    tally,
    inner,
    { tool: myOrders, name: 'mine', about: 'My own orders.' },
  ],
  access: 'signedIn',
  limits: { steps: 4, perRun: { calls: 10 } },
})
const quiet = agent('quiet', {
  model: writer,
  instructions: 'You help quietly.',
  tools: [{ tool: refund, line: false }, myOrders],
  words: { gives: 'Answers {}.', reads: 'Looks at {}.' },
  access: 'signedIn',
  limits: { steps: 4, perRun: { calls: 10 } },
})

const { description } = describe({
  definitions: [orders, refunds, myOrders, lateOrders, refund, markPaid, tally, writer, inner, helper, quiet].map(
    (value) => ({
      value,
    }),
  ),
})

test('[27-17] typeText writes each row of its table: a text, a number, a choice, a link, a file, a vector, a list, an object and what may be nothing', () => {
  const written = (type: Type): string => typeText(type)
  assert.equal(written(text()), 'string')
  assert.deepEqual([written(number()), written(json())], ['number', 'any'])
  assert.equal(written(choice(['open', 'paid'])), "'open' | 'paid'")
  assert.equal(written(link('orders')), 'id of orders')
  assert.equal(written(file()), 'file id')
  assert.equal(written(vector({ size: 3 })), 'number[]')
  assert.equal(written(list(text())), 'string[]')
  assert.equal(written(list(choice(['a', 'b']))), "('a' | 'b')[]")
  assert.equal(
    written(object({ a: text(), b: number({ optional: true }), c: choice(['x'], { default: 'x' }), d: date() })),
    "{ a: string, b?: number, c?: 'x', d: date }",
  )
  assert.equal(written(object({})), '{}')
  assert.equal(written(day({ optional: true })), 'day or nothing')
})

test('[27-17] the line of a tool says what it gives, by the fields of the rows of a query, which tools give what it takes, what it reads and writes, that it sends, and that a person is asked, in that order', () => {
  assert.equal(
    toolLine(description, 'helper', 'myOrders'),
    "Gives { id: id of orders, createdAt: date, updatedAt: date, status: 'open' | 'paid', total: number }[]. Reads orders.",
  )
  assert.equal(
    toolLine(description, 'helper', 'refund'),
    'Gives { refund: id of refunds }. Takes order from myOrders, lateOrders, mine. Sends data out. A person is asked before this runs.',
  )
  // A tool that is code and states neither reads nor touches names no table, and one that states no output gives nothing that is known.
  assert.equal(toolLine(description, 'helper', 'tally'), 'Sends data out. A person is asked before this runs.')
  assert.equal(toolLine(description, 'helper', 'inner'), 'Gives { text: string }.')
  // A change written with set writes its table, and takes the order from the tools that give ids of orders.
  assert.match(
    toolLine(description, 'helper', 'markPaid'),
    /\. Takes order from myOrders, lateOrders, mine\. Writes orders\.$/,
  )
  // With no agent, for what MCP lists: no ask and no Takes.
  assert.equal(toolLine(description, undefined, 'refund'), 'Gives { refund: id of refunds }. Sends data out.')
  // An entry that states line false is told with the words of the ask alone; `words` gives other sentences.
  assert.equal(toolLine(description, 'quiet', 'refund'), 'A person is asked before this runs.')
  assert.match(toolLine(description, 'quiet', 'myOrders'), /^Answers \{ id: id of orders.*\}\[\]\. Looks at orders\.$/)
})

test('[27-17] the list holds two lines for each tool: its name, its input and its answer, then its sentence and its line with no Gives; name() for no input, and no arrow for an answer that is not known', () => {
  const { own, sources } = toolList(description, 'helper')
  const lines = own.split('\n')
  assert.equal(
    lines[0],
    "myOrders(status?: 'open' | 'paid', limit?: number) -> { id: id of orders, createdAt: date, updatedAt: date, status: 'open' | 'paid', total: number }[]",
  )
  assert.equal(lines[1], '  The orders of the person asking. Reads orders.')
  assert.ok(lines.includes('refund(order: id of orders, amount?: number) -> { refund: id of refunds }'), own)
  assert.ok(
    lines.includes(
      '  Gives a customer their money back for one order. Takes order from myOrders, lateOrders, mine. Sends data out. A person is asked before this runs.',
    ),
    own,
  )
  assert.ok(lines.includes('tally()'), 'no input, and no answer that is known')
  assert.ok(lines.includes('inner(message: string, files?: file id[]) -> { text: string }'), own)
  assert.ok(
    lines.some((line) => line.startsWith('mine(')),
    'an entry is told under its own name',
  )
  assert.ok(lines.includes('  My own orders. Reads orders.'), own)
  assert.equal(sources, '')
  // Handed the same, it writes the same bytes.
  assert.equal(toolList(description, 'helper').own, own)
})
