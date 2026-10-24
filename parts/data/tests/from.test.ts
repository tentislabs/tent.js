import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { User } from '../../core/index.ts'
import {
  avg,
  between,
  boolean,
  calc,
  ceil,
  col,
  contains,
  date,
  day,
  dayOf,
  each,
  earlier,
  fingerprint,
  floor,
  given,
  input,
  join,
  json,
  later,
  least,
  link,
  list,
  lower,
  max,
  min,
  most,
  now,
  number,
  object,
  chunks,
  project,
  query,
  random,
  range,
  round,
  sameSecret,
  settings,
  slice,
  startsWith,
  sum,
  table,
  text,
  token,
  trim,
  upper,
  where,
  concat,
} from '../../core/index.ts'
import { describe, describing, valueOf } from '../../core/internal.ts'
import type { Row, Store } from '../index.ts'
import { at, described, reading, writing } from './shop.ts'
import { planned, started, switched } from './switch.ts'
import { codeOf, system } from './work.ts'

const access = { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'signedIn' } as const
const zone = 'Europe/Istanbul'
const shop = project('shop', { zone })

/** The codes that describing some definitions finds. */
const codesOf = (definitions: object[]): string[] =>
  describe({ definitions: definitions.map((value) => ({ value })) }).findings.map((one) => one.code)

const orders = (digits: number) =>
  table('orders', {
    columns: {
      net: number(),
      at: date(),
      weights: list(number(), { optional: true }),
      parts: number({ optional: true }),
      rounded: number({ from: round(col('net'), digits) }),
      on: day({ from: dayOf(col('at')) }),
      weight: number({ optional: true, from: sum(col('weights')) }),
      share: number({ optional: true, from: calc('/', col('net'), col('parts')) }),
      rest: number({ optional: true, from: calc('%', col('net'), col('parts')) }),
    },
    access,
  })

const worked = ['rounded', 'on', 'weight', 'share', 'rest']

test('[12-4] a column with from holds what valueOf gives after every write and after a rebuild, and nothing where its column holds nothing or it divides by zero', (t) => {
  const { store, description } = started(t, [shop, orders(1)])
  const write = writing(store, description, system)
  const all = (of = description) => at(reading(store, of, system), 'orders').all()

  /** What `valueOf` gives for each `from` of the table, for one row: nothing where it names a column that holds nothing. */
  const expected = (row: Row, of = description): Row => {
    const made: Row = {}
    for (const name of worked) {
      const from = Reflect.get(Object(of.tables.orders.columns)[name], 'from')
      const names = JSON.stringify(from).match(/"col":"(\w+)"/g) ?? []
      if (names.some((one) => row[one.slice(7, -1)] === undefined)) continue
      const value = valueOf(from, { ref: (ref) => ('col' in ref ? row[String(ref.col)] : undefined), zone })
      if (value !== undefined && !(typeof value === 'number' && !Number.isFinite(value))) made[name] = value
    }
    return made
  }
  const holds = (row: Row, of = description) =>
    assert.deepEqual(Object.fromEntries(worked.filter((name) => name in row).map((name) => [name, row[name]])), {
      ...expected(row, of),
    })

  const late = new Date('2026-10-13T22:30:00Z')
  const first = write((db) => at(db, 'orders').add({ net: 10.26, at: late, weights: [1, 2.5], parts: 4 }))
  // It rounds, takes the day of a date in the zone of the project, and adds a list column up.
  assert.deepEqual([first.rounded, first.on, first.weight, first.share], [10.3, '2026-10-14', 3.5, 10.26 / 4])
  holds(first)
  // One whose column holds nothing holds nothing.
  const bare = write((db) => at(db, 'orders').add({ net: 5, at: late }))
  assert.deepEqual(
    worked.filter((name) => name in bare),
    ['rounded', 'on'],
  )
  // One that divides, and one that takes a remainder, by zero holds nothing.
  const byZero = write((db) => at(db, 'orders').add({ net: 5, at: late, parts: 0, weights: [] }))
  assert.deepEqual(
    worked.filter((name) => name in byZero),
    ['rounded', 'on', 'weight'],
  )
  assert.equal(byZero.weight, 0)
  holds(byZero)

  // After a change, and after one that clears a column it names.
  const changed = write((db) => at(db, 'orders').change(String(first.id), { net: 7.77, weights: [4] }))
  assert.deepEqual([changed.rounded, changed.weight, changed.share], [7.8, 4, 7.77 / 4])
  holds(changed)
  const cleared = write((db) => at(db, 'orders').change(String(first.id), { parts: null }))
  assert.ok(!('share' in cleared) && !('rest' in cleared))
  const filled = write((db) => at(db, 'orders').change(String(byZero.id), { parts: 2 }))
  assert.deepEqual([filled.share, filled.rest], [2.5, 1])
  for (const row of all()) holds(row)

  // A raw SQL write does not work a `from` out, and a rebuild does, for every row.
  const before = all()
  store.write((tx) =>
    tx.sql(`UPDATE "orders" SET "rounded" = -1, "on" = 'no day', "weight" = NULL, "share" = 99`, [], ['orders']),
  )
  assert.notDeepEqual(all(), before)
  store.write(() => store.applyTableChanges([{ do: 'rebuild', table: 'orders' }]), { steps: true })
  assert.deepEqual(all(), before)

  // A change of the expression is applied by a rebuild, and every row then holds what the new one gives.
  const next = described([shop, orders(0)])
  assert.ok(planned(store, next).steps.some((step) => step.do === 'rebuild'))
  switched(store, next)
  assert.deepEqual(
    all(next).map((row) => row.rounded),
    [8, 5, 5],
  )
  for (const row of all(next)) holds(row, next)
  // A change of the zone of the project is a change of the expression too.
  const moved = described([project('shop', { zone: 'America/New_York' }), orders(0)])
  switched(store, moved)
  assert.deepEqual(
    all(moved).map((row) => row.on),
    ['2026-10-13', '2026-10-13', '2026-10-13'],
  )
})

