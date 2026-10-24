import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as all from '../index.ts'
import {
  action,
  agent,
  change,
  command,
  flow,
  incoming,
  json,
  model,
  project,
  python,
  query,
  route,
  service,
  table,
  TentError,
  text,
} from '../index.ts'
import { checkDescription, checkValue, describe, finish, toJsonSchema, write } from '../internal.ts'

const run = async () => undefined
const access = 'signedIn'

/** Makes a definition with options that the types of its word would not take. */
const made = (word: object, name: string, options: object): object =>
  Object(Reflect.apply(Object(word), undefined, [name, options]))

const writer = model('writer', { provider: 'anthropic', name: 'claude' })
const tidy = flow('tidy', { run })

/** A list inside a list, so many times, with a number in the innermost: made with no call inside a call. */
function nested(depth: number): unknown[] {
  let deep: unknown[] = [1]
  for (let at = 1; at < depth; at++) deep = [deep]
  return deep
}

class Thing {
  held = 1
}

// The kinds of value that no stored form holds, each made anew for a case.
const values: Record<string, () => unknown> = {
  'an empty record': () => ({}),
  'a Date': () => new Date(0),
  'a Map': () => new Map([['a', 1]]),
  'a Set': () => new Set([1]),
  'a thing that a class made': () => new Thing(),
  'a symbol': () => Symbol('a'),
  'a bigint': () => 5n,
  'a function': () => () => 'Notes',
  NaN: () => Number.NaN,
  Infinity: () => Number.POSITIVE_INFINITY,
  'a value that holds itself': () => {
    const knot: Record<string, unknown> = { n: 1 }
    knot.self = knot
    return knot
  },
  'a list 100,000 deep': () => nested(100_000),
}

// Every word with the options it needs, and every option of its row in `11`, section 2, with `was`, and `plain`
// where the word takes it.
const words: [string, object, Record<string, unknown>, string][] = [
  [
    'project',
    project,
    {},
    'title languages zone currency icon head state signInPath identify onRequest uploads images cookies cli mcp python describeTo api roots trailingSlash settings mail limits redirects hosts unlock privateHosts countBy workers backups history publish removed build was',
  ],
  [
    'table',
    table,
    { columns: { a: text() } },
    'columns owner access search indexes unique keepHistory removed tenant shows plain was',
  ],
  [
    'query',
    query,
    { access, run },
    'access rows run about input output live refresh heavy offer deprecated system reads countBy plain was',
  ],
  [
    'change',
    change,
    { access, run },
    'access set run about input output danger offer deprecated system touches countBy everywhere plain was',
  ],
  [
    'action',
    action,
    { access, run },
    'access run about input output danger sends offer deprecated system background worker batch remember rows uses changes callerGone follow countBy limits plain was',
  ],
  [
    'flow',
    flow,
    { run },
    'run on about input output limits tries together moveRuns onFail as danger offer access system sends follow countBy plain was',
  ],
  [
    'service',
    service,
    { url: 'https://api.example.com' },
    'url auth headers calls from use limits tries onceOnlyHeader webhook connection mcp was',
  ],
  [
    'model',
    model,
    { provider: 'anthropic', name: 'claude' },
    'provider name key url abilities takes voices input output limits tries fallback options countBy call units job was',
  ],
  [
    'agent',
    agent,
    { model: writer, instructions: 'Help.', tools: [], limits: { steps: 4, perRun: { tokensOut: 1000 } } },
    'model instructions tools limits about access offer on memory voice trust together words driver policy reasoning tell sequence countBy was',
  ],
  [
    'python',
    python,
    { file: 'sum.py', input: {}, output: text(), access },
    'file input output access packages files lock rows uses limits gpu atOnce worker background batch remember sends changes callerGone follow countBy about danger offer deprecated system was',
  ],
  ['route', route, { method: 'GET', path: '/things', access, run }, 'method path access run system origins limits was'],
  ['incoming', incoming, { path: '/in', then: tidy, open: 'A test.' }, 'path then verify open limits was'],
  ['command', command, { run }, 'about run access args was'],
]

