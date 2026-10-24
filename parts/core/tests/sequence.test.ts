import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { SequenceDoors } from '../internal.ts'
import { action, agent, choice, json, link, model, number, object, query, table, text } from '../index.ts'
import { checkSequence, describe, runBody, sequenceShape, walkSequence } from '../internal.ts'

const orders = table('orders', {
  columns: { status: choice(['open', 'paid']), total: number(), note: text({ optional: true }) },
  access: { read: 'signedIn' },
})
const refunds = table('refunds', { columns: { order: link('orders') }, access: { read: 'signedIn' } })
const myOrders = query('myOrders', {
  about: 'The orders of the person asking.',
  access: 'signedIn',
  input: { status: choice(['open', 'paid'], { optional: true }), limit: number({ optional: true }) },
  rows: orders.where({}).limit(50),
})
const refund = action('refund', {
  about: 'Gives the money back for one order.',
  access: 'signedIn',
  input: { order: link('orders') },
  output: object({ refund: link('refunds') }),
  danger: 'ask',
  run: async () => ({ refund: 'r1' }),
})
const mailReceipt = action('mailReceipt', {
  about: 'Mails the receipt of a refund.',
  access: 'signedIn',
  input: { order: link('orders'), refund: link('refunds') },
  output: text(),
  sends: false,
  run: async () => 'sent',
})
const mailAsking = action('mailAsking', {
  about: 'Mails the receipt, and asks first.',
  access: 'signedIn',
  input: { order: link('orders'), refund: link('refunds') },
  output: text(),
  danger: 'ask',
  run: async () => 'sent',
})
const lookUp = action('lookUp', {
  about: 'Looks anything up.',
  access: 'signedIn',
  input: {},
  output: json(),
  sends: false,
  run: async () => ({}),
})
const typed = model('typed', { provider: 'mine', name: 'm-1', abilities: ['reply', 'tools', 'typedAnswers'] })
const untyped = model('untyped', { provider: 'mine', name: 'm-2', abilities: ['reply', 'tools'] })
const limits = { steps: 8, perRun: { calls: 100 } }
const helper = agent('helper', {
  model: typed,
  instructions: 'You help.',
  tools: [myOrders, refund, mailReceipt, lookUp],
  sequence: true,
  access: 'signedIn',
  limits,
})
const asking = agent('asking', {
  model: untyped,
  instructions: 'You help and ask.',
  tools: [myOrders, refund, { tool: mailAsking, name: 'mailReceipt' }],
  sequence: true,
  access: 'signedIn',
  limits,
})

const { description } = describe({
  definitions: [orders, refunds, myOrders, refund, mailReceipt, mailAsking, lookUp, typed, untyped, helper, asking].map(
    (value) => ({ value }),
  ),
})

// The stored forms of a sequence, as the reader writes them.
const named = (...path: (string | number)[]) => ({ name: path })
const record = (...entries: [string, unknown][]) => ({ object: entries })
const called = (tool: string, input: unknown) => ({ await: { call: { tool }, args: [input] } })
const arrow = (name: string, ...body: object[]) => ({ arrow: [name], do: body, waits: true })

// The sequence of the work order: the open orders read, the late ones refunded and mailed one after another.
const late = [
  { const: 'open', value: called('myOrders', record(['status', 'open'])), line: 1 },
  {
    const: 'late',
    value: { fn: 'where', args: [named('open'), record(['total', record(['above', 100])])] },
    line: 2,
  },
  {
    for: 'o',
    of: named('late'),
    do: [
      { const: 'r', value: called('refund', record(['order', named('o', 'id')])), line: 4 },
      {
        do: called('mailReceipt', record(['order', named('o', 'id')], ['refund', named('r', 'refund')])),
        line: 5,
      },
    ],
    line: 3,
  },
  { return: record(['refunded', named('late', 'length')]), line: 7 },
]

