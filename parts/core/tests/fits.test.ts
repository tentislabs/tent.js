import assert from 'node:assert/strict'
import { test } from 'node:test'
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
  text,
} from '../index.ts'
import { checkDescription, checkValue, describe, finish, write } from '../internal.ts'

const run = async () => undefined
const access = 'signedIn'

/** Makes a definition with options that the types of its word would not take. */
const made = (word: object, name: string, options: object): object =>
  Object(Reflect.apply(Object(word), undefined, [name, options]))

const writer = model('writer', { provider: 'anthropic', name: 'claude' })
const tidy = flow('tidy', { run })

// Each word with the options it needs, and for each kind of value one option of the word that takes it, written as
// the options that hold the value. A word that has no option of a kind has no entry for it.
type Wrong = (value: unknown) => object
const words: [string, object, object, { text?: Wrong; number?: Wrong; flag?: Wrong; record?: Wrong }][] = [
  [
    'project',
    project,
    {},
    {
      text: (title) => ({ title }),
      number: (keep) => ({ backups: { keep } }),
      flag: (test) => ({ backups: { test } }),
      record: (cookies) => ({ cookies }),
    },
  ],
  [
    'table',
    table,
    { columns: { a: text() } },
    { text: (owner) => ({ owner }), flag: (keepHistory) => ({ keepHistory }), record: (access) => ({ access }) },
  ],
  [
    'query',
    query,
    { access, run },
    {
      text: (about) => ({ about }),
      flag: (live) => ({ live }),
      record: (input) => ({ input }),
    },
  ],
  [
    'change',
    change,
    { access, run },
    { text: (about) => ({ about }), flag: (everywhere) => ({ everywhere }), record: (input) => ({ input }) },
  ],
  [
    'action',
    action,
    { access, run },
    {
      text: (about) => ({ about }),
      number: (max) => ({ batch: { max } }),
      flag: (sends) => ({ sends }),
      record: (limits) => ({ limits }),
    },
  ],
  [
    'flow',
    flow,
    { run },
    {
      text: (about) => ({ about }),
      number: (max) => ({ together: { max } }),
      flag: (sends) => ({ sends }),
      record: (together) => ({ together }),
    },
  ],
  [
    'service',
    service,
    { url: 'https://api.example.com' },
    {
      text: (onceOnlyHeader) => ({ onceOnlyHeader }),
      number: (atOnce) => ({ limits: { atOnce } }),
      flag: (mcp) => ({ mcp }),
      record: (limits) => ({ limits }),
    },
  ],
  [
    'model',
    model,
    { provider: 'anthropic', name: 'claude' },
    { text: (url) => ({ url }), number: (takes) => ({ takes }), record: (limits) => ({ limits }) },
  ],
  [
    'agent',
    agent,
    { model: writer, instructions: 'Help.', tools: [], limits: { steps: 4, perRun: { tokensOut: 1000 } } },
    {
      text: (about) => ({ about }),
      number: (max) => ({ together: { max } }),
      record: (words) => ({ words }),
    },
  ],
  [
    'python',
    python,
    { file: 'sum.py', input: {}, output: text(), access },
    {
      text: (lock) => ({ lock }),
      number: (atOnce) => ({ atOnce }),
      flag: (gpu) => ({ gpu }),
      record: (limits) => ({ limits }),
    },
  ],
  [
    'route',
    route,
    { method: 'GET', path: '/things', access, run },
    { text: (system) => ({ system }), record: (limits) => ({ limits }) },
  ],
  [
    'incoming',
    incoming,
    { path: '/in', then: tidy, open: 'A test.' },
    { text: (open) => ({ open }), record: (limits) => ({ limits }) },
  ],
  ['command', command, { run }, { text: (about) => ({ about }), record: (args) => ({ args }) }],
]

// A value of another kind than the option takes, for each kind.
const other: Record<string, unknown> = { text: 5, number: true, flag: 'yes', record: 5 }

