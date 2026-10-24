import assert from 'node:assert/strict'
import test from 'node:test'
import { readBody } from '../index.ts'

const tools = ['myOrders', 'refund', 'mailReceipt', 'taskBoard.listBoards']

// The sequence of the work order: the late orders refunded and mailed, one after another.
const lateOrders = [
  "const open = myOrders({ status: 'open' })",
  'const late = where(open, { total: { above: 100 } })',
  'for (const o of late) {',
  '  const r = refund({ order: o.id })',
  '  mailReceipt({ order: o.id, refund: r.refund })',
  '}',
  'return { refunded: late.length }',
].join('\n')

/** The stored form of a text that reads, or the refusal it was given. */
function read(text: string, fill = false): object[] {
  const made = readBody(text, { tools, fill })
  if (!('body' in made)) throw new Error(`refused: ${made.why} on line ${made.line}`)
  return made.body
}

test('[27-18] a sequence is read into the stored form of a body: a call of a tool is { call: { tool }, args }, stored as awaited, and each statement keeps its line from the first line of run', () => {
  const body = read(lateOrders)
  assert.deepEqual(body[0], {
    const: 'open',
    value: { await: { call: { tool: 'myOrders' }, args: [{ object: [['status', 'open']] }] } },
    line: 1,
  })
  assert.deepEqual(Object(body[1]).line, 2)
  const repeat = Object(body[2])
  assert.equal(repeat.for, 'o')
  assert.equal(repeat.line, 3)
  assert.deepEqual(repeat.do[0].line, 4)
  assert.deepEqual(repeat.do[1], {
    do: {
      await: {
        call: { tool: 'mailReceipt' },
        args: [
          {
            object: [
              ['order', { name: ['o', 'id'] }],
              ['refund', { name: ['r', 'refund'] }],
            ],
          },
        ],
      },
    },
    line: 5,
  })
  assert.deepEqual(body[3], {
    return: { object: [['refunded', { name: ['late', 'length'] }]] },
    line: 7,
  })
})

test('[27-18] call(name, input) is the same call, a dotted name is one name where the agent holds that tool, an await that was written is kept once, and all, fill and an each whose arrow calls a tool wait, with the arrow marked as one that waits', () => {
  const [byName, dotted, written, together] = read(
    [
      "const a = call('refund', { order: 'o1' })",
      'const b = taskBoard.listBoards({})',
      "const c = await refund({ order: 'o2' })",
      'const d = all(b, (x) => refund({ order: x.id }), { goOn: true })',
    ].join('\n'),
  )
  assert.deepEqual(Object(byName).value, {
    await: { call: { tool: 'refund' }, args: [{ object: [['order', 'o1']] }] },
  })
  assert.deepEqual(Object(dotted).value, { await: { call: { tool: 'taskBoard.listBoards' }, args: [{ object: [] }] } })
  assert.deepEqual(Object(written).value, {
    await: { call: { tool: 'refund' }, args: [{ object: [['order', 'o2']] }] },
  })
  const all = Object(together).value.await
  assert.equal(all.fn, 'all')
  assert.equal(all.args[1].waits, true)
  assert.deepEqual(all.args[2], { object: [['goOn', true]] })
  const [each] = read('return each(myOrders({}), (o) => refund({ order: o.id }))')
  assert.equal(Object(each).return.await.fn, 'each')
  const [filled] = read("return fill(object({ late: boolean() }), 'Is it late?')", true)
  assert.deepEqual(Object(filled).return.await, {
    fn: 'fill',
    args: [{ type: { kind: 'object', shape: { late: { kind: 'boolean' } } } }, 'Is it late?'],
  })
})

test('[27-18] what a sequence may not hold is refused with the first such thing and its line: let, a method of a list, process, db, now(), a setting, start, a value drawn at random, a name worked out for call, fill where the model has no typedAnswers, and text that is no code', () => {
  const refused = (text: string, fill = false) => readBody(text, { tools, fill })
  const cases: [string, RegExp, number][] = [
    ['const a = 1\nlet b = 2', /`let`/, 2],
    ['const open = myOrders({})\nopen.push(1)', /method/, 2],
    ['return process.env', /`process`/, 1],
    ['\n\nreturn db.orders.all()', /`db`/, 3],
    ['return now()', /`now`/, 1],
    ['return settings.shop', /`settings`/, 1],
    ["start('tidy', {})", /`start`/, 1],
    ['return token()', /`token`/, 1],
    ['const name = "refund"\nreturn call(name, {})', /worked out/, 2],
    ["return fill(text(), 'Why?')", /`fill`/, 1],
    ['return myOrders({}', /./, 1],
    ['})\n(() => {', /./, 1],
  ]
  for (const [text, why, line] of cases) {
    const made = refused(text)
    assert.ok('why' in made, `${text} is refused`)
    assert.match(made.why, why, text)
    assert.equal(made.line, line, text)
  }
})
