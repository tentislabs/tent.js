import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { inspect } from 'node:util'
import { TentError } from '../index.ts'
import { runBody, setRuntime, valueOf } from '../internal.ts'
import { cases } from './bodies-cases.ts'
import type { Case, Seen } from './bodies-world.ts'
import { folder, oneRun, sameFailure, testRuntime } from './bodies-world.ts'

afterEach(() => setRuntime(null))

/** A value as text, with every key where it stands: two records are the same only with their keys in the same order. */
const shown = (value: unknown): string =>
  inspect(value, { depth: null, breakLength: Infinity, maxArrayLength: null, maxStringLength: null })

const stored: Record<string, object[]> = JSON.parse(readFileSync(join(folder, 'stored.json'), 'utf8'))

/** A definition of a body file, as far as the test reads it. */
type Read = { definition: string; kind: string; options: { run(handed: object): unknown; system?: string } }

const isRead = (value: unknown): value is Read =>
  (typeof value === 'object' || typeof value === 'function') &&
  value !== null &&
  'definition' in value &&
  'options' in value

/** Loads the twenty body files as code, and answers the definition of each by its name. */
async function definitions(): Promise<Record<string, Read>> {
  const found: Record<string, Read> = {}
  for (const file of readdirSync(folder)
    .filter((name) => /^\d\d-.*\.ts$/.test(name))
    .sort()) {
    const made: Record<string, unknown> = await import(pathToFileURL(join(folder, file)).href)
    for (const [name, value] of Object.entries(made)) if (isRead(value)) found[name] = value
  }
  return found
}

/** Whether a stored form holds an `await` of its own, outside every arrow. */
function holdsAwait(node: unknown): boolean {
  if (typeof node !== 'object' || node === null) return false
  if (Array.isArray(node)) return node.some(holdsAwait)
  return 'await' in node || (!('arrow' in node) && Object.values(node).some(holdsAwait))
}

/** Runs a stored body with a case of its own, in a query, and answers what was seen. */
const byHand = (body: object[], c: Case, o: { tick?(): void } = {}): Promise<Seen> =>
  oneRun('query', false, c, (handed) => runBody(body, handed, o))

test('[12-2a] runBody: the twenty bodies answer, call and fail from their stored form as the same text does as code', async () => {
  const read = await definitions()
  assert.deepEqual(Object.keys(read).sort(), Object.keys(stored).sort())
  assert.equal(Object.keys(stored).length, 20)
  let ran = 0
  let builtToFail = 0
  for (const [name, definition] of Object.entries(read)) {
    const system = definition.options.system !== undefined
    assert.ok(cases[name]?.length, `the body ${name} has no case`)
    for (const c of cases[name]) {
      const asCode = await oneRun(definition.kind, system, c, (handed) => definition.options.run(handed))
      const fromStored = await oneRun(definition.kind, system, c, (handed) => runBody(stored[name], handed))
      const where = `${name}, ${c.name}`
      // The calls and their order, with the keys of every record of a call in the order of the code, and a
      // definition that is handed on counted by its name.
      assert.equal(shown(fromStored.calls), shown(asCode.calls), `${where}: the calls`)
      assert.equal(
        fromStored.ok,
        asCode.ok,
        `${where}: one of the two failed: ${shown(asCode.failure ?? fromStored.failure)}`,
      )
      assert.equal(asCode.ok, c.fails !== true, `${where}: the text as code ${asCode.ok ? 'did not fail' : 'failed'}`)
      if (asCode.ok) assert.equal(shown(fromStored.answer), shown(asCode.answer), `${where}: the answer`)
      else
        assert.ok(
          sameFailure(asCode.failure, fromStored.failure),
          `${where}: ${shown([asCode.failure, fromStored.failure])}`,
        )
      // A body with no `await` answers at once.
      if (!holdsAwait(stored[name])) assert.ok(fromStored.atOnce, `${where}: a body with no await answered a promise`)
      else assert.ok(!fromStored.atOnce, `${where}: a body with an await answered at once`)
      ran++
      if (c.fails) builtToFail++
    }
  }
  assert.ok(ran >= 45 && builtToFail >= 10, `${ran} cases, ${builtToFail} built to fail`)
})

