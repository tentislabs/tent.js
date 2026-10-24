import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  action,
  agent,
  change,
  command,
  flow,
  incoming,
  input,
  json,
  model,
  chunks,
  project,
  python,
  query,
  route,
  seed,
  service,
  table,
  text,
  concat,
} from '../index.ts'
import { checkDescription, checkValue, describe, toJsonSchema } from '../internal.ts'

const run = async () => undefined
const access = 'signedIn'

/** Makes a definition with options that the types of its word would not take. */
const made = (word: object, name: string, options: object): object =>
  Object(Reflect.apply(Object(word), undefined, [name, options]))

const notes = table('notes', { columns: { a: text(), j: json({ optional: true }) } })
const writer = model('writer', { provider: 'anthropic', name: 'claude' })
const tidy = flow('tidy', { run })
const beside = { value: made(query, 'beside', { access, run, about: 'Stands beside' }) }

/** Describes one definition beside a project, a table, a model and a flow that are right. */
function described(value: object) {
  const isProject = Reflect.get(value, 'kind') === 'project'
  const rest = isProject ? [] : [project('shop', {})]
  return describe({ definitions: [...rest, notes, writer, tidy, value].map((one) => ({ value: one })) })
}

/** A value inside so many lists, made with no call inside a call. */
function inLists(value: unknown, depth: number): unknown {
  let deep = value
  for (let at = 0; at < depth; at++) deep = [deep]
  return deep
}

/** A value inside so many records, made with no call inside a call. */
function inRecords(value: unknown, depth: number): unknown {
  let deep = value
  for (let at = 0; at < depth; at++) deep = { in: deep }
  return deep
}

const agentNeeds = { model: writer, instructions: 'Help.', tools: [], limits: { steps: 4 } }
const pythonNeeds = { file: 'sum.py', input: {}, output: text(), access }
const modelNeeds = { provider: 'anthropic', name: 'claude' }

// Every option that is stored as a name or as a list of names: the definition it stands on, made with what stands
// in the place of the name; the place a finding names; the option that is left out; and what is stored there.
type Named = [
  what: string,
  make: (handed: unknown) => object,
  place: string,
  option: string,
  stored: (description: ReturnType<typeof describe>['description']) => unknown,
]
const lists: Named[] = [
  [
    'reads of a query',
    (one) => made(query, 'one', { access, run, reads: [one] }),
    'reads.0',
    'reads',
    (d) => d.functions.one?.reads,
  ],
  [
    'touches of a change',
    (one) => made(change, 'one', { access, run, touches: [one] }),
    'touches.0',
    'touches',
    (d) => d.functions.one?.touches,
  ],
  [
    'uses of an action',
    (one) => made(action, 'one', { access, run, uses: [one] }),
    'uses.0',
    'uses',
    (d) => d.functions.one?.uses,
  ],
  [
    'uses of a python',
    (one) => made(python, 'one', { ...pythonNeeds, uses: [one] }),
    'uses.0',
    'uses',
    (d) => d.functions.one?.uses,
  ],
  [
    'tools of an agent',
    (one) => made(agent, 'one', { ...agentNeeds, tools: [one] }),
    'tools.0',
    'tools',
    (d) => Reflect.get(Object(d.flows.one?.agent), 'tools'),
  ],
  [
    'the tool of an entry of tools',
    (one) => made(agent, 'one', { ...agentNeeds, tools: [{ tool: one, tries: 2 }] }),
    'tools.0.tool',
    'tools',
    (d) => Reflect.get(Object(d.flows.one?.agent), 'tools'),
  ],
  [
    'trust of an agent',
    (one) => made(agent, 'one', { ...agentNeeds, tools: [tidy], trust: [one] }),
    'trust.0',
    'trust',
    (d) => Reflect.get(Object(d.flows.one?.agent), 'trust'),
  ],
  [
    'fallback of a model',
    (one) => made(model, 'one', { ...modelNeeds, fallback: [one] }),
    'fallback.0',
    'fallback',
    (d) => d.models.one?.fallback,
  ],
  [
    'mcp.only of the project',
    (one) => made(project, 'shop', { mcp: { only: [one] } }),
    'mcp.only.0',
    'mcp.only',
    (d) => Reflect.get(Object(d.project.mcp), 'only'),
  ],
  [
    'a scope of mcp.scopes of the project',
    (one) => made(project, 'shop', { mcp: { scopes: { read: [one] } } }),
    'mcp.scopes.read.0',
    'mcp.scopes.read',
    (d) => Reflect.get(Object(Reflect.get(Object(d.project.mcp), 'scopes')), 'read'),
  ],
]
const agentPart = (part: string, member: string) => (d: ReturnType<typeof describe>['description']) =>
  Reflect.get(Object(Reflect.get(Object(d.flows.one?.agent), part)), member)