const rows = [
  { id: 'o1', status: 'open', total: 50 },
  { id: 'o2', status: 'open', total: 150 },
  { id: 'o3', status: 'open', total: 250 },
  { id: 'o4', status: 'open', total: 350 },
]

/** Doors that answer each tool as the work order's shop would, and write down each place they were called at. */
function doorsOf(fails?: string): { doors: SequenceDoors; at: string[] } {
  const at: string[] = []
  const doors: SequenceDoors = {
    async tool(name, input, place) {
      at.push(`${place.join('.')} ${name}`)
      const order = String(Reflect.get(Object(input), 'order'))
      if (name === 'refund' && order === fails) throw Object.assign(new Error('The bank said no.'), { code: 'no-bank' })
      if (name === 'myOrders') return rows
      return name === 'refund' ? { refund: `r-${order}` } : 'sent'
    },
    async fill(_shape, _prompt, place) {
      at.push(`${place.join('.')} fill`)
      return { late: true }
    },
    all: (list, entry) => Promise.all(list.map((_, i) => entry(i))),
  }
  return { doors, at }
}

test('[27-18] runBody carries a sequence out through its doors: one counter over the sequence for each call, a fill and an all, and inside an all the place of the entry and a counter of its own', async () => {
  const { doors, at } = doorsOf()
  assert.deepEqual(await runBody(late, {}, { sequence: doors }), { refunded: 3 })
  assert.deepEqual(at, [
    '1 myOrders',
    '2 refund',
    '3 mailReceipt',
    '4 refund',
    '5 mailReceipt',
    '6 refund',
    '7 mailReceipt',
  ])
  const together = doorsOf()
  const body = [
    { const: 'open', value: called('myOrders', record()) },
    {
      const: 'made',
      value: {
        await: {
          fn: 'all',
          args: [
            named('open'),
            arrow(
              'o',
              { const: 'r', value: called('refund', record(['order', named('o', 'id')])) },
              {
                return: {
                  await: {
                    fn: 'all',
                    args: [[1, 2], arrow('n', { return: called('mailReceipt', record(['order', named('o', 'id')])) })],
                  },
                },
              },
            ),
          ],
        },
      },
    },
    { const: 'judged', value: { await: { fn: 'fill', args: [{ type: { kind: 'boolean' } }, 'Is it late?'] } } },
    { return: named('made', 'length') },
  ]
  assert.equal(await runBody(body, {}, { sequence: together.doors }), 4)
  assert.deepEqual(together.at.slice(0, 1), ['1 myOrders'])
  assert.ok(together.at.includes('2.1.1 refund'))
  assert.ok(together.at.includes('2.4.1 refund'))
  assert.ok(together.at.includes('2.3.2.2.1 mailReceipt'), together.at.join(', '))
  assert.equal(together.at.at(-1), '3 fill')
})

test('[27-18] all with goOn answers a failed entry as { failed: true, code, message } and runs the others on; without it the sequence fails with the error of the entry', async () => {
  const each = (goOn: boolean) => [
    { const: 'open', value: called('myOrders', record()) },
    {
      return: {
        await: {
          fn: 'all',
          args: [
            named('open'),
            arrow('o', { return: called('refund', record(['order', named('o', 'id')])) }),
            ...(goOn ? [record(['goOn', true])] : []),
          ],
        },
      },
    },
  ]
  const gone = await runBody(each(true), {}, { sequence: doorsOf('o2').doors })
  assert.deepEqual(gone, [
    { refund: 'r-o1' },
    { failed: true, code: 'no-bank', message: 'The bank said no.' },
    { refund: 'r-o3' },
    { refund: 'r-o4' },
  ])
  await assert.rejects(async () => runBody(each(false), {}, { sequence: doorsOf('o2').doors }), { code: 'no-bank' })
})