test('[12-2a] runBody: a return ends a body or an arrow, a fail arrives as itself, and a choice and a list with awaits call what the text calls', async () => {
  // A `return` inside a repeat ends the body, and one inside an arrow ends the arrow.
  const walk = [
    {
      for: 'n',
      of: { name: ['input', 'list'] },
      do: [{ if: { op: '>', left: { name: ['n'] }, right: 1 }, then: [{ return: { name: ['n'] } }] }],
    },
    { return: 'none' },
  ]
  assert.equal((await byHand(walk, { name: 'a', input: { list: [1, 2, 3] } })).answer, 2)
  assert.equal((await byHand(walk, { name: 'b', input: { list: [0, 1] } })).answer, 'none')
  const inArrow = [
    {
      return: {
        fn: 'each',
        args: [
          { name: ['input', 'list'] },
          {
            arrow: ['n'],
            do: [
              { if: { op: '>', left: { name: ['n'] }, right: 1 }, then: [{ return: 'big' }] },
              { return: { name: ['n'] } },
            ],
          },
        ],
      },
    },
  ]
  assert.deepEqual((await byHand(inArrow, { name: 'c', input: { list: [1, 2, 3] } })).answer, [1, 'big', 'big'])

  // A `fail` inside one arrives as the same error, with its code and its words.
  const failing = [
    {
      do: {
        fn: 'fail',
        args: ['not-open', 'That order is not open.', { object: [['fields', { object: [['order', 'closed']] }]] }],
      },
    },
  ]
  const failed = await byHand(failing, { name: 'd', input: {} })
  assert.ok(failed.failure instanceof TentError)
  assert.deepEqual(
    [failed.failure.code, failed.failure.name, failed.failure.message, failed.failure.fields],
    ['not-open', 'not-open', 'That order is not open.', { order: 'closed' }],
  )

  // Any other failure is an error of the same kind at the same statement, after the same calls.
  const reads = [
    { do: { call: { builtin: 'log.info' }, args: ['before'] } },
    { const: 'x', value: { name: ['input', 'none', 'deeper'] } },
    { do: { call: { builtin: 'log.info' }, args: ['after'] } },
  ]
  const broke = await byHand(reads, { name: 'e', input: {} })
  assert.ok(broke.failure instanceof TypeError)
  assert.deepEqual(broke.calls, [['handle', 'log.info', ['before']]])

  // A choice with an awaited call on each side makes the call of the side that is taken and no other.
  const call = (name: string) => ({ await: { call: { function: name }, args: [{ object: [['order', 'o1']] }] } })
  const choice = [{ return: { if: { name: ['input', 'fast'] }, then: call('sendReceipt'), else: call('markPaid') } }]
  const taken = async (fast: boolean) =>
    (await oneRun('action', false, { name: 'f', input: { fast } }, (handed) => runBody(choice, handed))).calls
  assert.deepEqual(await taken(true), [['call', 'sendReceipt', [{ order: 'o1' }]]])
  assert.deepEqual(await taken(false), [['call', 'markPaid', [{ order: 'o1' }]]])

  // A list of one plain call and one awaited call makes them in the order they are written.
  const both = [
    {
      return: [
        { call: { function: 'orderTotal' }, args: [] },
        call('sendReceipt'),
        { call: { function: 'markPaid' }, args: [{ object: [['order', 'o2']] }] },
      ],
    },
  ]
  const made = await oneRun('action', false, { name: 'g', input: {} }, (handed) => runBody(both, handed))
  assert.deepEqual(
    made.calls.map((one) => one[1]),
    ['orderTotal', 'sendReceipt', 'markPaid'],
  )
  assert.deepEqual(made.answer, [120, { sent: true, order: 'o1' }, { id: 'o2', status: 'paid' }])
  assert.equal(made.atOnce, false)

  // `&&`, `||` and `??` work out only the side that JavaScript takes.
  const sides = (op: string, left: unknown) => [
    { return: { op, left, right: { call: { function: 'orderTotal' }, args: [] } } },
  ]
  for (const [op, left, calls] of [
    ['&&', false, 0],
    ['&&', true, 1],
    ['||', 'x', 0],
    ['||', '', 1],
    ['??', 0, 0],
    ['??', null, 1],
  ] as const)
    assert.equal((await byHand(sides(op, left), { name: op, input: {} })).calls.length, calls, `${op} with ${left}`)
})

