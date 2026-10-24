import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Type } from '../index.ts'
import {
  agent,
  calc,
  change,
  choice,
  col,
  flow,
  given,
  input,
  json,
  list,
  model,
  number,
  object,
  project,
  query,
  seed,
  table,
  text,
  where,
  concat,
} from '../index.ts'
import { checkDescription, checkValue, describe, descriptionShape, toJsonSchema } from '../internal.ts'

const run = async () => undefined
const access = 'signedIn'

/** A record that holds itself, and no reference. */
function knotOf(): Record<string, unknown> {
  const knot: Record<string, unknown> = { n: 1 }
  knot.self = knot
  return knot
}

/** A list that holds itself. */
function circleOf(): unknown[] {
  const circle: unknown[] = []
  circle.push(circle)
  return circle
}

/** Makes a definition with options that the types of its word would not take. */
const made = (word: object, name: string, options: object): object =>
  Object(Reflect.apply(Object(word), undefined, [name, options]))

/** Sets a member of a record that a word of ours made, after it was made. */
const set = (record: unknown, name: string, value: unknown): boolean => Reflect.set(Object(record), name, value)

/** What a piece of work throws, with its code. */
function thrownBy(work: () => unknown): { code?: string; message: string; name: string } {
  try {
    work()
  } catch (error) {
    if (error instanceof Error) return { code: Reflect.get(error, 'code'), message: error.message, name: error.name }
  }
  return assert.fail('nothing was thrown')
}

const orders = table('orders', { columns: { total: number(), note: text({ optional: true }) } })

// Each case is one walk of `describe` over what was written, with a definition that leads a value which holds itself
// to that walk: the definitions, the name of the one that is written with the value, and the bodies that were read.
const described: [string, () => { definitions: object[]; named: string; bodies?: Record<string, object[]> }][] = [
  [
    'plainOf: the options of a model',
    () => ({
      definitions: [made(model, 'writer', { provider: 'openai', name: 'small', options: knotOf() })],
      named: 'writer',
    }),
  ],
  [
    'plainOf: the notes of an agent',
    () => ({ definitions: [made(agent, 'helper', { model: 'writer', notes: knotOf() })], named: 'helper' }),
  ],
  [
    'plainOf: the headers of the API of the project',
    () => ({ definitions: [made(project, 'shop', { api: { headers: knotOf() } })], named: 'shop' }),
  ],
  [
    'leanOf: the command line of the project',
    () => ({ definitions: [made(project, 'shop', { cli: knotOf() })], named: 'shop' }),
  ],
  [
    'written, where a field is held against its default: the lines of a text',
    () => ({
      definitions: [made(table, 'notes', { columns: { body: { kind: 'text', lines: knotOf() } } })],
      named: 'notes',
    }),
  ],
  [
    'typeOf and typesOf: a type that holds itself',
    () => {
      const shape: Record<string, Type> = { n: number() }
      shape.self = object(shape)
      return { definitions: [made(query, 'tree', { access, input: shape, run })], named: 'tree' }
    },
  ],
  [
    'heldValue and insideOf: a write of the starter data that holds itself',
    () => {
      const write = orders.add({ total: 1 })
      set(Reflect.get(write, 'values'), 'note', write)
      return { definitions: [seed([write])], named: 'seed' }
    },
  ],
  [
    'heldValue: the write of a change that holds itself',
    () => {
      const write = orders.add({ total: 1 })
      set(Reflect.get(write, 'values'), 'note', write)
      return { definitions: [made(change, 'addOrder', { access, set: write })], named: 'addOrder' }
    },
  ],
  [
    'heldWords and heldIn: the words of a choice, which are stored as they were written',
    () => ({
      definitions: [made(table, 'kinds', { columns: { kind: { ...choice(['a', 'b']), words: knotOf() } } })],
      named: 'kinds',
    }),
  ],
  [
    'heldValue, and after it seenIn and resultOf: a `from` whose record holds itself',
    () => {
      const sum = calc('+', col<number>('total'), 1)
      set(sum, 'left', sum)
      return {
        definitions: [made(table, 'sums', { columns: { total: number(), more: number({ from: sum }) } })],
        named: 'sums',
      }
    },
  ],
  [
    'heldValue, and after it tablesIn and linkedIn: the filter of a rule that holds itself',
    () => {
      const rule = where({ total: 1 })
      set(Reflect.get(rule, 'filter'), 'not', Reflect.get(rule, 'filter'))
      return {
        definitions: [made(table, 'mine', { columns: { total: number() }, access: { read: rule } })],
        named: 'mine',
      }
    },
  ],
  [
    'stepLengths, and after it seenInBody: the body of a query as it was read',
    () => ({
      definitions: [made(query, 'looped', { access, run })],
      named: 'looped',
      bodies: { looped: circleOf().map(Object) },
    }),
  ],
  [
    'stepLengths, and after it stepNamesOf: the body of a flow as it was read',
    () => ({
      definitions: [made(flow, 'round', { run })],
      named: 'round',
      bodies: { round: [knotOf()] },
    }),
  ],
]