test('[27-18] sequenceShape holds a read sequence and refuses what a sequence may not hold: a named value, a call of a definition, a chain, a setting, now(), and a type outside fill', () => {
  assert.deepEqual(sequenceShape(late), [])
  const missed = (one: object) => sequenceShape([{ return: one }])
  assert.ok(missed({ named: { top: 'x' }, value: 1 }).length)
  assert.ok(missed({ call: { function: 'myOrders' }, args: [] }).length)
  assert.ok(missed({ plan: { db: 'orders' }, then: [{ all: [] }] }).length)
  assert.ok(missed({ setting: 'shopName' }).length)
  assert.ok(missed({ fn: 'now', args: [] }).length)
  assert.ok(missed({ type: { kind: 'text' } }).length)
  assert.deepEqual(missed({ await: { fn: 'fill', args: [{ type: { kind: 'text' } }, 'Why?'] } }), [])
})

/** The findings of the check of one sequence of the helper, as code and message. */
const checked = (body: object[], agentName = 'helper') =>
  checkSequence(description, agentName, body).map((one) => `${one.code} ${one.message}`)

test('[27-18] checkSequence refuses what is sure to fail, each T7121 with its line and the two lines of the tool: a field the answer lacks, a missing field, a field the tool does not take, a text for a number, and a text that is no value of a choice', () => {
  assert.deepEqual(checked(late), [])
  const looped = (statement: object) => [
    { const: 'open', value: called('myOrders', record()), line: 1 },
    { for: 'o', of: named('open'), do: [{ ...statement, line: 3 }], line: 2 },
  ]
  const [colour] = checked(looped({ return: named('o', 'colour') }))
  assert.match(colour ?? '', /^T7121 .*`colour`.*line 3/)
  const [missing] = checked(looped({ do: called('refund', record()) }))
  assert.match(missing ?? '', /^T7121 .*`order`.*line 3/)
  assert.ok(missing?.includes('\nrefund(order: id of orders) -> { refund: id of refunds }\n  '), missing)
  const [more] = checked(looped({ do: called('refund', record(['order', named('o', 'id')], ['amount', 5])) }))
  assert.match(more ?? '', /^T7121 .*`amount`/)
  const [wrongKind] = checked([{ return: called('myOrders', record(['limit', 'ten'])), line: 1 }])
  assert.match(wrongKind ?? '', /^T7121 .*`limit`.*line 1/)
  const [noValue] = checked([{ return: called('myOrders', record(['status', 'late'])), line: 1 }])
  assert.match(noValue ?? '', /^T7121 .*`status`/)
})

test('[27-18] checkSequence says nothing of a value that may be nothing, length of a list, a read into a json answer and a place of a list; a name that is none of the table is T7121, and so is fill on a model without typedAnswers', () => {
  const quiet = [
    { const: 'open', value: called('myOrders', record()), line: 1 },
    { const: 'first', value: named('open', 0), line: 2 },
    { const: 'note', value: named('first', 'note'), line: 3 },
    { const: 'found', value: called('lookUp', record()), line: 4 },
    { return: record(['n', named('open', 'length')], ['deep', named('found', 'a', 'b')]), line: 5 },
  ]
  assert.deepEqual(checked(quiet), [])
  const [none] = checked([{ return: called('nothing', record()), line: 1 }])
  assert.match(none ?? '', /^T7121 .*`nothing`/)
  const fill = [{ return: { await: { fn: 'fill', args: [{ type: { kind: 'boolean' } }, 'Late?'] } }, line: 1 }]
  assert.deepEqual(checked(fill), [])
  assert.match(checked(fill, 'asking')[0] ?? '', /^T7121 .*`fill`/)
})

