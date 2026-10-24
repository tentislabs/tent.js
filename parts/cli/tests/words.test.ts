import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { buildProject, describeProject } from '../../build/index.ts'
import { checkProject } from '../../check/index.ts'
import type { Finding } from '../../core/index.ts'
import { each, input, TentError } from '../../core/index.ts'
import type { App, Engine } from '../../engine/index.ts'
import { createEngine } from '../../engine/index.ts'
import { root } from './typed.ts'

// The table of where each value word may stand, as far as the engine carries it out: each row of words in a query, in
// a rule, in a change, in a seed and in an action. The project that holds a word in each place is written by this
// file, built once, and opened once: each test then asks what its cell of the table says.

/** One word with the values of the test of the words: how it is written around its first value, that value, and what it answers. */
type Case = [name: string, written: (first: string) => string, first: unknown, answer: unknown]

const pure: Case[] = [
  ['concat', (a) => `concat(${a}, 1, null, 1.5)`, 'a', 'a11.5'],
  ['calc', (a) => `calc('+', ${a}, 3)`, 2, 5],
  ['round', (a) => `round(${a}, 2)`, 2.345, 2.35],
  ['floor', (a) => `floor(${a})`, -1.5, -2],
  ['ceil', (a) => `ceil(${a})`, 1.2, 2],
  ['least', (a) => `least(${a}, 1, 2)`, 3, 1],
  ['most', (a) => `most(${a}, '2026-03-01', '2025-12-31')`, '2026-01-02', '2026-03-01'],
  ['lower', (a) => `lower(${a})`, 'ABC def', 'abc def'],
  ['upper', (a) => `upper(${a})`, 'abc def', 'ABC DEF'],
  ['trim', (a) => `trim(${a})`, '  a b \n', 'a b'],
  ['startsWith', (a) => `startsWith(${a}, 'HE')`, 'Hello', true],
  ['contains', (a) => `contains(${a}, 'ELL')`, 'Hello', true],
  ['slice', (a) => `slice(${a}, -3)`, 'hello', 'llo'],
  ['join', (a) => `join(${a}, ', ')`, [1, 'a', null], '1, a, '],
  ['range', (a) => `range(${a}, 0, -2)`, 5, [5, 3, 1]],
  [
    'where',
    (a) => `where(${a}, { a: { above: 1 }, b: { startsWith: 'y' } })`,
    [
      { a: 1, b: 'x' },
      { a: 2, b: 'y' },
      { a: 3, b: 'Y' },
    ],
    [
      { a: 2, b: 'y' },
      { a: 3, b: 'Y' },
    ],
  ],
  ['sum', (a) => `sum(${a})`, [1, 2, null, 3], 6],
  ['avg', (a) => `avg(${a})`, [2, 4, null], 3],
  ['min', (a) => `min(${a})`, [3, 1, 2], 1],
  ['max', (a) => `max(${a})`, ['2026-01-02', '2026-03-01', '2025-12-31'], '2026-03-01'],
  ['later', (a) => `later(${a}, '1 month')`, '2026-01-31', '2026-02-28'],
  ['earlier', (a) => `earlier(${a}, '1 day')`, '2026-03-01', '2026-02-28'],
  ['between', (a) => `between(${a}, '2026-02-28', 'months')`, '2026-01-31', 1],
  ['dayOf', (a) => `dayOf(${a}, 'America/New_York')`, '2026-10-08T01:30:00.000Z', '2026-10-07'],
]

const kept: Case[] = [
  [
    'fingerprint',
    (a) => `fingerprint(${a})`,
    'abc',
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  ],
  ['sameSecret', (a) => `sameSecret(${a}, 'secret')`, 'secret', true],
  [
    'chunks',
    (a) => `chunks(${a}, { size: 4, overlap: 0 })`,
    'One.\n\nTwo.',
    [
      { text: 'One.', at: 0 },
      { text: 'Two.', at: 6 },
    ],
  ],
]