test('[12-1] a definition that is written with a value which holds itself is T1014, at every walk of describe, and the other definitions are described', {
  timeout: 60_000,
}, () => {
  for (const [what, write] of described) {
    const { definitions, named, bodies = {} } = write()
    const shop = definitions.some((one) => Reflect.get(one, 'kind') === 'project') ? [] : [project('shop', {})]
    const { description, findings } = describe({
      definitions: [...shop, orders, ...definitions].map((value) => {
        const body = bodies[String(Reflect.get(value, 'definition'))]
        return body ? { value, bodies: { run: body } } : { value }
      }),
    })
    const found = findings.map((one) => `${one.code} ${one.message}`)
    // One finding, which names the definition and the place in it, and nothing of what the definition leaves unsaid.
    assert.equal(found.length, 1, `${what}: ${found.join(' | ')}`)
    // A thing that a word of ours made, and that was made to hold itself after, is taken by the one walk as every
    // such thing is. The walk that then meets it is caught by the net around its definition, with the words of
    // the runtime, or with those of the word that would store it.
    const words = what.startsWith('heldValue')
      ? 'it could not be described: (Maximum call stack size exceeded|A value that holds itself cannot be stored)'
      : '`[a-zA-Z0-9.]+` holds itself'
    assert.match(found[0], new RegExp(`^T1014 ${named}: ${words}`), what)
    assert.equal(findings[0].name, 'bad-value', what)
    // The definition is left out, and the table beside it is described as it is without it.
    assert.deepEqual(Object.keys(description.tables), named === 'orders' ? [] : ['orders'], what)
    for (const part of [description.functions, description.flows, description.models])
      assert.equal(part[named], undefined, what)
    if (named === 'shop') assert.deepEqual(description.project, {}, what)
  }

  // The place is the way to the value from the options, by the names and the numbers on it.
  const deep = knotOf()
  const { findings } = describe({
    definitions: [
      { value: project('shop', {}) },
      { value: made(model, 'writer', { provider: 'openai', name: 'small', options: { tools: [1, { more: deep }] } }) },
    ],
  })
  assert.deepEqual(
    findings.map((one) => one.message),
    ['writer: `options.tools.1.more.self` holds itself, and a value that holds itself has no stored form.'],
  )

  // A value that stands in many places is walked once: sixteen steps down, each with two ways, and each step
  // counts how often it is read, so that a walk which takes every way fails here and does not run on.
  let wide: object = {}
  let reads = 0
  for (let depth = 0; depth < 16; depth++) {
    const below = wide
    wide = Object.defineProperty({ right: below }, 'left', {
      enumerable: true,
      get: () => {
        reads++
        return below
      },
    })
  }
  assert.equal(checkValue(number(), wide).length, 1)
  assert.ok(reads <= 64, `read ${reads} times`)
  const many = describe({
    definitions: [
      { value: project('shop', {}) },
      { value: made(model, 'writer', { provider: 'openai', name: 'small', options: { wide, last: deep } }) },
    ],
  })
  assert.deepEqual(
    many.findings.map((one) => one.message),
    ['writer: `options.last.self` holds itself, and a value that holds itself has no stored form.'],
  )

  // A value that stands twice, and one that stands under itself by another way, holds nothing of itself.
  const twice = { a: 1 }
  const fine = describe({
    definitions: [
      { value: project('shop', {}) },
      { value: made(model, 'writer', { provider: 'openai', name: 'small', options: { one: twice, two: [twice] } }) },
    ],
  })
  assert.deepEqual(fine.findings, [])
  assert.deepEqual(fine.description.models.writer.options, { one: { a: 1 }, two: [{ a: 1 }] })
  assert.deepEqual(checkDescription(fine.description), [])

  // A description that holds itself does not fit the format, where the shape names a type and where it takes any
  // JSON: the check says where, and says nothing else of it.
  const options = fine.description.models.writer.options
  set(options, 'self', options)
  assert.deepEqual(
    checkDescription(fine.description).map((one) => [one.code, one.message, one.fields]),
    [['T0002', '`models.writer.options.self` holds itself.', { 'models.writer.options.self': 'type' }]],
  )
  Reflect.deleteProperty(Object(options), 'self')
  set(fine.description.messages, 'en', fine.description.messages)
  assert.deepEqual(
    checkDescription(fine.description).map((one) => one.message),
    ['`messages.en` holds itself.'],
  )
  assert.deepEqual(
    checkValue(descriptionShape, fine.description).map((one) => one.message),
    ['`messages.en` holds itself.'],
  )
})