// What an option takes of these kinds, by its row in `11`, section 2, each named by its word and its name.
// An arrow, which is read or kept as code:
const takesFunction = [
  'project.identify project.onRequest query.run change.run action.run flow.run flow.onFail route.run',
  'command.run',
]
  .join(' ')
  .split(' ')
// A record with nothing in it: the option is a record of entries, or of parts each of which may be left out.
const takesEmptyRecord = [
  'project.state project.images project.cookies project.cli project.mcp project.python',
  'project.api project.settings project.mail project.limits project.unlock',
  'project.workers project.backups project.history project.publish project.build table.columns',
  'table.access query.input change.input action.input action.batch action.remember action.rows',
  'action.limits flow.input flow.limits flow.tries flow.together service.headers service.calls',
  'service.limits service.tries service.mcp model.input model.limits model.tries model.options',
  'model.units agent.limits agent.memory agent.voice agent.together agent.words',
  'agent.policy agent.reasoning python.input python.rows python.limits python.batch python.remember',
  'route.limits incoming.limits command.args',
]
  .join(' ')
  .split(' ')

test('[13-7] every option of every word, handed each kind of value that no stored form holds: nothing is thrown, what describe answers passes checkDescription and is finished and written, and a finding names the definition', {
  timeout: 300_000,
}, () => {
  let cases = 0
  const missed: string[] = []
  for (const [name, word, needed, options] of words) {
    const named = name === 'project' ? 'shop' : 'one'
    for (const option of options.split(' '))
      for (const [kind, value] of Object.entries(values)) {
        const said = `${name}, \`${option}\` handed ${kind}`
        const one = made(word, named, { ...needed, [option]: value() })
        const rest = name === 'project' ? [] : [project('shop', {})]
        const { description, findings } = describe({
          definitions: [...rest, writer, tidy, one].map((value) => ({ value })),
        })
        // What describe answers passes its own shape, whatever it was handed, and is finished and written.
        assert.deepEqual(
          checkDescription(description).map((miss) => miss.message),
          [],
          said,
        )
        assert.equal(typeof write(finish(description, { modules: {}, sources: {} })).text, 'string', said)
        // The two that are written beside it are right, so a finding is one of the definition.
        for (const finding of findings)
          assert.ok(finding.message.startsWith(`${named}: `), `${said}: ${finding.message}`)
        const taken =
          (kind === 'a function' && takesFunction.includes(`${name}.${option}`)) ||
          (kind === 'an empty record' && takesEmptyRecord.includes(`${name}.${option}`))
        if (taken ? findings.length : !findings.length) missed.push(said)
        cases++
      }
  }
  assert.deepEqual(missed, [])
  assert.equal(words.length, 13)
  assert.equal(cases, 12 * 218)
  assert.deepEqual([takesFunction.length, takesEmptyRecord.length], [9, 54])

  // The checker of values, and the schema of a type: as deep as 200, and no deeper, with no call inside a call.
  assert.deepEqual(checkValue(json(), nested(200)), [])
  // A place for any JSON takes what JSON holds, and nothing else.
  const held = {
    a: 'text',
    b: [1, true, null, { c: {} }],
    d: new Date(0),
    e: Number.NaN,
    f: new Thing(),
    g: new Map(),
    h: -1 / 0,
  }
  assert.deepEqual(
    checkValue(json(), held).map((miss) => miss.message),
    ['`d` is no JSON.', '`e` is no JSON.', '`f` is no JSON.', '`g` is no JSON.', '`h` is no JSON.'],
  )
  for (const depth of [201, 100_000]) {
    const [miss, ...more] = checkValue(json(), nested(depth))
    assert.equal(miss.code, 'T0002', String(depth))
    assert.match(miss.message, /^`(0\.)+0` is nested more than 200 deep\.$/, String(depth))
    assert.deepEqual(Object.values(miss.fields ?? {}), ['type'], String(depth))
    assert.deepEqual(more, [], String(depth))
  }
  const deepType = { kind: 'list', of: {} }
  let at = deepType
  for (let depth = 0; depth < 100_000; depth++) {
    at.of = { kind: 'list', of: {} }
    at = Object(at.of)
  }
  at.of = text()
  assert.throws(
    () => Reflect.apply(toJsonSchema, undefined, [deepType]),
    (error) => Reflect.get(Object(error), 'code') === 'T1014',
  )
})

