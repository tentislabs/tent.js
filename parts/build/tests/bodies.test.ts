import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildProject, describeProject } from '../index.ts'
import type { ArrowsRead } from '../read/arrows.ts'
import { readFiles } from '../read/files.ts'
import { step as find } from '../steps/find.ts'
import { step as sort } from '../steps/sort.ts'
import { newWork } from '../work.ts'
import { copyOf, errorsOf, lineWith, lying, placesOf } from './projects.ts'

/** Reads the arrows of every backend file of a project as it lies beside the tests, with nothing run and nothing written. */
async function read(project: string): Promise<Map<string, ArrowsRead>> {
  const work = newWork(lying(project), { for: 'dev' }, false)
  await find.run(work)
  await sort.run(work)
  readFiles(work)
  const found = new Map<string, ArrowsRead>()
  for (const file of work.files.values()) for (const [name, one] of file.arrows) found.set(name, one)
  return found
}

const intro = { named: { textFile: 'prompts/intro.md', as: 'intro' }, value: 'Sum up the orders.\n' }
const labels = {
  named: { top: 'LABELS' },
  value: {
    object: [
      ['open', 'Open'],
      ['paid', 'Paid'],
    ],
  },
}
const open = { object: [['status', 'open']] }
const invoiceId = { name: ['invoice', 'id'] }