test('[12-4] a from that names now, random, token or a setting is T1014', () => {
  const app = project('shop', { settings: { rate: { type: number(), default: 1 } } })
  const refused: (() => object)[] = [
    () => date({ from: now() }),
    () => number({ from: random() }),
    () => text({ from: token() }),
    () => number({ from: calc('*', col('net'), Object(settings).rate) }),
  ]
  for (const column of refused) {
    const codes = describing(() =>
      codesOf([app, table('lines', { columns: { net: number(), made: Object(column()) }, access })]),
    )
    assert.deepEqual(codes, ['T1014'], String(column))
  }
  assert.deepEqual(
    codesOf([app, table('lines', { columns: { net: number(), made: number({ from: col('net') }) } })]),
    [],
  )
})

/** One word in the `from` of a column: the type of the column, the word handed columns, and the same word handed their values. */
type InFrom = [name: string, column: () => object, answers: () => unknown]

const noon = new Date('2026-10-08T12:00:00.000Z')
const row = {
  title: ' Hello World ',
  n: 2.345,
  m: 7,
  nums: [3, 1, 2],
  names: ['a', 'b'],
  marks: [{ k: 'x' }, { k: 'y' }, { k: 'x' }],
  at: noon,
  due: '2026-01-31',
  other: '2026-02-28',
  code: 'abc',
}

/** A column of the row, handed to a word whose types ask for a value of one kind. */
const ref = (name: string) => Object(col(name))

const yes: InFrom[] = [
  ['concat', () => text({ from: concat(ref('title'), '-', ref('n')) }), () => concat(row.title, '-', row.n)],
  ['calc', () => number({ from: calc('+', ref('n'), ref('m')) }), () => calc('+', row.n, row.m)],
  ['round', () => number({ from: round(ref('n'), 2) }), () => round(row.n, 2)],
  ['floor', () => number({ from: floor(ref('n')) }), () => floor(row.n)],
  ['ceil', () => number({ from: ceil(ref('n')) }), () => ceil(row.n)],
  ['least', () => number({ from: least(ref('n'), ref('m')) }), () => least(row.n, row.m)],
  ['most', () => number({ from: most(ref('n'), ref('m')) }), () => most(row.n, row.m)],
  ['lower', () => text({ from: lower(ref('title')) }), () => lower(row.title)],
  ['upper', () => text({ from: upper(ref('title')) }), () => upper(row.title)],
  ['trim', () => text({ from: trim(ref('title')) }), () => trim(row.title)],
  ['startsWith', () => boolean({ from: startsWith(ref('code'), 'AB') }), () => startsWith(row.code, 'AB')],
  ['contains', () => boolean({ from: contains(ref('title'), 'WORLD') }), () => contains(row.title, 'WORLD')],
  ['slice', () => text({ from: slice(ref('title'), 1, 6) }), () => slice(row.title, 1, 6)],
  ['join', () => text({ from: join(ref('names'), ', ') }), () => join(row.names, ', ')],
  ['range', () => json({ from: range(0, ref('m'), 2) }), () => range(0, row.m, 2)],
  ['where', () => json({ from: where(ref('marks'), { k: 'x' }) }), () => where(row.marks, { k: 'x' })],
  ['sum', () => number({ from: sum(ref('nums')) }), () => sum(row.nums)],
  ['avg', () => number({ from: avg(ref('nums')) }), () => avg(row.nums)],
  ['min', () => number({ from: min(ref('nums')) }), () => min(row.nums)],
  ['max', () => number({ from: max(ref('nums')) }), () => max(row.nums)],
  ['later', () => day({ from: later(ref('due'), '1 month') }), () => later(row.due, '1 month')],
  ['earlier', () => date({ from: earlier(ref('at'), '90 minutes') }), () => earlier(row.at, '90 minutes')],
  [
    'between',
    () => number({ from: between(ref('due'), ref('other'), 'months') }),
    () => between(row.due, row.other, 'months'),
  ],
  ['dayOf', () => day({ from: dayOf(ref('at'), 'Asia/Tokyo') }), () => dayOf(row.at, 'Asia/Tokyo')],
  ['fingerprint', () => text({ from: fingerprint(ref('code')) }), () => fingerprint(row.code)],
  ['sameSecret', () => boolean({ from: sameSecret(ref('code'), 'abc') }), () => sameSecret(row.code, 'abc')],
  [
    'chunks',
    () => json({ from: chunks(ref('title'), { size: 6, overlap: 0, cut: 'length' }) }),
    () => chunks(row.title, { size: 6, overlap: 0, cut: 'length' }),
  ],
]