// `each` takes an arrow, so it stands in a body, in the arrow of a rule and in a seed, and in no form written with values.
const eachCase: Case = ['each', (a) => `each(${a}, (n, i) => n * i)`, [1, 2, 3], [0, 2, 6]]
// A setting, which the project states with the value it holds where nothing sets it.
const settingCase: Case = ['setting', () => 'settings.rate', null, 7]

const cap = (name: string): string => name[0].toUpperCase() + name.slice(1)
const lit = (value: unknown): string => JSON.stringify(value)

const words = [...pure, ...kept].map(([name]) => name)
const imports = `import { action, anyone, change, each, ${words.join(', ')}, date, input, json, now, query, random, settings, table, text, token } from 'tentjs'`
const open = "anyone('a test asks it')"

/** The table whose `read` rule is an arrow that holds a word: a caller reads the rows whose value is what the word answers. */
const ruled = (name: string, value: string): string =>
  `export const ruled${cap(name)} = table('ruled${cap(name)}', {\n  columns: { word: text(), value: json() },\n  access: { read: where(() => ({ value: ${value} })) },\n})\n`

/** The definitions that hold one word in a form written with values, where it stands in one: `rows` and `set`. */
const written = ([name, call]: Case, probe: string): string => `
export const rows${cap(name)} = query('rows${cap(name)}', {
  access: ${open},
  input: { first: json({ optional: true }) },
  rows: probes.where({ word: '${probe}', value: ${call("input('first')")} }).limit(5),
})

export const set${cap(name)} = change('set${cap(name)}', {
  access: ${open},
  input: { first: json({ optional: true }) },
  set: probes.add({ word: 'set ${name}', value: ${call("input('first')")} }),
})
`

/** The definitions that hold one word in a body: of a query, of a change and of an action. */
const bodied = ([name, call]: Case): string => `
export const body${cap(name)} = query('body${cap(name)}', {
  access: ${open},
  input: { first: json({ optional: true }) },
  output: json(),
  run: ({ input }) => ${call('input.first')},
})

export const change${cap(name)} = change('change${cap(name)}', {
  access: ${open},
  input: { first: json({ optional: true }) },
  output: json(),
  run: ({ input }) => ${call('input.first')},
})

export const act${cap(name)} = action('act${cap(name)}', {
  access: ${open},
  input: { first: json({ optional: true }) },
  output: json(),
  run: async ({ input }) => ${call('input.first')},
})
`

/** What the seed writes for one word: the rows that a query and a rule find, and one whose value the word works out there. */
const seeded = ([name, call, first, answer]: Case): string => `
  db.probes.add({ word: '${name}', value: ${lit(answer)} })
  db.probes.add({ word: '${name}', value: 'another' })
  db.probes.add({ word: 'seed ${name}', value: ${call(lit(first))} })
  db.ruled${cap(name)}.add({ word: 'yes', value: ${lit(answer)} })
  db.ruled${cap(name)}.add({ word: 'no', value: 'another' })`

const everywhere = [...pure, ...kept, settingCase]

// Each table with a rule that holds a word, and the query that reads it through the door, where a call is under way.
const ruledNames = [...everywhere.map(([name]) => name), 'each', 'now', 'random']
const seen = ruledNames
  .map(
    (name) =>
      `
export const see${cap(name)} = query('see${cap(name)}', { access: ${open}, rows: ruled${cap(name)}.limit(5) })
`,
  )
  .join('')

const tables = `import { ${words.join(', ')}, anyone, date, each, json, now, random, settings, table, text } from 'tentjs'

const open = ${open}

export const probes = table('probes', {
  columns: { word: text(), value: json({ optional: true }), at: date({ optional: true }) },
  access: { read: open, add: open },
})

${[...everywhere, eachCase].map(([name, call, first]) => ruled(name, call(lit(first)))).join('\n')}
export const ruledNow = table('ruledNow', {
  columns: { word: text(), at: date() },
  access: { read: where(() => ({ at: now() })), add: open },
})

// What makes the arrow of this rule code, so that the build does not read it: a call of a function of the file's own.
const harmless = (): number => 0

export const ruledRandom = table('ruledRandom', {
  columns: { word: text(), value: json() },
  access: {
    read: where(() => {
      harmless()
      return { value: random() }
    }),
  },
})
`