const single: Named[] = [
  [
    'model of an agent',
    (one) => made(agent, 'one', { ...agentNeeds, model: one }),
    'model',
    'model',
    (d) => Reflect.get(Object(d.flows.one?.agent), 'model'),
  ],
  [
    'memory.in of an agent',
    (one) => made(agent, 'one', { ...agentNeeds, memory: { in: one, shrink: 'all' } }),
    'memory.in',
    'memory.in',
    agentPart('memory', 'in'),
  ],
  [
    'memory.shrink of an agent',
    (one) => made(agent, 'one', { ...agentNeeds, memory: { in: notes, shrink: one } }),
    'memory.shrink',
    'memory.shrink',
    agentPart('memory', 'shrink'),
  ],
  [
    'memory.model of an agent',
    (one) => made(agent, 'one', { ...agentNeeds, memory: { in: notes, shrink: 'all', model: one } }),
    'memory.model',
    'memory.model',
    agentPart('memory', 'model'),
  ],
  [
    'voice.hear of an agent',
    (one) => made(agent, 'one', { ...agentNeeds, voice: { hear: one, speak: writer } }),
    'voice.hear',
    'voice.hear',
    agentPart('voice', 'hear'),
  ],
  [
    'voice.speak of an agent',
    (one) => made(agent, 'one', { ...agentNeeds, voice: { hear: writer, speak: one } }),
    'voice.speak',
    'voice.speak',
    agentPart('voice', 'speak'),
  ],
  [
    'then of an incoming call',
    (one) => made(incoming, 'one', { path: '/in', then: one, open: 'A test.' }),
    'then',
    'then',
    (d) => d.incoming.one?.then,
  ],
  [
    'publish.health of the project',
    (one) => made(project, 'shop', { publish: { health: one } }),
    'publish.health',
    'publish.health',
    (d) => Reflect.get(Object(d.project.publish), 'health'),
  ],
  [
    'a method of mcp.on of the project',
    (one) => made(project, 'shop', { mcp: { on: { listed: one } } }),
    'mcp.on.listed',
    'mcp.on.listed',
    (d) => Reflect.get(Object(Reflect.get(Object(d.project.mcp), 'on')), 'listed'),
  ],
  [
    'connection of a service',
    (one) => made(service, 'one', { url: 'https://api.example.com', connection: one }),
    'connection',
    'connection',
    (d) => d.services.one?.connection,
  ],
  [
    'mcp.model of a service',
    (one) => made(service, 'one', { url: 'https://api.example.com', mcp: { model: one } }),
    'mcp.model',
    'mcp.model',
    (d) => Reflect.get(Object(d.services.one?.mcp), 'model'),
  ],
  [
    'call of a model',
    (one) => made(model, 'one', { ...modelNeeds, call: one }),
    'call',
    'call',
    (d) => d.models.one?.call,
  ],
  [
    'job.check of a model',
    (one) =>
      made(model, 'one', {
        ...modelNeeds,
        limits: { time: '1 minute' },
        job: { check: one, done: { status: 'done' } },
      }),
    'job.check',
    'job.check',
    (d) => Reflect.get(Object(d.models.one?.job), 'check'),
  ],
]