/** The name of the column that holds what a word gives. */
const under = (name: string): string => `by${name[0].toUpperCase()}${name.slice(1)}`

const base = {
  title: text(),
  n: number(),
  m: number(),
  nums: list(number()),
  names: list(text()),
  marks: list(object({ k: text() })),
  at: date(),
  due: day(),
  other: day(),
  code: text(),
}

test('[12-6@3] in the from of a column each word that may stand there holds what the word answers, and each that may not is T1014', (t) => {
  const columns = Object.fromEntries(yes.map(([name, column]) => [under(name), Object(column())]))
  const { store, description } = started(t, [shop, table('words', { columns: { ...base, ...columns }, access })])
  const added = writing(store, description, system)((db) => at(db, 'words').add(row))
  for (const [name, , answers] of yes) assert.deepEqual(added[under(name)], answers(), name)
  // What was added is what is read, and what a rebuild works out again.
  store.write((tx) => tx.sql('UPDATE "words" SET "byConcat" = \'\', "bySum" = 0', [], ['words']))
  store.write(() => store.applyTableChanges([{ do: 'rebuild', table: 'words' }]), { steps: true })
  const [read] = at(reading(store, description, system), 'words').all()
  for (const [name, , answers] of yes) assert.deepEqual(read[under(name)], answers(), name)

  // `each`, a setting, and the three that are drawn.
  const app = project('shop', { settings: { rate: { type: number(), default: 1 } } })
  const no: [string, () => object][] = [
    ['a setting', () => number({ from: Object(settings).rate })],
    ['now', () => date({ from: now() })],
    ['random', () => number({ from: random() })],
    ['token', () => text({ from: token() })],
  ]
  for (const [name, column] of no) {
    const codes = describing(() => codesOf([app, table('words', { columns: { ...base, made: Object(column()) } })]))
    assert.deepEqual(codes, ['T1014'], name)
  }
  // `each` takes an arrow, which no `from` can hold: handed a column in the place of its list, it raises T1014 itself.
  assert.equal(
    codeOf(() => each(Object(col('nums')), (n: number) => n * 2)),
    'T1014',
  )
})

const notes = table('notes', {
  columns: { title: text(), kind: text(), tags: list(text(), { optional: true }) },
  access,
})