test('[12-2a] runBody: a top-level const is a new list at each read, and a named value answers its value whatever its name', async () => {
  // The one difference that a test can see: as code the same list is one thing, and from the stored form it is two.
  const named = { named: { top: 'DEFAULTS' }, value: { object: [['limit', 20]] } }
  const twice = [
    {
      return: {
        object: [
          ['limit', { read: named, path: ['limit'] }],
          ['same', { op: '===', left: named, right: named }],
        ],
      },
    },
  ]
  assert.deepEqual((await byHand(twice, { name: 'a', input: {} })).answer, { limit: 20, same: false })
  const DEFAULTS = { limit: 20 }
  const asCode = () => ({ limit: DEFAULTS.limit, same: DEFAULTS === Reflect.get({ DEFAULTS }, 'DEFAULTS') })
  assert.deepEqual(asCode(), { limit: 20, same: true })

  const values = [
    {
      return: [
        { named: { top: 'NOWHERE' }, value: 'a text' },
        { named: { project: ['options', 'nowhere'] }, value: [1, 2] },
        {
          named: { textFile: 'nowhere.md', as: 'nowhere' },
          value: {
            object: [
              ['b', 1],
              ['a', [true]],
            ],
          },
        },
      ],
    },
  ]
  const answered = await byHand(values, { name: 'b', input: {} })
  assert.equal(shown(answered.answer), shown(['a text', [1, 2], { b: 1, a: [true] }]))
  assert.deepEqual(answered.calls, [])
})