test('[13-7] an option that is stored as a name or as a list of names, handed what is neither a name nor a definition, is T1014 by its place, and the option is left out', () => {
  // What is no name: a number, nothing, a record that no word made, a flag, a list.
  const none: [string, unknown][] = [
    ['a number', 5],
    ['null', null],
    ['a record', {}],
    ['true', true],
    ['a list', ['notes']],
  ]
  let cases = 0
  for (const [what, make, place, option, stored] of [...lists, ...single])
    for (const [kind, handed] of none) {
      const said = `${what}, handed ${kind}`
      const { description, findings } = described(make(handed))
      const named = String(Reflect.get(make(handed), 'definition'))
      const left = place === option ? 'and is left out' : `and \`${option}\` is left out`
      assert.deepEqual(
        findings.map((finding) => `${finding.code} ${finding.message}`),
        [`T1014 ${named}: \`${place}\` is neither a name nor a definition, ${left}.`],
        said,
      )
      assert.equal(stored(description), undefined, said)
      assert.deepEqual(checkDescription(description), [], said)
      cases++
    }
  assert.equal(cases, 23 * 5)

  // An entry of a list that holds nothing is no name either, and a list with one such entry is left out whole.
  for (const reads of [[undefined], ['notes', 5], [notes, null, 'notes']]) {
    const { description, findings } = described(made(query, 'one', { access, run, reads }))
    const at = reads.findIndex((one) => typeof one !== 'string' && one !== notes)
    assert.deepEqual(
      findings.map((finding) => finding.message),
      [`one: \`reads.${at}\` is neither a name nor a definition, and \`reads\` is left out.`],
    )
    assert.equal('reads' in description.functions.one, false)
  }

  // A name as text and a definition that a word of ours made are each stored as the name, with no finding.
  const right = described(
    made(agent, 'one', {
      ...agentNeeds,
      model: 'writer',
      tools: [tidy, { tool: 'beside', tries: 2 }],
      trust: [tidy, 'beside'],
      memory: { in: notes, shrink: tidy, model: writer },
      voice: { hear: writer, speak: 'writer' },
    }),
  )
  assert.deepEqual(right.findings, [])
  assert.deepEqual(right.description.flows.one.agent, {
    model: 'writer',
    instructions: 'Help.',
    tools: ['tidy', { tool: 'beside', tries: 2 }],
    trust: ['tidy', 'beside'],
    limits: { steps: 4 },
    memory: { in: 'notes', shrink: { flow: 'tidy' }, model: 'writer' },
    voice: { hear: 'writer', speak: 'writer' },
  })
  const code = described(made(query, 'one', { access, run, reads: [notes, 'orders'] }))
  assert.deepEqual([code.findings, code.description.functions.one.reads], [[], ['notes', 'orders']])

  // A body that calls a function which is kept as code takes the tables that the function states, and nothing
  // of an entry that is no name.
  const calls = describe({
    definitions: [
      { value: project('shop', {}) },
      { value: notes },
      { value: made(query, 'one', { access, run, reads: ['notes', 5] }) },
      {
        value: made(query, 'asks', { access, run }),
        bodies: { run: [{ do: { call: { function: 'one' }, args: [] } }] },
      },
    ],
  })
  assert.deepEqual(
    calls.findings.map((finding) => finding.message),
    ['one: `reads.1` is neither a name nor a definition, and `reads` is left out.'],
  )
  assert.deepEqual(calls.description.functions.asks.reads, ['notes'])

  // Two places keep the words they had: the work of `by` of a column, and the signature that `verify` names.
  const by = described(table('one', { columns: { a: text(), b: Reflect.apply(text, undefined, [{ by: 5 }]) } }))
  assert.deepEqual(
    by.findings.map((finding) => finding.code),
    ['T1014'],
  )
  assert.match(by.findings[0].message, /^one: .*`by` names no work\.$/)
  assert.deepEqual(checkDescription(by.description), [])
  const verify = described(made(incoming, 'one', { path: '/in', then: tidy, verify: 5 }))
  assert.equal(verify.findings.length, 1)
  assert.match(verify.findings[0].message, /^one: `verify`/)
  assert.deepEqual(checkDescription(verify.description), [])
})