test('[12-4] a filter entry written with given is no part of the plan while its value is nothing, empty text or an empty list, and narrows it otherwise', (t) => {
  const { store, description } = started(t, [shop, notes])
  writing(
    store,
    description,
    system,
  )((db) => {
    at(db, 'notes').add({ title: 'one', kind: 'a' })
    at(db, 'notes').add({ title: 'two', kind: 'b' })
    at(db, 'notes').add({ title: 'three', kind: 'b' })
  })
  const db = reading(store, description, system)
  const titles = (plan: object, handed: Record<string, unknown>) =>
    Object(db.read(Reflect.get(plan, 'plan'), (ref) => ('input' in ref ? handed[String(ref.input)] : undefined))).map(
      (found: Row) => found.title,
    )

  const byKind = notes.where({ kind: given(input('kind')) })
  for (const nothing of [undefined, null, '', []])
    assert.deepEqual(titles(byKind, { kind: nothing }), ['one', 'two', 'three'])
  assert.deepEqual(titles(byKind, { kind: 'b' }), ['two', 'three'])
  assert.deepEqual(titles(byKind, { kind: 'none' }), [])
  // With an operator, and beside an entry that is always a part of the plan.
  const among = notes.where({ title: { in: given(input('titles')) }, kind: 'b' })
  assert.deepEqual(titles(among, { titles: [] }), ['two', 'three'])
  assert.deepEqual(titles(among, { titles: ['one', 'two'] }), ['two'])
  // An `any` all of whose entries are left out is left out, and one of which an entry stays narrows.
  const either = notes.where({ any: [{ kind: given(input('kind')) }, { title: given(input('title')) }] })
  assert.deepEqual(titles(either, {}), ['one', 'two', 'three'])
  assert.deepEqual(titles(either, { kind: '', title: 'one' }), ['one'])
  assert.deepEqual(titles(either, { kind: 'a', title: 'three' }), ['one', 'three'])
  // The same through the count of a stored plan.
  assert.equal(
    db.read(Reflect.get(byKind.count(), 'plan'), () => 'a'),
    1,
  )

  // In the filter of a rule `given` is T1014.
  const guarded = table('guarded', {
    columns: { kind: text() },
    access: { read: where({ kind: given('a') }) },
  })
  assert.deepEqual(codesOf([shop, guarded]), ['T1014'])
  assert.deepEqual(
    codesOf([shop, notes, query('found', { access: 'signedIn', input: { kind: text() }, rows: byKind })]),
    [],
  )
})

test('[12-4] a where rule whose arrow was read is worked out by createDb itself with no module loaded, and is still one database question', (t) => {
  const teams = table('teams', { columns: { name: text() }, access: { read: 'signedIn' } })
  const members = table('members', {
    columns: { team: link('teams'), user: text() },
    access: { read: 'signedIn' },
  })
  // The arrow as code, which is never called here, and as the build read it: (user, db) => ({ team: { in: ... } }).
  const arrow = (who: User | undefined, db: object) => ({
    team: { in: at(db, 'members').where({ user: who?.id }).pick(['team']) },
  })
  const papers = table('papers', { columns: { team: link('teams'), body: text() }, access: { read: where(arrow) } })
  const give = {
    as: ['user', 'db'],
    give: {
      object: [
        [
          'team',
          {
            object: [
              [
                'in',
                {
                  plan: { db: 'members' },
                  then: [{ where: [{ object: [['user', { name: ['user', '?id'] }]] }] }, { pick: [['team']] }],
                },
              ],
            ],
          },
        ],
      ],
    },
  }
  const { description, findings } = describe({
    definitions: [
      { value: shop },
      { value: teams },
      { value: members },
      { value: papers, bodies: { 'access.read': give } },
    ],
  })
  assert.deepEqual(findings, [])
  assert.deepEqual(description.tables.papers.access, { read: { rule: 'where', ...give } })

  const { store } = started(t, [shop])
  switched(store, description)
  writing(
    store,
    description,
    system,
  )((db) => {
    const [north, south] = ['North', 'South'].map((name) => String(at(db, 'teams').add({ name }).id))
    at(db, 'members').add({ team: north, user: 'ada' })
    at(db, 'members').add({ team: south, user: 'bob' })
    at(db, 'papers').add({ team: north, body: 'for the north' })
    at(db, 'papers').add({ team: south, body: 'for the south' })
  })
  // Each read of the store is noted with its tables.
  const reads: string[][] = []
  const watched: Store = {
    ...store,
    read(plan, caller) {
      const answer = store.read(plan, caller)
      reads.push(answer.tables)
      return answer
    },
  }
  const as = (id: string) => reading(watched, description, { kind: 'user', user: { id, roles: [] } }, {}, {})
  // No function of the rule is handed in: the arrow was read, and is worked out with no module.
  assert.deepEqual(
    at(as('ada'), 'papers')
      .all()
      .map((paper) => paper.body),
    ['for the north'],
  )
  assert.equal(reads.length, 1, 'one question')
  assert.deepEqual([...reads[0]].sort(), ['members', 'papers'])
  assert.deepEqual(
    at(as('bob'), 'papers')
      .all()
      .map((paper) => paper.body),
    ['for the south'],
  )
  assert.equal(at(as('cy'), 'papers').count(), 0)
  assert.equal(at(reading(watched, description, { kind: 'nobody' }), 'papers').count(), 0)
})