test('[12-2a] runBody: each waits only where the call may, tick is asked for every statement and entry, and a chain or a name that nothing handed is refused', async () => {
  // An `each` whose arrow answers a promise takes its entries one after another where the call may wait.
  const waits = [
    {
      return: {
        fn: 'each',
        args: [
          { name: ['input', 'orders'] },
          {
            arrow: ['order'],
            do: [
              { return: { call: { function: 'sendReceipt' }, args: [{ object: [['order', { name: ['order'] }]] }] } },
            ],
          },
        ],
      },
    },
  ]
  const order = { name: 'a', input: { orders: ['o1', 'o2', 'o3'] } }
  const may = await oneRun('action', false, order, (handed) => runBody(waits, handed))
  assert.deepEqual(
    may.answer,
    ['o1', 'o2', 'o3'].map((id) => ({ sent: true, order: id })),
  )
  assert.deepEqual(
    may.calls.map((one) => one[1]),
    ['sendReceipt', 'mayWait', 'sendReceipt', 'sendReceipt'],
  )
  // Where it answers false, or nothing, it fails with T0013 before its second entry.
  for (const mayWait of [false, undefined]) {
    const calls: string[] = []
    setRuntime(testRuntime((_, name) => calls.push(name), mayWait))
    assert.throws(
      () => runBody(waits, order),
      (thrown) => thrown instanceof TentError && thrown.code === 'T0013',
    )
    assert.deepEqual(calls, ['sendReceipt', 'mayWait'])
  }
  setRuntime(null)

  // `tick` is asked before every statement and every entry of a repeat, of an `each` and of a `range`.
  let ticks = 0
  const counted = [
    { const: 'list', value: { fn: 'range', args: [0, 4] } },
    {
      const: 'twice',
      value: {
        fn: 'each',
        args: [{ name: ['list'] }, { arrow: ['n'], do: [{ return: { op: '*', left: { name: ['n'] }, right: 2 } }] }],
      },
    },
    { for: 'n', of: { name: ['list'] }, do: [{ do: { name: ['n'] } }] },
    { return: { name: ['twice'] } },
  ]
  const answered = await byHand(counted, { name: 'b', input: {} }, { tick: () => ticks++ })
  assert.deepEqual(answered.answer, [0, 2, 4, 6])
  // Four statements; four entries of the range; four of the each, each with the one statement of its arrow; four
  // entries of the repeat, each with its one statement.
  assert.equal(ticks, 4 + 4 + 4 + 4 + 4 + 4)
  const ending = () => {
    throw new TentError('T0008', 'The time of the call is up.')
  }
  const ended = await byHand(counted, { name: 'c', input: {} }, { tick: ending })
  assert.ok(ended.failure instanceof TentError && ended.failure.code === 'T0008')

  // A chain that starts at a value which `db` did not hand out is T0009, and no member of it is called: a list
  // that a member which answers gave, a row, and what the body was handed.
  const goesOn = (from: unknown) => [
    { const: 'found', value: from },
    { return: { plan: { name: ['found'] }, then: [{ with: [0, { name: ['input', 'first'] }] }] } },
  ]
  const all = { plan: { db: 'orders' }, then: [{ where: [{ object: [['status', 'open']] }] }, { all: [] }] }
  for (const [from, calls] of [
    [all, 2],
    [{ plan: { db: 'orders' }, then: [{ get: ['o1'] }] }, 1],
    [{ name: ['input', 'first'] }, 0],
  ] as const) {
    const refused = await byHand(goesOn(from), { name: 'd', input: { first: { with: () => 'called' } } })
    assert.ok(refused.failure instanceof TentError && refused.failure.code === 'T0009', shown(refused))
    assert.equal(refused.calls.length, calls)
  }
  // A chain goes on from a name that holds a chain, and from a choice between two chains.
  const chains = [
    {
      const: 'base',
      value: {
        if: { name: ['input', 'mine'] },
        then: { plan: { db: 'orders' }, then: [{ where: [{ object: [['owner', 'u1']] }] }] },
        else: { plan: { db: 'orders' }, then: [] },
      },
    },
    { return: { plan: { name: ['base'] }, then: [{ where: [{ object: [['status', 'open']] }] }, { count: [] }] } },
  ]
  assert.equal((await byHand(chains, { name: 'e', input: { mine: true } })).answer, 2)
  assert.equal((await byHand(chains, { name: 'f', input: { mine: false } })).answer, 3)
  // A plan of a table that the file imports is made and never carried out, and a chain goes on from its name.
  const plan = [
    { const: 'news', value: { plan: { table: 'videos' }, then: [{ where: [{ object: [['state', 'new']] }] }] } },
    { return: { plan: { name: ['news'] }, then: [{ pick: [['id']] }, { first: [] }] } },
  ]
  const planned = await byHand(plan, { name: 'g', input: {} })
  assert.deepEqual(Reflect.get(Object(planned.answer), 'plan'), {
    from: 'videos',
    where: { col: 'state', is: 'new' },
    pick: ['id'],
    one: 'first',
  })
  assert.deepEqual(planned.calls, [])

  // A stored body that names `process` reads nothing of the runtime, and neither does a name that every object has.
  for (const name of ['process', 'globalThis', 'constructor', 'toString', '__proto__']) {
    const read = await byHand([{ return: { name: [name, 'env'] } }], { name, input: {} })
    assert.ok(read.failure instanceof ReferenceError, `${name}: ${shown(read)}`)
  }
  // A form of a sequence of an agent is no form of a body, and an `await` is none of a value that stands alone.
  for (const form of [
    { call: { tool: 'refund' }, args: [] },
    { fn: 'fill', args: [] },
    { nodes: [] },
    { fn: 'process.exit', args: [] },
  ]) {
    const refused = await byHand([{ return: form }], { name: 'h', input: {} })
    assert.ok(refused.failure instanceof TentError && refused.failure.code === 'T0011', shown(refused))
  }
  // What a member that is not there gives is a failure of the runtime's own kind.
  const none = await byHand([{ return: { plan: { db: 'orders' }, then: [{ latest: [] }] } }], {
    name: 'i',
    input: {},
  })
  assert.ok(none.failure instanceof TypeError)
})

/** Runs a stored body with a `db` and a `step` of the test's own, and answers what it answered or how it failed. */
function ownRun(body: object[], handed: Record<string, unknown>): { answer?: unknown; failure?: unknown } {
  try {
    return { answer: runBody(body, { input: {}, ...handed }) }
  } catch (failure) {
    return { failure }
  }
}