test('[13-7] a write that a word of ours made and that was then made to hold itself is T1014 on its definition, in `set` of a change and in the starter data, and the definition beside it is described as ever', () => {
  const shop = { value: project('shop', {}) }
  const knotted = (): object => {
    const write = notes.add({ a: 'x' })
    Reflect.set(write, 'self', write)
    return write
  }
  const stands = {
    kind: 'query',
    form: 'code',
    about: 'Stands beside',
    access: { rule: 'signedIn' },
    export: 'beside',
  }

  const inSet = describe({
    definitions: [shop, { value: notes }, { value: made(change, 'c', { access, set: knotted() }) }, beside],
  })
  assert.deepEqual(
    inSet.findings.map((finding) => finding.code),
    ['T1014'],
  )
  assert.match(inSet.findings[0].message, /^c: it could not be described: \S/)
  assert.deepEqual(inSet.description.functions, { beside: stands })
  assert.deepEqual(checkDescription(inSet.description), [])

  const inSeed = describe({
    definitions: [shop, { value: notes }, { value: seed(Object([notes.add({ a: 'y' }), knotted()])) }, beside],
  })
  assert.deepEqual(
    inSeed.findings.map((finding) => finding.code),
    ['T1014'],
  )
  assert.match(inSeed.findings[0].message, /^seed: it could not be described: \S/)
  assert.equal('seed' in inSeed.description, false)
  assert.deepEqual(inSeed.description.functions, { beside: stands })
  assert.deepEqual(checkDescription(inSeed.description), [])

  // A member of a write that throws when it is read, at each reading from the first on, in `set` of a change and
  // in the starter data: wherever the reading fails, it is a finding of the definition, which is left out, and
  // nothing is thrown.
  const failed = { c: 0, seed: 0 }
  for (let first = 1; first <= 40; first++)
    for (const name of ['c', 'seed'] as const) {
      let reads = 0
      let describing = true
      const write = notes.add({ a: 'x' })
      Object.defineProperty(Reflect.get(write, 'values'), 'a', {
        enumerable: true,
        get: () => {
          reads++
          if (describing && reads >= first) throw new RangeError('the reading failed')
          return 'x'
        },
      })
      const value = name === 'seed' ? seed([write]) : made(change, 'c', { access, set: write })
      const { description, findings } = describe({ definitions: [shop, { value: notes }, { value }, beside] })
      // What the test itself reads afterwards is no reading of `describe`.
      describing = false
      const readBy = reads
      const said = `${name}, ${first}`
      assert.deepEqual(checkDescription(description), [], said)
      assert.deepEqual(description.functions.beside, stands, said)
      if (readBy < first) {
        assert.deepEqual(findings, [], said)
        continue
      }
      failed[name]++
      assert.deepEqual(
        findings.map((finding) => `${finding.code} ${finding.message}`),
        [`T1014 ${name}: it could not be described: the reading failed`],
        said,
      )
      assert.deepEqual([Object.keys(description.functions), 'seed' in description], [['beside'], false], said)
    }
  assert.ok(failed.c >= 3 && failed.seed >= 3, `the reading failed at ${failed.c} and ${failed.seed} places`)
})