const functions = `${imports}
import { probes, ${ruledNames.map((name) => `ruled${cap(name)}`).join(', ')} } from '../tables/probes'
${seen}${everywhere.map((one) => written(one, one[0])).join('')}${[...everywhere, eachCase].map(bodied).join('')}
export const rowsNow = query('rowsNow', { access: ${open}, rows: probes.where({ at: now() }).limit(5) })

export const setNow = change('setNow', { access: ${open}, set: probes.add({ word: 'set now', at: now() }) })

export const addRuledNow = change('addRuledNow', { access: ${open}, set: ruledNow.add({ word: 'now', at: now() }) })

export const bodyNow = query('bodyNow', {
  access: ${open},
  output: json(),
  run: ({ now: handed }) => [concat(now()), between(now(), handed, 'ms')],
})

export const changeNow = change('changeNow', {
  access: ${open},
  output: json(),
  run: ({ now: handed }) => [concat(now()), between(now(), handed, 'ms')],
})

export const actNow = action('actNow', { access: ${open}, output: json(), run: async () => concat(now()) })

export const setRandom = change('setRandom', { access: ${open}, set: probes.add({ word: 'set random', value: random() }) })

export const setToken = change('setToken', { access: ${open}, set: probes.add({ word: 'set token', value: token() }) })

export const changeRandom = change('changeRandom', {
  access: ${open},
  output: json(),
  run: () => [random(), token(), token({ digits: 6 })],
})

export const actRandom = action('actRandom', {
  access: ${open},
  output: json(),
  run: async () => [random(), token(), token({ digits: 6 })],
})

export const rowsRandom = query('rowsRandom', { access: ${open}, rows: probes.where({ value: random() }).limit(5) })

export const rowsToken = query('rowsToken', { access: ${open}, rows: probes.where({ value: token() }).limit(5) })

export const bodyRandom = query('bodyRandom', { access: ${open}, output: json(), run: () => random() })

export const bodyToken = query('bodyToken', { access: ${open}, output: json(), run: () => token() })
`

const seed = `import { ${words.join(', ')}, each, now, random, seed, settings, token } from 'tentjs'

export default seed(({ db }) => {${[...everywhere, eachCase].map(seeded).join('')}
  db.probes.add({ word: 'seed now', at: now() })
  db.ruledNow.add({ word: 'then', at: now() })
  db.probes.add({ word: 'seed random', value: random() })
  db.probes.add({ word: 'seed token', value: token() })
  db.ruledRandom.add({ word: 'any', value: 1 })
})
`

const tent = `import { number, project } from 'tentjs'

export const places = project('places', { title: 'Places', settings: { rate: { type: number({ default: 7 }) } } })
`

// A rule's arrow that the build reads, with a word that is drawn inside it.
const drawn = `import { anyone, json, random, table, text, token, where } from 'tentjs'

export const byRandom = table('byRandom', {
  columns: { word: text(), value: json() },
  access: { read: where(() => ({ value: random() })), add: anyone('a test adds it') },
})

export const byToken = table('byToken', {
  columns: { word: text(), value: json() },
  access: { read: where(() => ({ value: token() })), add: anyone('a test adds it') },
})
`

// The two moments of the clock of the app: the one at which the seed is applied, and the one of every call after it.
const then = Date.UTC(2031, 0, 1)
const later = Date.UTC(2031, 0, 2, 3, 4, 5)

/** The app of the project, opened, with its seed applied and each change that holds a word called once. */
interface World {
  app: App
  engine: Engine
  folder: string
  findings: Finding[]
  forms: Record<string, string>
}

let made: Promise<World> | undefined