test('[27-18] walkSequence lists the calls whose input is known, with the names of their steps and whether they ask, passes over one whose input is not known, and says more', () => {
  const read = { 'tool 1.1.1 myOrders': rows }
  const first = walkSequence(description, 'helper', late, read, { at: [1, 1] })
  assert.deepEqual(first.calls, [
    { step: 'tool 1.1.2 refund', tool: 'refund', input: { order: 'o2' }, asks: true },
    { step: 'tool 1.1.4 refund', tool: 'refund', input: { order: 'o3' }, asks: true },
    { step: 'tool 1.1.6 refund', tool: 'refund', input: { order: 'o4' }, asks: true },
  ])
  assert.equal(first.more, true)
  const refunded = {
    ...read,
    'tool 1.1.2 refund': { refund: 'r2' },
    'tool 1.1.4 refund': { refund: 'r3' },
    'tool 1.1.6 refund': { refund: 'r4' },
  }
  const then = walkSequence(description, 'helper', late, refunded, { at: [1, 1] })
  assert.deepEqual(
    then.calls.map((one) => [one.step, one.asks]),
    [
      ['tool 1.1.3 mailReceipt', false],
      ['tool 1.1.5 mailReceipt', false],
      ['tool 1.1.7 mailReceipt', false],
    ],
  )
  assert.equal(then.more, false)
  assert.deepEqual(
    walkSequence(description, 'asking', late, refunded, { at: [1, 1] }).calls.map((one) => one.asks),
    [true, true, true],
  )
  // Nothing saved: the read is listed, and the repeat over what it gives is not known.
  const fresh = walkSequence(description, 'helper', late, {}, { at: [2, 1] })
  assert.deepEqual(fresh.calls, [
    { step: 'tool 2.1.1 myOrders', tool: 'myOrders', input: { status: 'open' }, asks: false },
  ])
  assert.equal(fresh.more, true)
  const agreed = walkSequence(description, 'helper', late, read, {
    at: [1, 1],
    agreed: [{ step: 'tool 1.1.2 refund', input: { order: 'o2' } }],
  })
  assert.equal(agreed.calls[0]?.agreed, true)
  assert.equal(agreed.calls[1]?.agreed, undefined)
})

test('[27-18] the walk lists the input of a call with every key the model wrote, `__proto__` among them, as the run makes it', () => {
  const written = [{ do: called('lookUp', record(['__proto__', 'x'], ['order', 'o1'])), line: 1 }]
  const { calls } = walkSequence(description, 'helper', written, {}, { at: [1, 1] })
  assert.deepEqual(Object.keys(Object(calls[0]?.input)), ['__proto__', 'order'])
})

test('[27-18] the walk ends with more at a choice whose test is not known, walks the entries of an all one by one, stays within one entry where told, and ends where its tick throws', () => {
  const chosen = [
    { const: 'r', value: called('refund', record(['order', 'o1'])), line: 1 },
    { if: named('r', 'refund'), then: [{ do: called('mailReceipt', record(['order', 'o1'])) }], line: 2 },
  ]
  const walked = walkSequence(description, 'helper', chosen, {}, { at: [1, 1] })
  assert.deepEqual(
    walked.calls.map((one) => one.step),
    ['tool 1.1.1 refund'],
  )
  assert.equal(walked.more, true)
  const together = [
    { const: 'open', value: called('myOrders', record()), line: 1 },
    {
      return: {
        await: {
          fn: 'all',
          args: [named('open'), arrow('o', { return: called('refund', record(['order', named('o', 'id')])) })],
        },
      },
      line: 2,
    },
  ]
  const read = { 'tool 1.1.1 myOrders': rows.slice(0, 2) }
  const all = walkSequence(description, 'helper', together, read, { at: [1, 1] })
  assert.deepEqual(
    all.calls.map((one) => one.step),
    ['tool 1.1.2.1.1 refund', 'tool 1.1.2.2.1 refund'],
  )
  assert.equal(all.more, false)
  const within = walkSequence(description, 'helper', together, read, { at: [1, 1], within: [2, 2] })
  assert.deepEqual(
    within.calls.map((one) => one.step),
    ['tool 1.1.2.2.1 refund'],
  )
  let ticks = 0
  const cut = walkSequence(description, 'helper', late, read, {
    at: [1, 1],
    tick: () => {
      if (++ticks > 3) throw new Error('past the pass')
    },
  })
  assert.equal(cut.more, true)
})