test('[13-7] a required text that is handed a list or a record is a finding and the definition is left out, and a finding names an option as its author wrote it', () => {
  const shop = { value: project('shop', {}) }
  // A text and a number of which nothing is stored: the kind of the field is what speaks.
  for (const [option, value, names] of [
    ['provider', [], 'provider'],
    ['provider', {}, 'provider'],
    ['name', [], 'name'],
    ['name', new Date(0), 'name'],
    ['url', [], 'url'],
    ['url', {}, 'url'],
    ['takes', [], 'takes'],
    ['takes', {}, 'takes'],
  ] as const) {
    const one = made(model, 'one', { provider: 'anthropic', name: 'claude', [option]: value })
    const { description, findings } = describe({ definitions: [shop, { value: one }] })
    assert.equal(findings.length, 1, `${option}: ${findings.map((finding) => finding.message).join(' | ')}`)
    assert.match(`${findings[0].code} ${findings[0].message}`, new RegExp(`^T1014 one: \`${names}\` `), option)
    assert.deepEqual(checkDescription(description), [], option)
    // A model with no provider or no name is no model: it is left out, whole.
    assert.equal('one' in description.models, option === 'url' || option === 'takes', option)
  }

  // `rows` is stored as a plan and `set` as writes, and a finding names what the author wrote.
  const orders = table('orders', { columns: { total: text() } })
  const lost = () => 'five'
  const wrong = [
    made(query, 'q', { access, rows: orders.where({ total: lost }) }),
    made(change, 'c', { access, set: orders.add(Object({ total: lost })) }),
  ]
  const { description, findings } = describe({
    definitions: [shop, { value: orders }, ...wrong.map((value) => ({ value }))],
  })
  const found = findings.map((finding) => finding.message)
  assert.ok(
    found.some((message) => message.startsWith('q: `rows')),
    found.join(' | '),
  )
  assert.ok(
    found.some((message) => message.startsWith('c: `set')),
    found.join(' | '),
  )
  assert.equal(
    found.some((message) => /`(plan|writes)\b/.test(message)),
    false,
    found.join(' | '),
  )
  assert.deepEqual(checkDescription(description), [])
})

test('[12-1] no word that index.ts gives ends with an error of the runtime, handed a value that is nested 100,000 deep in the place of a name, of its options and of a value', {
  timeout: 120_000,
}, async () => {
  const deep = nested(100_000)
  let not: Record<string, unknown> = { total: 1 }
  for (let depth = 0; depth < 100_000; depth++) not = { not }
  const given: [string, unknown[]][] = [
    ['a list in the first place', [deep]],
    ['a list in the second place', ['a', deep]],
    ['a list in the third place', ['a', 'b', deep]],
    ['a record in the first place', [not]],
    ['a record in the second place', ['a', not]],
    ['a number', [5]],
    ['nothing at all', []],
    ['null', [null]],
    ['a symbol', [Symbol('a')]],
    ['a number in the second place', ['a', 5]],
    ['null in the second place', ['a', null]],
    ['a symbol in the second place', ['a', Symbol('a')]],
  ]
  let calls = 0
  const ended: string[] = []
  const tried = async (what: string, work: () => unknown): Promise<void> => {
    calls++
    try {
      await work()
    } catch (error) {
      // A value word that is handed nothing where a text stands fails as JavaScript fails for nothing, with an
      // error that `textOf` makes (`12`, section 2): it is the one that is no failure with a code.
      const forNothing =
        error instanceof TypeError && / was handed (undefined|null) where a text is needed$/.test(error.message)
      if (!(error instanceof TentError) && !forNothing)
        ended.push(`${what}: ${Object(error).name} ${Object(error).message}`)
    }
  }
  for (const [name, word] of Object.entries(all))
    for (const [what, values] of given) {
      if (typeof word !== 'function' || word === TentError) continue
      await tried(`${name}, ${what}`, () => Reflect.apply(word, undefined, values))
    }
  // The members of a table, which store what they are handed.
  const orders = table('orders', { columns: { total: text() } })
  for (const [name, member] of Object.entries(orders))
    for (const [what, values] of given)
      if (typeof member === 'function')
        await tried(`orders.${name}, ${what}`, () => Reflect.apply(member, orders, values))
  assert.deepEqual(ended, [])
  assert.ok(calls > 1200, String(calls))
  // A value word says so with its own code, and a word that stores a value with T1014.
  assert.throws(() => all.concat('a', Object(deep)), { code: 'T0027' })
  assert.throws(() => orders.where(Object(not)), { code: 'T1014' })
  assert.throws(() => orders.add(Object({ total: deep })), { code: 'T1014' })
  // A word that is handed a value of the wrong kind in the place of a name or of its options says so.
  assert.throws(() => Reflect.apply(all.action, undefined, [5]), { code: 'T1014' })
  assert.throws(() => Reflect.apply(all.model, undefined, ['m', 'options']), { code: 'T1014' })
  assert.throws(() => Reflect.apply(all.query, undefined, ['q', []]), { code: 'T1014' })
  assert.throws(() => Reflect.apply(orders.sort, orders, [5]), { code: 'T1014' })
  assert.throws(() => Reflect.apply(orders.group, orders, []), { code: 'T1014' })
  assert.throws(() => Reflect.apply(orders.group, orders, ['total', 5]), { code: 'T1014' })
  assert.throws(() => Reflect.apply(orders.near, orders, ['total', [1], null]), { code: 'T1014' })
  for (const none of [5, 'text', null, undefined, { kind: 'list', of: 5 }])
    assert.throws(() => Reflect.apply(toJsonSchema, undefined, [none]), { code: 'T1014' }, String(none))
  // A row is a record of values, and the options of a trigger are a record or nothing.
  for (const [what, work] of [
    ['add(null)', () => Reflect.apply(orders.add, orders, [null])],
    ['add()', () => Reflect.apply(orders.add, orders, [])],
    ['add(a list)', () => Reflect.apply(orders.add, orders, [[1]])],
    ['change(5)', () => Reflect.apply(orders.change, orders, [5])],
    ['change(null)', () => Reflect.apply(orders.change, orders, [null])],
    ['change(a symbol)', () => Reflect.apply(orders.change, orders, [Symbol('a')])],
    ['change()', () => Reflect.apply(orders.change, orders, [])],
    ['added(null)', () => Reflect.apply(orders.added, orders, [null])],
    ['changed(null)', () => Reflect.apply(orders.changed, orders, [null])],
    ['removed(null)', () => Reflect.apply(orders.removed, orders, [null])],
    ['added(columns that are no list)', () => Reflect.apply(orders.added, orders, [{ columns: 5 }])],
  ] as const)
    assert.throws(work, { code: 'T1014' }, what)
  assert.deepEqual(Object(orders.added()), { table: 'orders', when: 'added' })
})

test('[13-7] one walk decides what a written value may hold: 200 deep and no deeper at every place, a body that holds no function, and a value that stands in many places', {
  timeout: 60_000,
}, () => {
  const orders = table('orders', { columns: { total: text() } })
  const shop = { value: project('shop', {}) }
  const withOptions = (options: object) =>
    describe({ definitions: [shop, { value: made(model, 'one', { provider: 'anthropic', name: 'claude', options }) }] })
  // A number inside 200 lists is taken, and inside 201 it is refused: by the check of a value, in a write, in a
  // value of a filter, by a value word with and without a reference, and in an option.
  const taken: [string, (value: unknown) => unknown][] = [
    ['checkValue', (value) => assert.deepEqual(checkValue(json(), value), [])],
    ['a write', (value) => orders.add(Object({ total: value }))],
    ['a value of a filter', (value) => orders.where(Object({ total: value }))],
    ['a value of a filter under an operator', (value) => orders.where(Object({ total: { not: value } }))],
    ['a value word', (value) => assert.equal(all.contains(Object(value), 5), false)],
    ['a value word with a reference', (value) => all.concat(Object(value), all.input('more'))],
    ['an option', (value) => assert.deepEqual(withOptions({ deep: value }).findings, [])],
  ]
  for (const [what, work] of taken) work(nested(200)) ?? assert.ok(true, what)
  const refused: [string, (value: unknown) => unknown, string][] = [
    ['a write', (value) => orders.add(Object({ total: value })), 'T1014'],
    ['a value of a filter', (value) => orders.where(Object({ total: value })), 'T1014'],
    ['a value of a filter under an operator', (value) => orders.where(Object({ total: { not: value } })), 'T1014'],
    ['a value word', (value) => all.contains(Object(value), 5), 'T0027'],
    ['a value word with a reference', (value) => all.concat(Object(value), all.input('more')), 'T0027'],
  ]
  for (const depth of [201, 100_000]) {
    for (const [what, work, code] of refused) assert.throws(() => work(nested(depth)), { code }, `${what}, ${depth}`)
    assert.equal(checkValue(json(), nested(depth))[0].code, 'T0002', String(depth))
    const { description, findings } = withOptions({ deep: nested(depth) })
    assert.equal(findings.length, 1, String(depth))
    assert.match(findings[0].message, /^one: `options\.deep(\.0)+` is nested more than 200 deep, and such a value/)
    assert.equal('one' in description.models, false)
  }

  // A value that stands in two places is counted where it stands deepest, and is walked once.
  let twice: unknown[] = nested(100)
  twice = [twice, [twice]]
  assert.deepEqual(checkValue(json(), twice), [])
  let far: unknown = twice
  for (let depth = 0; depth < 150; depth++) far = [far]
  const both = [twice, far]
  assert.match(checkValue(json(), both)[0].message, /is nested more than 200 deep/)
  assert.throws(() => orders.add(Object({ total: both })), { code: 'T1014' })
  assert.throws(() => all.contains(Object(both), 5), { code: 'T0027' })
  // Twenty-two levels, each holding the level below twice, would be stored as some eight million values. They
  // stand before the forty, so that a walk which takes every place fails here, where it still ends.
  let some22: unknown[] = [1]
  for (let level = 0; level < 22; level++) some22 = [some22, some22]
  assert.match(checkValue(json(), some22)[0]?.message ?? '', /stands in so many places/)
  assert.throws(() => all.concat(Object(some22)), { code: 'T0027' })
  // Forty levels would be stored as more values than a description holds: each of the walks says so at once,
  // where a walk into every place would not end.
  let wide: unknown[] = [1]
  for (let level = 0; level < 40; level++) wide = [wide, wide]
  const from = performance.now()
  assert.match(
    checkValue(json(), wide)[0].message,
    /stands in so many places that it would be stored as more than 1000000 values/,
  )
  assert.throws(() => orders.add(Object({ total: wide })), { code: 'T1014' })
  assert.throws(() => orders.where(Object({ total: wide })), { code: 'T1014' })
  assert.throws(() => all.concat(Object(wide)), { code: 'T0027' })
  const many = withOptions({ wide })
  assert.match(many.findings[0].message, /^one: `options\.wide\.\d+(\.\d+)*` stands in so many places/)
  assert.equal(many.findings.length, 1)
  assert.ok(performance.now() - from < 1000, 'the forty levels took more than a second')
  // Ten such levels are a value like any other: it is stored, place by place.
  let some: unknown[] = [1]
  for (let level = 0; level < 10; level++) some = [some, some]
  assert.deepEqual(withOptions({ some }).findings, [])

  // A body is what the build read, and holds no function and no symbol: T1014, with the way to the place.
  for (const [what, value, words] of [
    ['a function', () => 1, 'is a function where the option takes none'],
    ['a symbol', Symbol('a'), 'is a symbol'],
    ['a Date', new Date(0), 'is a `Date`'],
  ] as const) {
    const { description, findings } = describe({
      definitions: [shop, { value: made(query, 'q', { access, run }), bodies: { run: [{ return: value }] } }],
    })
    assert.deepEqual(
      findings.map((finding) => `${finding.code} ${finding.message}`),
      [`T1014 q: \`bodies.run.0.return\` ${words}, and such a value has no stored form.`],
      what,
    )
    assert.equal('q' in description.functions, false, what)
  }
})