test('[12-2a] runBody: a name that db, a table of it, step or a handle only inherits from the runtime is not there for a stored form', () => {
  const rows = [{ id: 'o1' }]
  const orders = { all: () => rows }
  // A `db` and a `step` that are ordinary objects of the runtime, with every member that such an object inherits.
  const db = { orders, system: { orders } }
  const step = Object.assign((_name: string, work: () => unknown) => work(), { now: () => 'noon' })
  const waiting = Object.assign(async (_name: string, work: () => unknown) => work(), { now: async () => 'noon' })
  setRuntime(testRuntime(() => undefined, true))
  const run = (body: object[], tools: object = step) => ownRun(body, { db, step: tools })
  const refused = (seen: { failure?: unknown }) => seen.failure instanceof TentError && seen.failure.code === 'T0011'

  // A member of its own is there.
  assert.equal(run([{ return: { plan: { db: 'orders' }, then: [{ all: [] }] } }]).answer, rows)
  assert.equal(run([{ return: { plan: { db: 'orders', system: true }, then: [{ all: [] }] } }]).answer, rows)
  assert.equal(run([{ return: { fn: 'step.now', args: [] } }]).answer, 'noon')
  assert.equal(run([{ return: { setting: 'shopName' } }]).answer, 'Corner Shop')

  for (const name of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']) {
    // As a table of `db` and of `db.system` it holds nothing, so a member of it fails as a member of nothing does.
    for (const plan of [{ db: name }, { db: name, system: true }]) {
      assert.deepEqual(run([{ return: { plan, then: [] } }]), { answer: undefined }, name)
      assert.ok(run([{ return: { plan, then: [{ all: [] }] } }]).failure instanceof TypeError, name)
    }
    // As a member of a table it is not called.
    assert.ok(run([{ return: { plan: { db: 'orders' }, then: [{ [name]: [] }] } }]).failure instanceof TypeError, name)
    // Read by its name it holds nothing either: on `db`, on a table of it, and on `step`.
    for (const read of [
      ['db', name],
      ['db', 'system', name],
      ['db', 'orders', name],
      ['step', name],
    ])
      assert.deepEqual(run([{ return: { name: read } }]), { answer: undefined }, read.join('.'))
    // `step` is held to the names of its tools, whatever kind of function it is.
    for (const tools of [step, waiting]) {
      assert.ok(refused(run([{ return: { fn: `step.${name}`, args: ['return 1'] } }], tools)), name)
      const inEach = { fn: 'each', args: [[1], { fn: `step.${name}`, args: ['return 1'] }] }
      assert.ok(refused(run([{ return: inEach }], tools)), name)
    }
    // A member of a handle, and a setting.
    assert.ok(run([{ do: { call: { builtin: `log.${name}` }, args: ['x'] } }]).failure instanceof TypeError, name)
    assert.deepEqual(run([{ return: { setting: name } }]), { answer: undefined }, name)
  }

  // A chain that starts at such a name and goes on from a name of the body answers nothing of the runtime.
  const goesOn = [
    { const: 'made', value: { plan: { db: 'constructor' }, then: [] } },
    { return: { plan: { name: ['made'] }, then: [{ keys: [{ name: ['input'] }] }] } },
  ]
  const went = run(goesOn)
  assert.ok(went.failure instanceof TentError && went.failure.code === 'T0009', shown(went))
  // A member that a class of the engine gives its chains is a member of the chain.
  class Chained {
    all(): unknown[] {
      return rows
    }
  }
  assert.equal(
    ownRun([{ return: { plan: { db: 'orders' }, then: [{ all: [] }] } }], { db: { orders: new Chained() } }).answer,
    rows,
  )
  // `__proto__` is never there either, also on a thing that holds a member of that name itself.
  const held: Record<string, unknown> = JSON.parse(
    '{ "orders": { "__proto__": { "all": 1 } }, "__proto__": { "orders": 2 } }',
  )
  assert.ok(Object.hasOwn(held, '__proto__') && Object.hasOwn(Object(held.orders), '__proto__'))
  for (const read of [
    ['db', '__proto__'],
    ['db', 'orders', '__proto__'],
  ])
    assert.deepEqual(ownRun([{ return: { name: read } }], { db: held }), { answer: undefined }, read.join('.'))
  assert.deepEqual(ownRun([{ return: { plan: { db: '__proto__' }, then: [] } }], { db: held }), { answer: undefined })
  // What made a thing is never there for a stored form: neither on a chain that a class made, nor on a `db` of one.
  class Tables {
    orders = new Chained()
  }
  for (const db of [{ orders: new Chained() }, new Tables()]) {
    const made = (body: object[]) => ownRun(body, { db })
    assert.deepEqual(made([{ return: { name: ['db', 'orders', 'constructor'] } }]), { answer: undefined })
    assert.deepEqual(made([{ return: { name: ['db', 'constructor'] } }]), { answer: undefined })
    assert.deepEqual(made([{ return: { plan: { db: 'constructor' }, then: [] } }]), { answer: undefined })
    const called = made([{ return: { plan: { db: 'orders' }, then: [{ constructor: [] }] } }])
    assert.ok(called.failure instanceof TypeError, shown(called))
    assert.equal(made([{ return: { plan: { db: 'orders' }, then: [{ all: [] }] } }]).answer, rows)
  }
})