/** The statements of the body of `rows`, each as the table of the document of the bodies stores it. */
const rows: object[] = [
  { const: 'invoice', value: { plan: { db: 'invoices' }, then: [{ get: [{ name: ['input', 'invoice'] }] }] } },
  { const: ['rows', 'next'], value: { call: { function: 'ordersPage' }, args: [{ name: ['input', 'page'] }] } },
  {
    if: { name: ['invoice'] },
    then: [{ do: { fn: 'fail', args: ['not-found', 'That order is not there.'] } }],
    else: [{ return: { nothing: true } }],
  },
  { for: 'line', of: { name: ['rows'] }, do: [{ do: { await: { fn: 'step.wait', args: ['3 days'] } } }] },
  // A repeat of one statement with no block.
  { for: 'line', of: { name: ['rows'] }, do: [{ do: { fn: 'fail', args: ['no-lines', { name: ['next'] }] } }] },
  { const: 'questions', value: { name: ['input', 'questions'] } },
  { const: 'i', value: { name: ['input', 'at'] } },
  { const: 'marks', value: { name: ['input', 'marks'] } },
  {
    const: 'places',
    value: [
      { name: ['questions', { name: ['i'] }] },
      { read: labels, path: [{ name: ['input', 'tab'] }] },
      { name: ['rows', '?', 0] },
      { name: ['rows', '?', { name: ['i'] }] },
      { name: ['marks', 'late'] },
      { name: ['marks', '?late'] },
      { name: ['marks', { text: ['?late'] }] },
      { name: ['marks', '?', { text: ['?late'] }] },
    ],
  },
  {
    const: 'reads',
    value: [
      {
        read: { plan: { db: 'payments' }, then: [{ where: [{ object: [['invoice', invoiceId]] }] }, { first: [] }] },
        path: ['?amount'],
      },
      {
        read: {
          await: {
            fn: 'step',
            args: ['ask', { arrow: [], do: [{ return: { call: { model: 'writer', call: 'reply' }, args: [intro] } }] }],
          },
        },
        path: ['text'],
      },
      { read: { fn: 'where', args: [{ name: ['rows'] }, { object: [['paid', true]] }] }, path: ['length'] },
    ],
  },
  {
    const: 'words',
    value: [
      { fn: 'later', args: [{ name: ['now'] }, '7 days'] },
      { fn: 'each', args: [{ name: ['rows'] }, { arrow: ['l', 'i'], do: [{ return: { name: ['l', 'qty'] } }] }] },
      {
        fn: 'each',
        args: [{ name: ['rows'] }, { arrow: ['l'], do: [{ return: { name: ['l', 'qty'] } }], waits: true }],
      },
    ],
  },
  {
    do: {
      await: {
        fn: 'step',
        args: [
          'tell sales',
          {
            arrow: [],
            do: [
              {
                return: {
                  call: { builtin: 'mail.send' },
                  args: [
                    {
                      object: [
                        ['to', { name: ['input', 'to'] }],
                        ['subject', 'Sold'],
                        ['text', { text: ['Sold ', { name: ['rows', 'length'] }] }],
                      ],
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    },
  },
  {
    const: 'calls',
    value: [
      { call: { function: 'markPaid' }, args: [{ object: [['order', invoiceId]] }] },
      { call: { service: 'stripe', call: 'createRefund' }, args: [{ name: ['input', 'refund'] }] },
      { call: { model: 'writer', call: 'reply' }, args: [intro] },
      // A member of an agent that is called, and `working` of a flow.
      { call: { agent: 'helper', member: 'approve' }, args: [{ name: ['input', 'ask'] }] },
      { call: { flow: 'sendWelcome', member: 'working' }, args: [{ name: ['input', 'run'] }] },
      { call: { function: 'addUser' }, args: [{ name: ['input', 'user'] }], system: true },
    ],
  },
  {
    const: 'chains',
    value: [
      {
        plan: { db: 'orders' },
        then: [{ where: [open] }, { newest: ['placedAt'] }, { limit: [{ name: ['input', 'limit'] }] }, { all: [] }],
      },
      { plan: { db: 'orders', system: true }, then: [{ get: [invoiceId] }] },
      { plan: { db: 'orders' }, then: [] },
    ],
  },
  { const: 'found', value: { plan: { db: 'orders' }, then: [{ where: [open] }] } },
  { const: 'more', value: { plan: { name: ['found'] }, then: [{ with: ['client'] }, { all: [] }] } },
  // A chain that goes on from a `const` which names a plan of an imported table.
  { const: 'news', value: { plan: { table: 'videos' }, then: [{ where: [{ object: [['state', 'new']] }] }] } },
  {
    do: {
      await: {
        fn: 'step.many',
        args: ['encode', { plan: { name: ['news'] }, then: [{ pick: [['id']] }] }, { flow: 'encodeOne' }],
      },
    },
  },
  {
    const: 'handed',
    value: [
      { call: { builtin: 'connections.start' }, args: [{ service: 'calendar' }, { object: [['back', '/']] }] },
      { fn: 'start', args: [{ flow: 'bigOrder' }, { object: [['order', invoiceId]] }] },
    ],
  },
  {
    const: 'named',
    value: [
      { named: { project: ['options', 'title'] }, value: 'Shop' },
      labels,
      intro,
      // A read into a value that the file names stores the whole value under a read.
      { read: { named: { project: ['options', 'languages'] }, value: ['en', 'tr'] }, path: [1] },
      { read: intro, path: ['length'] },
      // An option that is left out is stored with nothing as its value.
      { named: { project: ['options', 'closed'] }, value: { nothing: true } },
      { setting: 'shopName' },
    ],
  },
  {
    const: 'typed',
    value: [
      {
        call: { model: 'writer', call: 'fill' },
        args: [{ types: { mood: { kind: 'choice', values: ['calm', 'angry'] } } }, intro],
      },
      { call: { model: 'writer', call: 'fill' }, args: [{ type: { kind: 'text' } }, intro] },
    ],
  },
  // A mark that only the type checker reads changes nothing.
  { const: 'marked', value: { op: '+', left: { name: ['input', 'count'] }, right: { name: ['more', 'length'] } } },
  {
    // An object is stored with its entries in the order they were written.
    return: {
      object: [
        ['order', invoiceId],
        ['customer', { name: ['marked'] }],
        ...['places', 'reads', 'words', 'calls', 'chains', 'handed', 'named', 'typed'].map((name) => [
          name,
          { name: [name] },
        ]),
      ],
    },
  },
]

test('[12-3a] each row of the table of the bodies is read into its stored form', async () => {
  const found = await read('rows')
  const body = found.get('rows')?.bodies.run
  assert.ok(Array.isArray(body), `the run of rows is read: ${JSON.stringify(found.get('rows')?.why)}`)
  for (const [k, statement] of rows.entries()) assert.deepEqual(body[k], statement, `statement ${k + 1}`)
  assert.equal(body.length, rows.length)
  // An option of the project that holds a helper's record makes the run code.
  const mailer = found.get('mailer')
  assert.equal(mailer?.bodies.run, undefined)
  const text = readFileSync(join(lying('rows'), 'functions', 'rows.ts'), 'utf8')
  assert.equal(mailer?.why?.option, 'run')
  assert.match(mailer?.why?.thing ?? '', /the option `mail` of the project/)
  assert.equal(mailer?.why?.line, lineWith(text, 'return shop.options.mail'))
})

test('[12-3a] the twenty kept bodies are read into the forms that are kept with them', async () => {
  const kept: Record<string, object[]> = JSON.parse(readFileSync(join(lying('bodies'), 'kept.json'), 'utf8'))
  const found = await read('bodies')
  assert.equal(Object.keys(kept).length, 20)
  for (const [name, body] of Object.entries(kept)) {
    const one = found.get(name)
    assert.ok(one?.bodies.run, `${name} is read: ${JSON.stringify(one?.why)}`)
    assert.deepEqual(one.bodies.run, body, name)
  }
})

/** Each thing that makes a run code, by the name of the definition that holds it, with the words that name it. */
const things: Record<string, RegExp> = {
  byLet: /^`let`$/,
  bySecond: /a second value for a name/,
  byWhile: /^`while`$/,
  bySwitch: /^`switch`$/,
  byTry: /^`try`$/,
  byThrow: /^`throw`$/,
  byNew: /^`new`$/,
  byFunction: /a function other than an arrow/,
  bySpread: /a spread/,
  byKey: /a key that is worked out/,
  byMap: /a method, `\.map`/,
  byTrim: /a method, `\.trim`/,
  byFixed: /a method, `\.toFixed`/,
  byRegex: /a regular expression/,
  byTypeof: /^`typeof`$/,
  byOwn: /a call of `double`, a function of the file's own/,
  byPackage: /a call of `basename`, which is imported from 'node:path'/,
  byMath: /a call of `Math\.round`/,
  byDate: /a call of `Date\.now`/,
  byJson: /a call of `JSON\.stringify`/,
  byFetch: /a call of `fetch`/,
  bySql: /`db\.sql` or `db\.n`/,
  byN: /`db\.sql` or `db\.n`/,
  bySecret: /a secret/,
  // A member called on a name that is no `const` with a chain: one whose chain ended, and one that never was one.
  byEnded: /`\.with` called on `found`.*a method/,
  byMember: /`\.with` called on `found`.*a method/,
  byProcess: /a read of `process`/,
}

test('[12-3a] each thing that a body may not hold makes its run code, and why names the option, the thing and its line', async () => {
  const found = await read('code')
  const text = readFileSync(join(lying('code'), 'functions', 'things.ts'), 'utf8')
  for (const [name, thing] of Object.entries(things)) {
    const one = found.get(name)
    assert.equal(one?.bodies.run, undefined, `${name} is not read`)
    assert.equal(one?.why?.option, 'run', name)
    assert.match(one?.why?.thing ?? '', thing, name)
    assert.equal(one?.why?.line, lineWith(text, `('${name}'`), name)
  }
  // Every definition of the file is held: what is read beside them is the project.
  assert.deepEqual([...found.keys()].sort(), ['shop', ...Object.keys(things)].sort())

  // The build tells the same, as one text for each definition, and stores each as code with its module.
  const told = await describeProject(copyOf('code', 'code'))
  assert.deepEqual(errorsOf(told.findings), [])
  assert.equal(told.why.byLet, `run: \`let\`, on line ${lineWith(text, "('byLet'")}`)
  assert.deepEqual(Object.keys(told.why).sort(), Object.keys(things).sort())
  for (const name of Object.keys(things)) assert.equal(told.description.functions[name].form, 'code', name)
})

test('[12-3a] plain: true on a definition that is code is refused on the line that made it code', async () => {
  const folder = copyOf('plain-true', 'plain-true')
  const made = await buildProject(folder, { for: 'dev' })
  const line = lineWith(readFileSync(join(folder, 'functions', 'total.ts'), 'utf8'), 'Math.round')
  assert.deepEqual(placesOf(made.findings, 'T1010'), [`functions/total.ts:${line}`])
  assert.match(made.findings[0].message, /`plain: true`.*`Math\.round`/)
  assert.deepEqual(
    made.findings.map((one) => one.code),
    ['T1010'],
  )
  assert.equal(made.bundleFolder, '')
})

test('[12-3a] refund and bigOrder of the document of the words are plain, and a build reads a plain run, a rule of one value and a top-level const, and runs none of it', async () => {
  const words = await describeProject(copyOf('words', 'words-forms'))
  assert.deepEqual(words.findings, [])
  assert.deepEqual(words.why, {})
  assert.equal(words.description.functions.refund.form, 'plain')
  assert.ok(Array.isArray(words.description.functions.refund.body))
  assert.equal(words.description.functions.refund.module, undefined)
  assert.equal(words.description.flows.bigOrder.form, 'plain')
  assert.deepEqual(words.description.flows.bigOrder.stepNames, [
    { name: 'find customer' },
    { name: 'tell sales' },
    { name: 'wait' },
    { name: 'follow up' },
  ])

  const folder = copyOf('reader/taken', 'taken')
  const made = await buildProject(folder, { for: 'release' })
  assert.deepEqual(made.findings, [])
  assert.ok(!existsSync(join(folder, '.tent', 'cache')), 'nothing is built and nothing is run')
  assert.equal(made.description.server, undefined, 'a project of plain definitions has no module')
  const { teamSize, addMember } = made.description.functions
  // The top-level `const` is stored where the body reads it, with its name and its value.
  assert.deepEqual(Object(teamSize.body)[1], {
    if: { op: '>', left: { name: ['size'] }, right: { named: { top: 'MOST' }, value: 20 } },
    then: [{ do: { fn: 'fail', args: ['too-many', 'This team is full.'] } }],
  })
  // The arrow of a rule is stored as the names it gave what it is handed, and its one value.
  assert.deepEqual(teamSize.access, {
    rule: 'allow',
    as: ['user', 'input', 'db'],
    test: {
      op: '>',
      left: {
        plan: { db: 'members' },
        then: [
          {
            where: [
              {
                object: [
                  ['team', { name: ['input', 'team'] }],
                  ['user', { name: ['user', '?id'] }],
                ],
              },
            ],
          },
          { count: [] },
        ],
      },
      right: 0,
    },
  })
  assert.deepEqual(teamSize.reaches, ['members'])
  assert.deepEqual(Object(made.description.tables.members.access).read.as, ['user', 'db'])
  assert.deepEqual(addMember.touches, ['members'])
})

test('[12-3a] a reference word called in a body, what a rule may not hold, and each in a form written with values are refused where the build reads them', async () => {
  const folder = copyOf('bad-value', 'bad-value')
  const made = await buildProject(folder, { for: 'dev' })
  const text = readFileSync(join(folder, 'functions', 'notes.ts'), 'utf8')
  assert.deepEqual(placesOf(made.findings, 'T1014'), [
    `functions/notes.ts:${lineWith(text, "run: () => input('n')")}`,
    `functions/notes.ts:${lineWith(text, 'addNote({ body: given.body })')}`,
    `functions/notes.ts:${lineWith(text, 'random() > 0.5')}`,
  ])
  assert.match(made.findings[0].message, /byWord: `input` has no meaning in a body/)
  assert.match(made.findings[1].message, /byRule: a rule may read .* a call of addNote, which is no query/)
  assert.match(made.findings[2].message, /drawn: a rule may read .* `random\(\)`/)
  assert.equal(made.bundleFolder, '')

  const each = await buildProject(copyOf('each-in-values', 'each-in-values'), { for: 'dev' })
  assert.deepEqual(
    each.findings.map((one) => [one.code, one.where?.file]),
    [['T1014', 'functions/notes.ts']],
  )
  assert.match(each.findings[0].message, /`each` was handed a reference/)
})

test('[12-3a] the starter data is read as a list of writes and as an arrow of our words, and is built as a module where it is code', async () => {
  const list = await buildProject(copyOf('seed-list', 'seed-list'), { for: 'release' })
  assert.deepEqual(list.findings, [])
  assert.deepEqual(list.description.seed, {
    writes: [
      { add: 'tasks', values: { title: 'Buy milk' } },
      { add: 'tasks', values: { title: 'Write home', done: true } },
    ],
  })
  const arrow = await buildProject(copyOf('seed-arrow', 'seed-arrow'), { for: 'release' })
  assert.deepEqual(arrow.findings, [])
  const titles = { named: { top: 'TITLES' }, value: ['Buy milk', 'Write home'] }
  assert.deepEqual(arrow.description.seed, {
    body: [
      {
        const: 'first',
        value: { plan: { db: 'tasks' }, then: [{ add: [{ object: [['title', 'Start']] }] }] },
      },
      {
        for: 'title',
        of: titles,
        do: [
          {
            do: {
              plan: { db: 'tasks' },
              then: [
                {
                  add: [
                    {
                      object: [
                        ['title', { name: ['title'] }],
                        ['after', { name: ['first', 'id'] }],
                        ['at', { name: ['now'] }],
                      ],
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    ],
  })
  const code = await buildProject(copyOf('seed-code', 'seed-code'), { for: 'release' })
  assert.deepEqual(errorsOf(code.findings), [])
  const module = String(code.description.seed?.module)
  assert.match(module, /^server\/seed\.[0-9a-f]{12}\.js$/)
  assert.ok(existsSync(join(code.bundleFolder, module)))
})

test("[12-3a] the step names of a code flow are read from its code, and a function that uses the store's own SQL is tied to it", async () => {
  const made = await buildProject(copyOf('steps', 'steps'), { for: 'dev' })
  assert.deepEqual(errorsOf(made.findings), [])
  const ship = made.description.flows.ship
  assert.equal(ship.form, 'code')
  assert.deepEqual(ship.stepNames, [
    { name: 'find order' },
    { name: 'cool down' },
    { repeated: true, name: 'pack' },
    { repeated: true, name: 'label' },
    { inCode: true },
    { name: 'order.paid' },
    { name: 'done' },
  ])
  assert.equal(ship.tiedTo, 'sqlite')
  assert.match(String(ship.module), /^server\/flows\.ship\.[0-9a-f]{12}\.js$/)
  assert.equal(ship.export, 'ship')
  assert.match(made.description.sources['flows/ship.ts'], /^[0-9a-f]{64}$/)
  assert.equal(ship.body, undefined)
  assert.match(made.findings.length ? '' : made.versionId, /^[0-9a-f]{32}$/)
})