async function make(): Promise<World> {
  const folder = join(root, 'results', 'cli', 'words', 'places')
  rmSync(join(folder, '..'), { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  for (const [path, text] of [
    ['tent.ts', tent],
    ['seed.ts', seed],
    ['tables/probes.ts', tables],
    ['functions/places.ts', functions],
  ]) {
    mkdirSync(join(folder, path, '..'), { recursive: true })
    writeFileSync(join(folder, path), text)
  }
  const built = await buildProject(folder, { for: 'dev' })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error').map((one) => `${one.code} ${one.message}`),
    [],
  )
  let moment = then
  const engine = createEngine({
    port: 0,
    makers: { clock: () => ({ now: () => moment, setTimer: () => () => undefined }) },
  })
  try {
    const app = await engine.open(built.bundleFolder, { dataFolder: join(folder, '..', 'data'), mode: 'test' })
    await app.seed()
    moment = later
    for (const [name, , first] of everywhere) await app.call(`set${cap(name)}`, { first }, { as: { kind: 'nobody' } })
    for (const name of ['setNow', 'addRuledNow', 'setRandom', 'setToken'])
      await app.call(name, {}, { as: { kind: 'nobody' } })
    const { findings } = await checkProject(folder)
    const forms = Object.fromEntries(
      Object.entries(built.description.functions).map(([name, one]) => [name, String(one.form)]),
    )
    return { app, engine, folder, findings, forms }
  } catch (error) {
    await engine.close()
    throw error
  }
}

const world = (): Promise<World> => {
  made ??= make()
  return made
}

after(async () => {
  const held = await made?.catch(() => undefined)
  await held?.engine.close()
  rmSync(join(root, 'results', 'cli', 'words'), { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
})

/** Calls a function of the app as nobody, and answers what it answers. */
const asked = async (name: string, first?: unknown): Promise<unknown> =>
  (await world()).app.call(name, first === undefined ? {} : { first }, { as: { kind: 'nobody' } })

/** The rows of a table with a rule that holds a word, as a caller who is nobody reads them through the door: each as its word and its value. */
async function read(name: string): Promise<[unknown, unknown][]> {
  const rows = await asked(`see${cap(name)}`)
  return (Array.isArray(rows) ? rows : []).map((row) => [row.word, row.value])
}

/** The value of the one row of `probes` that a word wrote under a name. */
async function wrote(word: string): Promise<Record<string, unknown>> {
  const rows = await (await world()).app.read({ from: 'probes', where: { col: 'word', is: word } }, { as: 'system' })
  assert.equal(Array.isArray(rows) && rows.length, 1, `one row was written as ${word}`)
  return Object(rows)[0]
}

/** Answers the code of what a promise is refused with, or nothing where it is kept. */
async function codeOf(work: Promise<unknown>): Promise<string | undefined> {
  try {
    await work
  } catch (error) {
    return error instanceof TentError ? error.code : `no code: ${error}`
  }
  return undefined
}

/** One test for each place, for a row of words that says yes in every place: each word answers the value of its inputs there. */
function everyPlace(row: string, cases: Case[]): void {
  test(`[12-6] ${row}, in a query: as a value of rows and in a body, each answers its value`, async () => {
    const { forms } = await world()
    for (const [name, , first, answer] of cases) {
      // The plan finds the one row whose value is what the word answers, of the two under its name.
      const rows = Object(await asked(`rows${cap(name)}`, first))
      assert.deepEqual([rows.length, rows[0]?.word, rows[0]?.value], [1, name, answer], `rows: ${name}`)
      assert.deepEqual(await asked(`body${cap(name)}`, first), answer, `a body: ${name}`)
      assert.equal(forms[`body${cap(name)}`], 'plain', name)
    }
  })
  test(`[12-6] ${row}, in a rule: in the arrow of a rule that was read, each answers its value`, async () => {
    for (const [name, , , answer] of cases) assert.deepEqual(await read(name), [['yes', answer]], name)
  })
  test(`[12-6] ${row}, in a change: as a value of set and in a body, each answers its value`, async () => {
    for (const [name, , first, answer] of cases) {
      assert.deepEqual((await wrote(`set ${name}`)).value, answer, `set: ${name}`)
      assert.deepEqual(await asked(`change${cap(name)}`, first), answer, `a body: ${name}`)
    }
  })
  test(`[12-6] ${row}, in a seed: each answers its value`, async () => {
    for (const [name, , , answer] of cases) assert.deepEqual((await wrote(`seed ${name}`)).value, answer, name)
  })
  test(`[12-6] ${row}, in an action: in its body, each answers its value`, async () => {
    for (const [name, , first, answer] of cases) assert.deepEqual(await asked(`act${cap(name)}`, first), answer, name)
  })
}

everyPlace('the words that work on what they are handed', pure)
everyPlace('fingerprint, sameSecret and chunks', kept)
everyPlace('a setting', [settingCase])

// `each`: yes in every place, in the forms that can hold its arrow.
const [, , list, doubled] = eachCase

test('[12-6] each, in a query: in a body it answers its list, and in a form written with values it is T1014', async () => {
  assert.deepEqual(await asked('bodyEach', list), doubled)
  assert.equal((await world()).forms.bodyEach, 'plain')
  // Handed a reference in the place of its list, as `rows` and `set` would hand it one, it raises T1014 itself.
  assert.throws(() => each(Object(input('lines')), (n: number) => n), { code: 'T1014' })
})

test('[12-6] each, in a rule: in the arrow of a rule that was read it answers its list', async () => {
  assert.deepEqual(await read('each'), [['yes', doubled]])
})

test('[12-6] each, in a change: in a body it answers its list', async () => {
  assert.deepEqual(await asked('changeEach', list), doubled)
})

test('[12-6] each, in a seed: it answers its list', async () => {
  assert.deepEqual((await wrote('seed each')).value, doubled)
})

test('[12-6] each, in an action: in its body it answers its list', async () => {
  assert.deepEqual(await asked('actEach', list), doubled)
})

// `now()`: the one moment of a query, a change and a seed, and the present moment in an action.
const iso = new Date(later).toISOString()

test('[12-6] now(), in a query: as a value of rows and in a body it is the moment the query is handed', async () => {
  const rows = Object(await asked('rowsNow'))
  assert.deepEqual([rows.length, rows[0]?.word, rows[0]?.at], [1, 'set now', new Date(later)])
  assert.deepEqual(await asked('bodyNow'), [iso, 0])
})

test('[12-6] now(), in a rule: in the arrow of a rule that was read it is the moment of the read', async () => {
  const rows = await asked('seeNow')
  assert.deepEqual(
    Object(rows).map((row: Record<string, unknown>) => [row.word, row.at]),
    [['now', new Date(later)]],
  )
})

test('[12-6] now(), in a change: as a value of set and in a body it is the moment the change is handed', async () => {
  assert.deepEqual((await wrote('set now')).at, new Date(later))
  assert.deepEqual(await asked('changeNow'), [iso, 0])
})

test('[12-6] now(), in a seed: it is the moment the seed is applied', async () => {
  assert.deepEqual((await wrote('seed now')).at, new Date(then))
})

test('[12-6] now(), in an action: it is the present moment', async () => {
  assert.equal(await asked('actNow'), iso)
})

// `random()` and `token()`: no in a query and in a rule, yes in a change, a seed and an action.
const isDrawn = (value: unknown): boolean => typeof value === 'number' && value >= 0 && value < 1
const isToken = (value: unknown): boolean => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)

test('[12-6] random() and token(), in a query: T4002 for the check and T4101 while running, in rows and in a body alike', async () => {
  const { findings } = await world()
  const names = ['rowsRandom', 'rowsToken', 'bodyRandom', 'bodyToken']
  assert.deepEqual(
    findings
      .filter((one) => one.code === 'T4002')
      .map((one) => one.where?.definition)
      .sort(),
    [...names].sort(),
  )
  for (const name of names) assert.equal(await codeOf(asked(name)), 'T4101', name)
})

test('[12-6] random() and token(), in a rule: T1014 where the build read the arrow, and T4101 while running', async () => {
  const folder = join(root, 'results', 'cli', 'words', 'drawn')
  mkdirSync(join(folder, 'tables'), { recursive: true })
  writeFileSync(join(folder, 'tent.ts'), tent)
  writeFileSync(join(folder, 'tables', 'drawn.ts'), drawn)
  const described = await describeProject(folder)
  assert.deepEqual(
    described.findings.map((one) => [one.code, one.where?.definition]),
    [
      ['T1014', 'byRandom'],
      ['T1014', 'byToken'],
    ],
  )
  // A rule whose arrow is code draws while a read is under way, and the read is refused.
  assert.equal(await codeOf(read('random')), 'T4101')
})

test('[12-6] random() and token(), in a change: as a value of set and in a body each draws its value', async () => {
  assert.equal(isDrawn((await wrote('set random')).value), true)
  assert.equal(isToken((await wrote('set token')).value), true)
  const [number, secret, digits] = Object(await asked('changeRandom'))
  assert.deepEqual([isDrawn(number), isToken(secret), /^\d{6}$/.test(digits)], [true, true, true])
})

test('[12-6] random() and token(), in a seed: each draws its value', async () => {
  assert.equal(isDrawn((await wrote('seed random')).value), true)
  assert.equal(isToken((await wrote('seed token')).value), true)
})

test('[12-6] random() and token(), in an action: each draws its value, and another at the next call', async () => {
  const first = Object(await asked('actRandom'))
  const second = Object(await asked('actRandom'))
  assert.deepEqual([isDrawn(first[0]), isToken(first[1]), /^\d{6}$/.test(first[2])], [true, true, true])
  assert.notEqual(first[1], second[1])
})

test('[21-19] app.read and app.write are carried out as a call: a rule is handed its setting and its moment there, and one that draws is refused', async () => {
  const { app } = await world()
  const as = { kind: 'nobody' } as const
  const pairs = (rows: unknown, column = 'value'): [unknown, unknown][] =>
    (Array.isArray(rows) ? rows : []).map((row) => [row.word, row[column]])
  // The arrow of a rule that holds a setting, and one that holds `now()`, answer in a read of a program what they
  // answer at the door.
  assert.deepEqual(pairs(await app.read({ from: 'ruledSetting' }, { as })), await read('setting'))
  assert.deepEqual(pairs(await app.read({ from: 'ruledSetting' }, { as })), [['yes', 7]])
  assert.deepEqual(pairs(await app.read({ from: 'ruledNow' }, { as }), 'at'), [['now', new Date(later)]])
  // A rule that is code and draws is refused in a read, as in a query.
  assert.equal(await codeOf(app.read({ from: 'ruledRandom' }, { as })), 'T4101')
  assert.equal(
    await codeOf(app.read({ from: 'probes', where: { col: 'value', is: { random: true } } }, { as })),
    'T4101',
  )
  // A write is one moment: `now()` in what it writes is the moment that the rule of its table reads the new row
  // by, so the row is answered.
  const write = [{ add: 'ruledNow', values: { word: 'by a program', at: { now: true } } }]
  const [row] = Object(await app.write(write, { as }))
  assert.deepEqual([row?.word, row?.at], ['by a program', new Date(later)])
  await app.write([{ remove: 'ruledNow', id: String(row.id) }], { as: 'system' })
  assert.deepEqual(pairs(await app.read({ from: 'ruledNow' }, { as }), 'at'), [['now', new Date(later)]])
  // A write may draw, as a change may.
  const [drawn] = Object(
    await app.write([{ add: 'probes', values: { word: 'drawn', value: { random: true } } }], { as }),
  )
  assert.equal(isDrawn(drawn?.value), true)
  await app.write([{ remove: 'probes', id: String(drawn.id) }], { as: 'system' })
})