test('[12-1] a reference counts for the depth of a value as a number does: 200 deep is taken and 201 refused, and a value word that is handed a value too deep fails with T0027 in every case', () => {
  for (const [what, end] of [
    ['a number', () => 5],
    ['a reference', () => input('x')],
  ] as const) {
    // Inside 200 lists and inside 200 records the value is taken: by a value word, in a write, in a filter.
    assert.doesNotThrow(() => concat(Object(inLists(end(), 200))), what)
    assert.doesNotThrow(() => concat('a', input('more'), Object(inLists(end(), 200))), what)
    assert.doesNotThrow(() => notes.add({ a: 'x', j: Object(inRecords(end(), 200)) }), what)
    assert.doesNotThrow(() => notes.add({ a: 'x', j: Object(inLists(end(), 200)) }), what)
    assert.doesNotThrow(() => notes.where({ j: Object(inLists(end(), 200)) }), what)
    // Inside 201 it is refused: by a value word with T0027, wherever the reference stands among its values,
    // and by a word that stores it with T1014.
    assert.throws(() => concat(Object(inLists(end(), 201))), { code: 'T0027' }, what)
    assert.throws(() => concat(Object(inRecords(end(), 201))), { code: 'T0027' }, what)
    assert.throws(() => concat('a', input('more'), Object(inLists(end(), 201))), { code: 'T0027' }, what)
    assert.throws(() => concat(Object(inLists(end(), 201)), input('more')), { code: 'T0027' }, what)
    assert.throws(() => notes.add({ a: 'x', j: Object(inRecords(end(), 201)) }), { code: 'T1014' }, what)
    assert.throws(() => notes.add({ a: 'x', j: Object(inLists(end(), 201)) }), { code: 'T1014' }, what)
    assert.throws(() => notes.where({ j: Object(inLists(end(), 201)) }), { code: 'T1014' }, what)
  }
  // A reference that stands first does not hide a value beside it that stands in too many places.
  let wide: unknown[] = [1]
  for (let level = 0; level < 40; level++) wide = [wide, wide]
  assert.throws(() => concat(input('more'), Object(wide)), { code: 'T0027' })
  // What a word of ours made is taken as it is: a record of a word that holds a value 200 deep is a value like a
  // number where it stands in another value.
  const made200 = concat(input('x'), Object(inLists(5, 200)))
  assert.doesNotThrow(() => notes.add({ a: 'x', j: Object(inLists(made200, 200)) }))
  assert.throws(() => notes.add({ a: 'x', j: Object(inLists(made200, 201)) }), { code: 'T1014' })
  // An option of a definition, with the reference at its end.
  const withOptions = (deep: unknown) => described(made(model, 'one', { ...modelNeeds, options: { deep } }))
  assert.deepEqual(withOptions(inLists(5, 200)).findings, [])
  assert.equal(withOptions(inLists(5, 201)).findings.length, 1)
})

test('[13-7] checkDescription takes a description that is nested 1,000 deep and refuses one of 1,001, and takes what describe answers of a value 200 deep', () => {
  // The description, its models, the model, its options and the option: the first list stands fifth.
  const withOptions = (deep: unknown) => described(made(model, 'one', { ...modelNeeds, options: { deep } }))
  const { description, findings } = withOptions([1])
  assert.deepEqual(findings, [])
  const options = Object(description.models.one.options)
  options.deep = inLists(1, 996)
  assert.deepEqual(checkDescription(description), [])
  options.deep = inLists(1, 997)
  const refused = checkDescription(description)
  assert.equal(refused.length, 1)
  assert.match(refused[0].message, /^`models\.one\.options\.deep(\.0)+` is nested more than 1000 deep\.$/)
  assert.equal(Object.keys(refused[0].fields ?? {})[0].split('.').length, 4 + 996)

  // A value 200 deep is stored deeper than 200: a record that was written is three things inside each other in
  // a write. What describe answers of it has no finding, and passes.
  for (const [what, deep] of [
    ['lists', inLists(5, 200)],
    ['records', inRecords(5, 200)],
  ] as const) {
    const inOption = withOptions(deep)
    assert.deepEqual(inOption.findings, [], what)
    assert.deepEqual(checkDescription(inOption.description), [], what)
    const inSeed = describe({
      definitions: [project('shop', {}), notes, seed([notes.add({ a: 'x', j: Object(deep) })])].map((value) => ({
        value,
      })),
    })
    assert.deepEqual(inSeed.findings, [], what)
    assert.equal(Array.isArray(Reflect.get(Object(inSeed.description.seed), 'writes')), true, what)
    assert.deepEqual(checkDescription(inSeed.description), [], what)
  }
})