test('[13-7] an error that is thrown while one definition is described is T1014 on that definition, which is left out, and the definition beside it is described as ever', () => {
  const shop = { value: project('shop', {}) }
  const beside = { value: made(query, 'beside', { access, run, about: 'Stands beside' }) }
  // A member that throws when it is read: at once, so that the walk meets it, and at the third reading, so that
  // what describes the definition meets it.
  for (const first of [1, 3]) {
    let reads = 0
    const options = Object.defineProperty({ access, run }, 'about', {
      enumerable: true,
      get: () => {
        reads++
        if (reads >= first) throw new RangeError('the reading failed')
        return 'Notes'
      },
    })
    const { description, findings } = describe({ definitions: [shop, { value: made(query, 'one', options) }, beside] })
    assert.deepEqual(
      findings.map((finding) => `${finding.code} ${finding.message}`),
      ['T1014 one: it could not be described: the reading failed'],
      String(first),
    )
    assert.deepEqual(Object.keys(description.functions), ['beside'], String(first))
    assert.deepEqual(description.functions.beside, {
      kind: 'query',
      form: 'code',
      about: 'Stands beside',
      access: { rule: 'signedIn' },
      export: 'beside',
    })
    assert.deepEqual(checkDescription(description), [])
  }
  // The same for the project, at each reading up to the last: wherever the reading fails, the project is left
  // out whole, and what was stored of it before the failure is not kept.
  let failed = 0
  for (let first = 1; first <= 12; first++) {
    let reads = 0
    const options = Object.defineProperty({ languages: ['en', 'tr'] }, 'title', {
      enumerable: true,
      get: () => {
        reads++
        if (reads >= first) throw new Error('the reading failed')
        return 'Shop'
      },
    })
    const { description, findings } = describe({ definitions: [{ value: made(project, 'shop', options) }, beside] })
    assert.deepEqual(checkDescription(description), [], String(first))
    assert.deepEqual(Object.keys(description.functions), ['beside'], String(first))
    if (!findings.length) {
      assert.equal(description.project.title, 'Shop', String(first))
      continue
    }
    failed++
    assert.deepEqual(
      findings.map((finding) => `${finding.code} ${finding.message}`),
      ['T1014 shop: it could not be described: the reading failed'],
      String(first),
    )
    assert.deepEqual(description.project, {}, String(first))
  }
  assert.ok(failed >= 3, `the reading failed at ${failed} places`)

  // A list, a number or a flag where a record stands is passed over by the word, which stores what holds when
  // the option is left out: it is said.
  for (const cookies of [[1], 5, true]) {
    const { findings } = describe({ definitions: [{ value: made(project, 'shop', { cookies }) }] })
    assert.deepEqual(
      findings.map((finding) => `${finding.code} ${finding.message}`),
      ['T1014 shop: `cookies` takes a record, and what it was handed is none: it is left out.'],
      String(cookies),
    )
  }
})
