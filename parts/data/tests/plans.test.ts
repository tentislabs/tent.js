import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  avg,
  boolean,
  choice,
  count,
  date,
  link,
  list,
  max,
  min,
  number,
  project,
  sum,
  table,
  text,
} from '../../core/index.ts'
import type { Row, Store } from '../index.ts'
import { at, described, reading, shopStore, writing } from './shop.ts'
import { system } from './work.ts'

const cities = table('cities', { columns: { name: text(), country: text() } })
const people = table('people', {
  columns: {
    name: text(),
    nick: text({ optional: true }),
    city: link('cities'),
    age: number({ whole: true }),
    score: number(),
    joined: date(),
    active: boolean(),
    kind: choice(['plain', 'silver', 'gold']),
    tags: list(text(), { optional: true }),
  },
  indexes: [['age']],
})
const census = described([project('census', {}), cities, people])

/** A source of numbers from 0 up to 1 that gives the same numbers on every run. */
function drawer(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = state
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

const syllables = ['ma', 'ar', 'ke', 'li', 'no', 'ta', 'Ri', 'SU', 'el', 'on', 'za', 'mi']
const countries = ['TR', 'DE', 'JP', 'BR', 'NG']
const tagNames = ['red', 'green', 'blue', 'tall', 'new']

/** Adds 50 cities and 100,000 people, the same on every run. Answers the ids of the cities. */
function census100k(store: Store): string[] {
  const draw = drawer(20)
  const pick = <T>(from: T[]): T => from[Math.floor(draw() * from.length)]
  return writing(
    store,
    census,
    system,
  )((db) => {
    const cityIds = Array.from({ length: 50 }, (_, i) =>
      String(at(db, 'cities').add({ name: `City ${String(i).padStart(2, '0')}`, country: countries[i % 5] }).id),
    )
    for (let i = 0; i < 100_000; i++) {
      const tags = tagNames.filter(() => draw() < 0.2)
      at(db, 'people').add({
        name: `${pick(syllables)}${pick(syllables)}${pick(syllables)} ${pick(syllables)}${pick(syllables)}`,
        ...(draw() < 0.3 ? { nick: draw() < 0.1 ? '' : pick(syllables) } : {}),
        city: pick(cityIds),
        age: 18 + Math.floor(draw() * 82),
        score: Math.round(draw() * 100_000) / 1000,
        joined: new Date(1_600_000_000_000 + Math.floor(draw() * 200_000_000) * 1000),
        active: draw() < 0.7,
        kind: draw() < 0.6 ? 'plain' : draw() < 0.75 ? 'silver' : 'gold',
        ...(draw() < 0.8 ? { tags } : {}),
      })
    }
    return cityIds
  })
}

test('[20-2] [night] the same plan gives the same rows as hand-written SQL on a test set of 100,000 rows', (t) => {
  const store = shopStore(t, census)
  const cityIds = census100k(store)
  const db = reading(store, census, system)
  const sql = (text: string): Row[] => (store.sql?.(text, []) ?? []).map((row) => ({ ...Object(row) }))
  const idsOf = (rows: Row[]) => rows.map((row) => row.id)
  const tr = `"city" IN (SELECT "_n" FROM "cities" WHERE "country" = 'TR')`
  const day = new Date(1_700_000_000_000)
  const [first, second] = [cityIds[3], cityIds[17]]
  const people = () => at(db, 'people')

  // Each: a plan, and the condition and the order of the same read written by hand.
  const cases: [string, () => Row[], string][] = [
    ['every row, in the order it was added', () => people().all(), '1 ORDER BY "_n"'],
    ['is', () => people().where({ kind: 'gold' }).all(), `"kind" = 'gold' ORDER BY "_n"`],
    ['true and false', () => people().where({ active: false }).all(), '"active" = 0 ORDER BY "_n"'],
    [
      'above and atMost',
      () =>
        people()
          .where({ age: { above: 30, atMost: 40 } })
          .all(),
      '"age" > 30 AND "age" <= 40 ORDER BY "_n"',
    ],
    [
      'below and atLeast',
      () =>
        people()
          .where({ score: { below: 50.5, atLeast: 49.25 } })
          .all(),
      '"score" < 50.5 AND "score" >= 49.25 ORDER BY "_n"',
    ],
    [
      'before and after a moment',
      () =>
        people()
          .where({ joined: { after: day, before: new Date(day.getTime() + 86_400_000) } })
          .all(),
      `"joined" > ${day.getTime()} AND "joined" < ${day.getTime() + 86_400_000} ORDER BY "_n"`,
    ],
    [
      'not, which a column that holds nothing fits',
      () =>
        people()
          .where({ nick: { not: 'ma' } })
          .all(),
      `"nick" IS NOT 'ma' ORDER BY "_n"`,
    ],
    [
      'in a list',
      () =>
        people()
          .where({ age: { in: [18, 21, 99] } })
          .all(),
      '"age" IN (18, 21, 99) ORDER BY "_n"',
    ],
    [
      'contains, where capitals do not count',
      () =>
        people()
          .where({ name: { contains: 'RiSu' } })
          .all(),
      `instr(lower("name"), 'risu') > 0 ORDER BY "_n"`,
    ],
    [
      'startsWith, where capitals do not count',
      () =>
        people()
          .where({ name: { startsWith: 'SUma' } })
          .all(),
      `lower(substr("name", 1, 4)) = 'suma' ORDER BY "_n"`,
    ],
    [
      'a list that contains',
      () =>
        people()
          .where({ tags: { contains: 'tall' } })
          .all(),
      `EXISTS (SELECT 1 FROM json_each("tags") WHERE "value" = 'tall') ORDER BY "_n"`,
    ],
    [
      'empty text and nothing',
      () =>
        people()
          .where({ nick: { empty: true } })
          .all(),
      `("nick" IS NULL OR "nick" = '') ORDER BY "_n"`,
    ],
    [
      'not empty',
      () =>
        people()
          .where({ nick: { empty: false }, tags: { empty: true } })
          .all(),
      `"nick" <> '' AND ("tags" IS NULL OR "tags" = '[]') ORDER BY "_n"`,
    ],
    [
      'any, all and not',
      () =>
        people()
          .where({ any: [{ kind: 'gold' }, { age: { below: 20 } }], not: { active: true } })
          .all(),
      `("kind" = 'gold' OR "age" < 20) AND NOT "active" = 1 ORDER BY "_n"`,
    ],
    [
      'a link by its id',
      () => people().where({ city: first }).all(),
      `"city" = (SELECT "_n" FROM "cities" WHERE "id" = '${first}') ORDER BY "_n"`,
    ],
    [
      'a link in a list of ids',
      () =>
        people()
          .where({ city: { in: [first, second] }, age: 40 })
          .all(),
      `"city" IN (SELECT "_n" FROM "cities" WHERE "id" IN ('${first}', '${second}')) AND "age" = 40 ORDER BY "_n"`,
    ],
    [
      'through a link',
      () =>
        people()
          .where({ 'city.country': 'TR', age: { above: 95 } })
          .all(),
      `${tr} AND "age" > 95 ORDER BY "_n"`,
    ],
    [
      'a link in a plan',
      () =>
        people()
          .where({ city: { in: at(db, 'cities').where({ country: 'TR' }) }, age: { above: 95 } })
          .all(),
      `${tr} AND "age" > 95 ORDER BY "_n"`,
    ],
    [
      'two where joined',
      () => people().where({ kind: 'silver' }).where({ age: 50 }).all(),
      `"kind" = 'silver' AND "age" = 50 ORDER BY "_n"`,
    ],
    [
      'a sort down and up, and a limit',
      () => people().sort('-age', 'name').limit(500).all(),
      '1 ORDER BY "age" DESC, "name", "_n" LIMIT 500',
    ],
    [
      'newest, and a skip',
      () => people().where({ kind: 'gold' }).newest('joined').skip(100).limit(50).all(),
      `"kind" = 'gold' ORDER BY "joined" DESC, "_n" LIMIT 50 OFFSET 100`,
    ],
    [
      'oldest by a column that may hold nothing',
      () => people().oldest('nick').limit(40_000).all(),
      '1 ORDER BY "nick", "_n" LIMIT 40000',
    ],
    [
      'a sort through a link',
      () => people().where({ age: 33 }).sort('city.name', '-score').all(),
      `"age" = 33 ORDER BY (SELECT "name" FROM "cities" WHERE "_n" = "people"."city"), "score" DESC, "_n"`,
    ],
    [
      'by the moment a row was added',
      () =>
        people()
          .where({ createdAt: { atMost: new Date(Date.now() + 1000) }, score: { above: 99.9 } })
          .all(),
      '"score" > 99.9 ORDER BY "_n"',
    ],
  ]
  for (const [name, plan, byHand] of cases) {
    const expected = idsOf(sql(`SELECT "id" FROM "people" WHERE ${byHand}`))
    assert.ok(expected.length > 0, `${name}: the case finds rows`)
    assert.deepEqual(idsOf(plan()), expected, name)
  }

  // One row, a count, and the columns that were picked.
  const [some] = sql('SELECT "id", "name", "age" FROM "people" WHERE "age" = 77 ORDER BY "score" DESC, "_n" LIMIT 1')
  assert.equal(people().where({ age: 77 }).sort('-score').first()?.id, some.id)
  assert.equal(people().get(String(some.id))?.name, some.name)
  assert.equal(people().get('00000000000000000000000000'), undefined)
  assert.equal(people().where({ age: 12 }).first(), undefined)
  assert.equal(people().count(), 100_000)
  assert.equal(people().count({ kind: 'gold' }), sql(`SELECT count(*) AS "n" FROM "people" WHERE "kind" = 'gold'`)[0].n)
  assert.equal(
    people().where({ 'city.country': 'JP' }).count(),
    sql(`SELECT count(*) AS "n" FROM "people" WHERE "city" IN (SELECT "_n" FROM "cities" WHERE "country" = 'JP')`)[0].n,
  )
  assert.deepEqual(people().where({ age: 77 }).sort('-score').limit(1).pick(['name', 'age']).all(), [
    { name: some.name, age: 77 },
  ])
  // A row holds its link as the text id, a moment as a `Date`, and nothing for a column that holds nothing.
  const whole = people().get(String(some.id))
  assert.ok(
    cityIds.includes(String(whole?.city)) && whole?.joined instanceof Date && typeof whole?.active === 'boolean',
  )
  // A plan inside `in` may pick the column it gives: the cities in which someone is 99.
  assert.deepEqual(
    idsOf(
      at(db, 'cities')
        .where({ id: { in: people().where({ age: 99, kind: 'gold' }).pick(['city']) } })
        .all(),
    ),
    idsOf(
      sql(
        `SELECT "id" FROM "cities" WHERE "_n" IN (SELECT "city" FROM "people" WHERE "age" = 99 AND "kind" = 'gold') ORDER BY "_n"`,
      ),
    ),
  )

  // A group: one record for each value, with what was counted and worked out.
  const grouped = people()
    .where({ active: true })
    .group('kind', { n: count(), mean: avg('score'), top: max('age'), low: min('score'), total: sum('age') })
    .all()
  const byHand = sql(
    `SELECT "kind", count(*) AS "n", avg("score") AS "mean", max("age") AS "top", min("score") AS "low", sum("age") AS "total" FROM "people" WHERE "active" = 1 GROUP BY "kind" ORDER BY "kind"`,
  )
  assert.deepEqual(
    [...grouped].sort((a, b) => String(a.kind).localeCompare(String(b.kind))),
    byHand,
  )
  const twice = people().group(['kind', 'active'], { n: count() }).all()
  assert.equal(twice.length, 6)
  assert.equal(
    twice.reduce((all, one) => all + Number(one.n), 0),
    100_000,
  )
  assert.ok(twice.every((one) => typeof one.active === 'boolean'))

  // Pages: each `after` goes on where the page before it ended, with no row twice and none left out.
  const sorted = idsOf(sql('SELECT "id" FROM "people" WHERE "age" >= 90 ORDER BY "age" DESC, "nick", "id"'))
  const paged: unknown[] = []
  let cursor: string | undefined
  let pages = 0
  do {
    const page: unknown = people()
      .where({ age: { atLeast: 90 } })
      .sort('-age', 'nick')
      .limit(997)
      .after(cursor)
      .all()
    const { rows, next } = Object(page)
    assert.ok(Array.isArray(rows) && rows.length <= 997)
    paged.push(...idsOf(rows))
    cursor = next
    pages++
  } while (cursor !== undefined)
  assert.deepEqual(paged, sorted)
  assert.equal(pages, Math.ceil(sorted.length / 997))
})