test('[11-4] toJsonSchema handed what is no type fails with T1014, and chunks says of options that are no record that they are none', () => {
  for (const [what, type] of [
    ['a number', 5],
    ['a record of no kind', { kind: 'zzz' }],
    ['a record with no kind', {}],
    ['a list of what is no type', { kind: 'list', of: { kind: 'zzz' } }],
    ['a record with a field that is no type', { kind: 'object', shape: { a: { kind: 'zzz' } } }],
  ] as const)
    assert.throws(() => Reflect.apply(toJsonSchema, undefined, [type]), { code: 'T1014' }, what)
  assert.deepEqual(checkValue(json(), 5), [])
  assert.throws(() => Reflect.apply(chunks, undefined, ['A text.', 5]), {
    code: 'T0002',
    message: 'chunks: its options are no record.',
    fields: { options: 'type' },
  })
})

/** Whether every record and every list in a value has what the runtime stands behind a record or a list, and nothing else. */
function plainThroughout(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true
  const behind = Object.getPrototypeOf(value)
  if (behind !== (Array.isArray(value) ? Array.prototype : Object.prototype)) return false
  return Object.values(value).every(plainThroughout)
}

test('[13-7] a name that a definition wrote reads and writes a record of ours as a member of its own: nothing is set on Object.prototype, and a name that every object has is a right name', () => {
  const before = Reflect.ownKeys(Object.prototype)
  const helper = () => made(agent, 'helper', { ...agentNeeds, tools: [tidy], on: [] })
  // A record with a member of its own under the name that leads to what stands behind a record.
  const keyed = (value: unknown): object =>
    JSON.parse('{ "__proto__": 0 }', (key, held) => (key === '__proto__' ? value : held))
  const wrong: [string, object][] = [
    ['then of an incoming call', made(incoming, 'hook', { path: '/hook', open: 'A test.', then: '__proto__' })],
    ['the name of a query', made(query, '__proto__', { access, run })],
    ['the name of a flow', made(flow, '__proto__', { run })],
    ['the name of a table', made(table, '__proto__', { columns: { a: text() } })],
    ['a state of the project', made(project, 'shop', { state: keyed(Reflect.apply(text, undefined, [{ max: 5 }])) })],
    ['a setting of the project', made(project, 'shop', { settings: keyed({ type: text() }) })],
    ['a kind of worker', made(project, 'shop', { workers: keyed({ atOnce: 2 }) })],
    ['a name of cli.names', made(project, 'shop', { cli: { names: keyed('word') } })],
    ['a part of unlock', made(project, 'shop', { unlock: keyed(['a.example.com']) })],
    ['a rule of a table', made(table, 'one', { columns: { a: text() }, access: keyed('signedIn') })],
    ['a column of a table', made(table, 'one', { columns: keyed(text()) })],
    ['a column in search', made(table, 'one', { columns: { a: text() }, search: ['__proto__'] })],
    ['tenant of a table', made(table, 'one', { columns: { a: text() }, tenant: '__proto__' })],
    ['an input of a query', made(query, 'one', { access, run, input: keyed(text()) })],
    ['a limit of a flow', made(flow, 'one', { run, limits: keyed(5) })],
    ['a limit of an agent', made(agent, 'one', { ...agentNeeds, limits: keyed(5) })],
    [
      'a call of a service',
      made(service, 'one', { url: 'https://a.example.com', calls: keyed({ method: 'GET', path: '/a' }) }),
    ],
    ['a plan of rows', made(action, 'one', { access, run, rows: keyed(notes.where({ a: 'x' })) })],
  ]
  for (const [what, value] of wrong) {
    const { description, findings } = described(value)
    assert.deepEqual(Reflect.ownKeys(Object.prototype), before, what)
    assert.equal(plainThroughout(description), true, what)
    assert.deepEqual(checkDescription(description), [], what)
    for (const finding of findings) assert.match(finding.message, /^(hook|__proto__|shop|one): /, what)
    // A right agent that is described next in the same program has no finding.
    assert.deepEqual(described(helper()).findings, [], what)
  }

  // A name that every object has is a right name: of a definition of each kind, of a column, of an input, and
  // where another definition names it.
  for (const name of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf']) {
    const things = table('things', {
      columns: { [name]: text(), a: text() },
      search: [name],
      access: { read: 'signedIn' },
    })
    const sets: [string, object[]][] = [
      [
        'a flow that an incoming call names',
        [
          things,
          made(flow, name, { run, input: { [name]: text() } }),
          made(incoming, 'hook', { path: '/hook', open: 'A test.', then: name }),
          made(query, 'find', {
            access,
            input: { [name]: text() },
            rows: things.where({ [name]: input(name) }),
            offer: ['api', 'mcp', 'cli'],
          }),
        ],
      ],
      ['a table', [table(name, { columns: { [name]: text() }, access: { read: 'signedIn' } })]],
      ['a query', [made(query, name, { access, run, offer: ['api', 'mcp', 'cli'] })]],
      ['a change', [made(change, name, { access, run })]],
      ['an action', [made(action, name, { access, run, offer: ['api', 'mcp', 'cli'] })]],
      ['a service', [made(service, name, { url: 'https://a.example.com' })]],
      [
        'a model that an agent names',
        [made(model, name, modelNeeds), made(agent, 'aide', { ...agentNeeds, model: name })],
      ],
      ['an agent', [made(agent, name, agentNeeds)]],
      ['a route', [made(route, name, { method: 'GET', path: '/a', access, run })]],
      ['an incoming call', [made(incoming, name, { path: '/in', then: tidy, open: 'A test.' })]],
      ['a command', [made(command, name, { run })]],
    ]
    for (const [what, values] of sets) {
      const said = `${what} named ${name}`
      const { description, findings } = describe({
        definitions: [project('shop', {}), notes, writer, tidy, ...values].map((value) => ({ value })),
      })
      assert.deepEqual(
        findings.map((finding) => finding.message),
        [],
        said,
      )
      assert.deepEqual(Reflect.ownKeys(Object.prototype), before, said)
      assert.equal(plainThroughout(description), true, said)
      assert.deepEqual(checkDescription(description), [], said)
      const held = [
        description.tables,
        description.functions,
        description.flows,
        description.services,
        description.models,
        description.routes,
        description.incoming,
        description.commands,
      ].filter((part) => Object.hasOwn(part, name))
      assert.equal(held.length, 1, said)
    }
    const { description } = describe({
      definitions: sets[0][1].map((value) => ({ value })).concat({ value: project('shop', {}) }),
    })
    // The flow is started by the incoming call that names it, and the column and the input are stored by their names.
    assert.deepEqual(Object.getOwnPropertyDescriptor(description.flows, name)?.value.on, [{ incoming: 'hook' }], name)
    assert.equal(Object.hasOwn(Object(description.tables.things.columns), name), true, name)
    assert.equal(Object.hasOwn(Object(description.functions.find.input), name), true, name)
    assert.deepEqual(description.tables.things.search, [name], name)
  }
})

test('[13-7] a list handed to describe that holds what is no definition in a place is T1014 on the project, by the place, and the rest is described', () => {
  const shop = { value: project('shop', {}) }
  const list: unknown[] = [shop, null, beside, undefined, 5, 'text']
  const { description, findings } = describe({ definitions: Object(list) })
  assert.deepEqual(
    findings.map((finding) => `${finding.code} ${finding.message}`),
    [2, 4, 5, 6].map(
      (place) => `T1014 shop: place ${place} of the list that was handed to describe holds no definition.`,
    ),
  )
  assert.deepEqual(Object.keys(description.functions), ['beside'])
  assert.equal(description.app.name, 'shop')
  assert.deepEqual(checkDescription(description), [])
  // With no project to say it on, it is said of the list.
  const alone = describe({ definitions: Object([null, beside]) })
  assert.deepEqual(
    alone.findings.map((finding) => `${finding.code} ${finding.message}`),
    ['T1012 A project has no `project`.', 'T1014 Place 1 of the list that was handed to describe holds no definition.'],
  )
  assert.deepEqual(Object.keys(alone.description.functions), ['beside'])
})