test('[12-1] a word and a check that walk a written value which holds itself fail with a code of ours, and never with an error of the runtime', () => {
  const tied: Record<string, unknown> = { n: 1, ref: input('last') }
  tied.self = tied
  const loop: Record<string, unknown> = { total: 1 }
  loop.not = loop
  const anyOf: Record<string, unknown> = {}
  anyOf.any = [{ total: 1 }, anyOf]
  const allOf: Record<string, unknown> = {}
  allOf.all = [allOf]
  const kept = given(1)
  set(kept, 'given', kept)

  const refused: [string, () => unknown][] = [
    // `asValue` and `asValues`, which every word stands on that stores a value.
    ['a write', () => orders.add(Object(knotOf()))],
    ['an id', () => orders.get(Object(knotOf()))],
    ['a value word that is handed a reference', () => concat('a', tied)],
    // `filterOf`, which joins filters with `not`, `any` and `all`.
    ['a filter under its own `not`', () => orders.where(loop)],
    ['a filter in its own `any`', () => orders.where(anyOf)],
    ['a filter in its own `all`', () => orders.count(allOf)],
    ['the filter of a rule', () => where(loop)],
    ['the filter of `where` over a list', () => where([{ total: 1 }], loop)],
    // The entry of a filter that is written with `given`.
    ['a `given` that holds itself', () => orders.where({ total: kept })],
  ]
  for (const [what, work] of refused) {
    const error = thrownBy(work)
    assert.equal(error.code, 'T1014', `${what}: ${error.name} ${error.message}`)
    assert.equal(error.message, 'A value that holds itself cannot be stored.', what)
  }

  // A value word that looks for a reference walks a value that holds itself, finds none, and works its value out.
  assert.equal(concat('a', knotOf()), 'a[object Object]')
  assert.deepEqual(where([{ total: 1 }, { total: 2 }], { total: 1 }), [{ total: 1 }])

  // A filter that stands twice holds nothing of itself.
  const one = { total: 1 }
  assert.deepEqual(Reflect.get(where({ any: [one, one] }), 'filter'), {
    any: [
      { col: 'total', is: 1 },
      { col: 'total', is: 1 },
    ],
  })

  // A type that holds itself, with a value that holds itself: the check ends, and says where.
  const endless = list(json())
  set(endless, 'of', endless)
  const misses = checkValue(endless, circleOf())
  assert.deepEqual(
    misses.map((one) => [one.code, one.message, one.fields]),
    [['T0002', '`0` holds itself.', { '0': 'type' }]],
  )
  const record = object({ n: number() })
  set(record.shape, 'self', record)
  assert.deepEqual(
    checkValue(record, knotOf()).map((one) => one.fields),
    [{ self: 'type' }],
  )
  // A place for any JSON is walked to its end, and a value that holds itself is no JSON.
  assert.deepEqual(
    checkValue(json(), knotOf()).map((one) => one.message),
    ['`self` holds itself.'],
  )
  // The same type takes a value that ends.
  assert.deepEqual(checkValue(endless, [[], [[]]]), [])
  assert.deepEqual(checkValue(record, { n: 1, self: { n: 2, self: { n: 3 } } }).length, 1)

  // A type that holds itself has no schema.
  for (const type of [endless, record]) {
    const error = thrownBy(() => toJsonSchema(type))
    assert.equal(error.code, 'T1014', `${error.name} ${error.message}`)
  }
  const shared = number()
  assert.deepEqual(Reflect.get(toJsonSchema(object({ a: shared, b: shared })), 'required'), ['a', 'b'])
})