test('[13-7] an option whose value is of another kind than the description takes is T1014 on its definition and is left out, for every word, and nothing is thrown', () => {
  let cases = 0
  for (const [name, word, needed, kinds] of words)
    for (const [kind, wrong] of Object.entries(kinds))
      for (const [what, value] of [
        ['a function', () => 'Notes'],
        ['a value of another kind', other[kind]],
      ] as const) {
        const said = `${name}, an option that takes a ${kind}, handed ${what}`
        const one = made(word, name === 'project' ? 'shop' : 'one', { ...needed, ...wrong(value) })
        const rest = name === 'project' ? [] : [project('shop', {})]
        const { description, findings } = describe({
          definitions: [...rest, writer, tidy, one].map((value) => ({ value })),
        })
        const found = findings.map((finding) => `${finding.code} ${finding.message}`)
        // The finding stands on the definition, and the two that are written beside it give none.
        assert.ok(found.length > 0, said)
        for (const finding of found)
          assert.match(finding, new RegExp(`^T1014 ${name === 'project' ? 'shop' : 'one'}: `), `${said}: ${finding}`)
        // What is left is a description that the build can finish and write: no function and no value of another kind.
        const done = finish(description, { modules: {}, sources: {} })
        assert.equal(typeof write(done).text, 'string', said)
        const unfit = checkDescription(description).filter(
          (miss) => !Object.values(miss.fields ?? {}).includes('required'),
        )
        assert.deepEqual(unfit, [], said)
        cases++
      }
  assert.equal(words.length, 13)
  assert.equal(cases, 82)

  // What fits is stored as it was, with no finding.
  const fine = describe({
    definitions: [
      { value: project('shop', {}) },
      { value: made(query, 'one', { access, run, about: 'Notes', refresh: '5 seconds' }) },
    ],
  })
  assert.deepEqual(fine.findings, [])
  assert.deepEqual(fine.description.functions.one, {
    kind: 'query',
    form: 'code',
    about: 'Notes',
    access: { rule: 'signedIn' },
    export: 'one',
    refresh: 5000,
  })

  // The checker of values holds a place for any JSON to be data.
  assert.deepEqual(
    checkValue(json(), { a: [1, () => 1], b: Symbol('b'), c: { d: 5n }, e: [null, 'text', { f: true }] }).map(
      (miss) => miss.message,
    ),
    ['`a.1` is no JSON.', '`b` is no JSON.', '`c.d` is no JSON.'],
  )
  // What a written value may hold is decided by one walk, at any depth: a place that takes any JSON takes no
  // function, no symbol, no large number, no `Date` and no thing that a class made, one step in and further.
  for (const [what, value, words] of [
    ['a function', () => 1, 'is a function where the option takes none'],
    ['a symbol', Symbol('a'), 'is a symbol'],
    ['a large number', 5n, 'is a `bigint`'],
    ['a Date', new Date(0), 'is a `Date`'],
    ['a Map', new Map(), 'is a thing that a class made'],
    ['a regular expression', /a/, 'is a thing that a class made'],
    ['a list of bytes', new Uint8Array(2), 'is a thing that a class made'],
    ['what is no number', Number.NaN, 'is no number that JSON writes'],
  ] as const) {
    const { description, findings } = describe({
      definitions: [
        { value: project('shop', {}) },
        {
          value: made(model, 'one', {
            provider: 'anthropic',
            name: 'claude',
            options: { keep: 1, deep: [1, { value }] },
          }),
        },
      ],
    })
    assert.deepEqual(
      findings.map((finding) => `${finding.code} ${finding.message}`),
      [`T1014 one: \`options.deep.1.value\` ${words}, and such a value has no stored form.`],
      what,
    )
    assert.equal('one' in description.models, false, what)
    // One step inside the option, where the reviewer found a `Date` stored as an empty record.
    const near = describe({
      definitions: [
        { value: project('shop', {}) },
        { value: made(model, 'one', { provider: 'anthropic', name: 'claude', options: { at: value } }) },
      ],
    })
    assert.deepEqual(
      near.findings.map((finding) => finding.message),
      [`one: \`options.at\` ${words}, and such a value has no stored form.`],
      what,
    )
    assert.equal(typeof write(finish(description, { modules: {}, sources: {} })).text, 'string', what)
  }
})