test('[12-2a] runBody: a place that is worked out with an await is worked out by the body, in the order of the code', async () => {
  const awaited = { await: { call: { function: 'orderTotal' }, args: [] } }
  const input = { totals: { 120: 'found' } }
  const c = { name: 'a', input }
  for (const body of [
    [{ return: { name: ['input', 'totals', awaited] } }],
    [{ return: { read: { name: ['input'] }, path: ['totals', awaited] } }],
  ]) {
    const seen = await oneRun('action', false, c, (handed) => runBody(body, handed))
    assert.deepEqual(
      [seen.answer, seen.atOnce, seen.calls],
      ['found', false, [['call', 'orderTotal', []]]],
      shown(seen),
    )
    const asCode = await oneRun('action', false, c, async () => Reflect.get(input.totals, 120))
    assert.equal(seen.answer, asCode.answer)
  }
  // With `?.` in front of the brackets the place is not worked out where nothing stands before it.
  const maybe = [{ return: { name: ['input', 'none', '?', awaited] } }]
  const none = await oneRun('action', false, c, (handed) => runBody(maybe, handed))
  assert.deepEqual([none.ok, none.answer, none.calls], [true, undefined, []])
  // A read into nothing fails before the place is worked out, as the same text does as code.
  const broken = [{ return: { name: ['input', 'none', 'deeper', awaited] } }]
  const broke = await oneRun('action', false, c, (handed) => runBody(broken, handed))
  assert.ok(broke.failure instanceof TypeError)
  assert.deepEqual(broke.calls, [])
})

test('[12-2a] valueOf hands tick on to contains, slice and chunks, which ask it once for each entry', () => {
  let ticks = 0
  const counted = (stored: object): [unknown, number] => {
    ticks = 0
    return [valueOf(stored, { tick: () => ticks++ }), ticks]
  }
  assert.deepEqual(counted({ fn: 'contains', args: [[1, 2, 3, 4], 9] }), [false, 4])
  assert.deepEqual(counted({ fn: 'contains', args: ['hello', 'ELL'] }), [true, 0])
  assert.deepEqual(counted({ fn: 'slice', args: [[1, 2, 3, 4], 1, 3] }), [[2, 3], 2])
  assert.deepEqual(counted({ fn: 'slice', args: ['hello', 1] }), ['ello', 0])
  const cut = {
    fn: 'chunks',
    args: [
      'One.\n\nTwo.\n\nSix.',
      {
        object: [
          ['size', 4],
          ['overlap', 0],
        ],
      },
    ],
  }
  const [made, asked] = counted(cut)
  assert.deepEqual([Array.isArray(made) && made.length, asked], [3, 3])
  // The time of the call ends each of them at its next entry.
  const ending = () => {
    throw new TentError('T0008', 'The time of the call is up.')
  }
  for (const stored of [{ fn: 'contains', args: [[1], 9] }, { fn: 'slice', args: [[1, 2], 0] }, cut])
    assert.throws(
      () => valueOf(stored, { tick: ending }),
      (thrown) => thrown instanceof TentError && thrown.code === 'T0008',
    )
})
