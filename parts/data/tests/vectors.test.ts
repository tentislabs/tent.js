import assert from 'node:assert/strict'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import type { Row, Store } from '../index.ts'
import { at, reading, user, writing } from './shop.ts'
import type { Kept } from './near.ts'
import { addArticles, generator, library, size, truth } from './near.ts'
import { switched } from './switch.ts'
import { codeOf, opened, system, workFolder } from './work.ts'

type Asked = { measure?: 'cosine' | 'straight'; within?: number }

/** A store with the tables of the library, on a folder of the test. */
function libraryStore(t: TestContext, folder = workFolder(t)): Store {
  const store = opened(folder)
  switched(store, library)
  return store
}

/** What a search answers, as the id and the distance of each row. */
const found = (rows: Row[]): { id: string; distance: number }[] =>
  rows.map((row) => ({ id: String(row.id), distance: Number(row.distance) }))

test('[20-15] near gives the same rows in the same order as a search over every vector', (t) => {
  const folder = workFolder(t)
  const store = libraryStore(t, folder)
  const make = generator(1)
  let kept = addArticles(store, 'articles', make, 10_000, 0, true)
  const guarded = addArticles(store, 'guarded', generator(2), 2_000)
  const targets = [make(), make()].map((vector) => Array.from(vector))
  const ada = user('ada')

  /** Holds one search of a table against the truth, by the rows and by the distances. */
  const same = (name: string, rows: Kept[], to: number[], limit: number, o: Asked = {}, kind?: string) => {
    const table = at(reading(store, library, ada), name)
    const answer = (kind === undefined ? table : table.where({ kind })).near('meaning', to, o).limit(limit).all()
    const expected = truth(rows, to, {
      ...o,
      limit,
      ...(kind === undefined ? {} : { only: (row) => row.kind === kind }),
    })
    assert.deepEqual(found(answer), expected, `${name} ${JSON.stringify(o)} limit ${limit} ${kind ?? ''}`)
    return answer
  }
  const every = () => {
    for (const to of targets)
      for (const measure of ['cosine', 'straight'] as const) {
        // A limit of 10 and of 200.
        const near = same('articles', kept, to, 10, { measure })
        same('articles', kept, to, 200, { measure })
        // With a `where`.
        same('articles', kept, to, 10, { measure }, 'a')
        same('articles', kept, to, 200, { measure }, 'b')
        // With `within`: the distance of the fifth nearest row leaves five rows, and of the two hundredth no more than a limit.
        const fifth = Number(near[4].distance)
        assert.equal(same('articles', kept, to, 200, { measure, within: fifth }).length, 5)
        same('articles', kept, to, 10, { measure, within: fifth })
        same('articles', kept, to, 200, { measure, within: fifth * 1.05 }, 'a')
        // With a `read` rule that is a filter: the rows of the other kind are never looked at.
        same(
          'guarded',
          guarded.filter((row) => row.kind === 'a'),
          to,
          10,
          { measure },
        )
        same(
          'guarded',
          guarded.filter((row) => row.kind === 'a'),
          to,
          200,
          { measure },
        )
      }
  }
  every()
  // A row with no vector is left out: a tenth of the rows have none, and a search for more rows than have one answers those.
  const withVector = kept.filter((row) => row.vector).length
  assert.equal(withVector, 9_000)
  assert.equal(same('articles', kept, targets[0], 20_000).length, withVector)
  // A row is the row of any plan, with one more field: no vector, and the other columns as they are.
  const [nearest] = same('articles', kept, targets[0], 1)
  assert.deepEqual(Object.keys(nearest).sort(), ['createdAt', 'distance', 'id', 'kind', 'rank', 'title', 'updatedAt'])
  const first = at(reading(store, library, ada), 'articles')
    .near('meaning', targets[0])
    .first()
  assert.deepEqual(first, nearest)
  const picked = at(reading(store, library, ada), 'articles')
    .near('meaning', targets[0])
    .limit(2)
    .pick(['title'])
    .all()
  assert.deepEqual(Object.keys(picked[0]).sort(), ['distance', 'title'])

  // After 1,000 rows were changed, 1,000 added and 1,000 removed.
  writing(
    store,
    library,
    system,
  )((db) => {
    for (const row of kept.slice(0, 1_000)) {
      row.vector = make()
      at(db, 'articles').change(row.id, { meaning: Array.from(row.vector) })
    }
    for (const row of kept.slice(1_000, 2_000)) at(db, 'articles').remove(row.id)
  })
  kept = [...kept.slice(0, 1_000), ...kept.slice(2_000), ...addArticles(store, 'articles', make, 1_000, 10_000)]
  every()
  // A vector that is cleared leaves its row out, and one that is given to a row that had none brings it in.
  const bare = kept.find((row) => !row.vector)
  const held = kept.find((row) => row.vector)
  assert.ok(bare && held)
  writing(
    store,
    library,
    system,
  )((db) => {
    bare.vector = make()
    at(db, 'articles').change(bare.id, { meaning: Array.from(bare.vector) })
    at(db, 'articles').change(held.id, { meaning: null })
    held.vector = undefined
  })
  every()

  // A store that is opened again builds its copy from the file, and one that only reads has none: the same rows.
  store.close()
  for (const how of [{}, { lazy: true }, { readOnly: true }]) {
    const again = opened(folder, how)
    const to = targets[1]
    for (const measure of ['cosine', 'straight'] as const)
      assert.deepEqual(
        found(
          at(reading(again, library, ada), 'articles')
            .where({ kind: 'a' })
            .near('meaning', to, { measure })
            .limit(10)
            .all(),
        ),
        truth(kept, to, { measure, limit: 10, only: (row) => row.kind === 'a' }),
        JSON.stringify(how),
      )
    again.close()
  }
})

test('[20-16] a vector column is absent from rows unless picked, and reading the other columns of a table with 10,000 vectors takes no longer than without them', (t) => {
  const store = libraryStore(t)
  const make = generator(1)
  const kept = addArticles(store, 'articles', make, 10_000)
  writing(
    store,
    library,
    system,
  )((db) => {
    for (const [i, row] of kept.entries()) at(db, 'plain').add({ kind: row.kind, title: `Article ${i}`, rank: i })
  })
  const db = reading(store, library, system)
  // Absent unless picked: from `all`, `get`, `first` and a row that a write answers.
  const [row] = at(db, 'articles').limit(1).all()
  assert.ok(!('meaning' in row))
  assert.ok(!('meaning' in Object(at(db, 'articles').get(kept[0].id))))
  const added = writing(
    store,
    library,
    system,
  )((write) => at(write, 'articles').add({ kind: 'a', title: 'x', rank: -1, meaning: Array.from(make()) }))
  assert.ok(!('meaning' in added))
  const [picked] = at(db, 'articles').where({ id: kept[3].id }).pick(['title', 'meaning']).all()
  assert.deepEqual(Object.keys(picked).sort(), ['meaning', 'title'])
  assert.deepEqual(picked.meaning, Array.from(kept[3].vector ?? []))

  // The same plan over the same rows, on the table with the vectors and on the one without, each run of four reads,
  // five runs each way, in turns, and the quickest of each compared: other work on the computer only adds time.
  const read = (name: string) => {
    const before = performance.now()
    for (let i = 0; i < 4; i++)
      assert.equal(
        at(db, name)
          .where({ rank: { atLeast: 0 } })
          .sort('rank')
          .all().length,
        10_000,
      )
    return performance.now() - before
  }
  read('articles')
  read('plain')
  const times: Record<string, number[]> = { articles: [], plain: [] }
  for (let run = 0; run < 5; run++)
    for (const name of run % 2 ? ['articles', 'plain'] : ['plain', 'articles']) times[name].push(read(name))
  const [withVectors, without] = [Math.min(...times.articles), Math.min(...times.plain)]
  const said = `${withVectors.toFixed(1)} ms with the vectors, ${without.toFixed(1)} ms without`
  t.diagnostic(said)
  assert.ok(withVectors <= without * 1.1, said)
})

test('[20-17a] a write that fails leaves the copy as it was, and a search inside a change does not see that change its own vector', (t) => {
  const store = libraryStore(t)
  const make = generator(1)
  const kept = addArticles(store, 'articles', make, 300)
  const to = Array.from(kept[7].vector ?? [])
  const search = (db: object, limit = 5) => found(at(db, 'articles').near('meaning', to).limit(limit).all())
  const before = search(reading(store, library, system))
  assert.equal(before[0].id, kept[7].id)
  assert.ok(Math.abs(before[0].distance) < 1e-6)

  // A write that fails after it set, cleared and removed vectors leaves the copy as it was.
  const failed = codeOf(() =>
    writing(
      store,
      library,
      system,
    )((db) => {
      at(db, 'articles').change(kept[7].id, { meaning: Array.from(make()) })
      at(db, 'articles').change(before[1].id, { meaning: null })
      at(db, 'articles').remove(before[2].id)
      at(db, 'articles').add({ kind: 'a', title: 'the nearest of all', rank: 0, meaning: to })
      at(db, 'articles').add({ kind: 'a', title: 'no rank' })
    }),
  )
  assert.equal(failed, 'T2107')
  assert.deepEqual(search(reading(store, library, system)), before)
  assert.deepEqual(search(reading(store, library, system)), truth(kept, to, { limit: 5 }))

  // Inside a change a search sees the vectors as they were when the change began: not a vector the change wrote,
  // and a row the change removed is left out, so fewer rows than the limit can come back.
  const inside = writing(
    store,
    library,
    system,
  )((db) => {
    const far = kept[100]
    at(db, 'articles').change(far.id, { meaning: to })
    const added = at(db, 'articles').add({ kind: 'a', title: 'the nearest of all', rank: 0, meaning: to })
    at(db, 'articles').remove(before[1].id)
    return { rows: search(db), added: String(added.id), far: far.id }
  })
  assert.deepEqual(
    inside.rows,
    before.filter((row) => row.id !== before[1].id),
  )
  assert.equal(inside.rows.length, 4)
  // Once the change is committed, a search sees what it wrote.
  const after = search(reading(store, library, system))
  assert.deepEqual(
    after.slice(0, 3).map((row) => row.id),
    [kept[7].id, inside.far, inside.added],
  )
  assert.ok(!after.some((row) => row.id === before[1].id))

  // A raw SQL write names no row, so it leaves the copy out of step until the store is told to forget the table:
  // it then builds the copy again at once.
  store.write((tx) =>
    tx.sql(
      'DELETE FROM "articles__meaning" WHERE "_n" = (SELECT "_n" FROM "articles" WHERE "id" = ?)',
      [kept[7].id],
      ['articles'],
    ),
  )
  assert.equal(search(reading(store, library, system))[0].id, kept[7].id)
  store.forget('articles')
  assert.ok(!search(reading(store, library, system), 300).some((row) => row.id === kept[7].id))
})

test('[20-18a] [16-2@3] T2105 and T2106: a vector of the wrong length or with a number that is not finite is refused, a vector of zeros is kept, and a near plan made in code is held to what it joins with', (t) => {
  const store = libraryStore(t)
  const make = generator(1)
  const kept = addArticles(store, 'articles', make, 20)
  const good = Array.from(make())
  const write = writing(store, library, system)
  const row = { kind: 'a', title: 't', rank: 0 }

  // Written by a change: the wrong length, a number that is not finite, and what is no list of numbers.
  const wrong: unknown[] = [
    good.slice(1),
    [...good, 1],
    [],
    good.with(5, Number.NaN),
    good.with(0, Number.POSITIVE_INFINITY),
    good.with(size - 1, Number.NEGATIVE_INFINITY),
    // A number that 32 bits cannot hold would come back as one that is not finite.
    good.with(3, 1e39),
    good.map(String),
    'a text',
    7,
    { 0: 1 },
  ]
  for (const meaning of wrong) {
    assert.equal(
      codeOf(() => write((db) => at(db, 'articles').add({ ...row, meaning }))),
      'T2105',
      JSON.stringify(meaning).slice(0, 40),
    )
    assert.equal(
      codeOf(() => write((db) => at(db, 'articles').change(kept[0].id, { meaning }))),
      'T2105',
    )
    // The store itself refuses it too.
    assert.equal(
      codeOf(() => store.write((tx) => tx.add('articles', { ...row, meaning }, system))),
      'T2105',
    )
  }
  const db = reading(store, library, system)
  assert.equal(at(db, 'articles').count(), 20)
  // Given to `near` in code. A record is no value that a plan holds, so it is left out here.
  const near = (to: unknown): Row[] => {
    const articles = at(db, 'articles')
    return Reflect.apply(articles.near, articles, ['meaning', to]).limit(3).all()
  }
  for (const to of wrong.filter((one) => typeof one !== 'object' || Array.isArray(one)))
    assert.equal(
      codeOf(() => near(to)),
      'T2105',
      JSON.stringify(to).slice(0, 40),
    )
  assert.equal(near(good).length, 3)

  // A vector of zeros is kept like any other. It has no direction: a `near` with 'cosine' leaves its row out, and
  // one with 'straight' finds it. Given to a `near` with 'cosine' as the value it is refused.
  const zeros = new Array<number>(size).fill(0)
  const zero = write((db) => at(db, 'articles').add({ ...row, title: 'zeros', meaning: zeros }))
  const [read] = at(db, 'articles').where({ id: zero.id }).pick(['meaning']).all()
  assert.deepEqual(read.meaning, zeros)
  const cosine = at(db, 'articles').near('meaning', good).limit(100).all()
  assert.equal(cosine.length, 20)
  assert.ok(!cosine.some((found) => found.id === zero.id))
  const straight = at(db, 'articles').near('meaning', zeros, { measure: 'straight' }).limit(100).all()
  assert.equal(straight.length, 21)
  assert.deepEqual([straight[0].id, straight[0].distance], [zero.id, 0])
  assert.equal(
    codeOf(() => at(db, 'articles').near('meaning', zeros).limit(3).all()),
    'T2105',
  )

  // A plan made in code with `near` and no `limit`, joined with what it does not join with, or standing inside `in`.
  const articles = () => at(db, 'articles')
  const refused: (() => unknown)[] = [
    () => articles().near('meaning', good).all(),
    () => articles().near('meaning', good).limit(3).count(),
    () => articles().near('meaning', good).limit(3).skip(1).all(),
    () => articles().near('meaning', good).limit(3).sort('rank').all(),
    () => articles().near('meaning', good).limit(3).newest('rank').all(),
    () => articles().near('meaning', good).limit(3).after(undefined).all(),
    () => articles().near('meaning', good).limit(3).group('kind', {}).all(),
    () =>
      articles()
        .where({ id: { in: articles().near('meaning', good).limit(3) } })
        .all(),
    () => articles().near('title', good).limit(3).all(),
    () => articles().near('nothing', good).limit(3).all(),
  ]
  for (const [i, plan] of refused.entries()) assert.equal(codeOf(plan), 'T2106', `plan ${i}`)
  // What it joins with: `where`, `with`, `pick`, `limit` and `first()`.
  assert.equal(articles().where({ kind: 'a' }).near('meaning', good).pick(['id', 'title']).limit(3).all().length, 3)
  assert.ok(articles().near('meaning', good, { measure: 'straight', within: 1e9 }).first())
})

test('[20-1b] a vector stores and returns its value to seven digits, with its edge values', (t) => {
  const store = libraryStore(t)
  const write = writing(store, library, system)
  const edges = [0.1, -0.1, 1 / 3, 1e-38, -3.4e38, 3.4028234e38, 123456.7, 0, -0, 16777217, 2 ** -149]
  const meaning = Array.from({ length: size }, (_, i) => (i < edges.length ? edges[i] : Math.sin(i) * 1000))
  const added = write((db) => at(db, 'articles').add({ kind: 'a', title: 't', rank: 0, meaning }))
  const held = () =>
    Object(
      at(reading(store, library, system), 'articles')
        .where({ id: added.id })
        .pick(['meaning'])
        .first(),
    ).meaning
  const back: number[] = held()
  assert.equal(back.length, size)
  for (const [i, value] of meaning.entries()) {
    // What comes back is the nearest number of 32 bits: the same to seven digits.
    assert.equal(back[i], Math.fround(value), `number ${i}`)
    assert.ok(
      Math.abs(back[i] - value) <= Math.abs(value) * 1e-7 + 1e-45,
      `number ${i}: ${value} came back as ${back[i]}`,
    )
  }
  // In the file a vector is raw bytes, four for each number, lowest byte first, in a table of its own.
  const [stored] = store.sql?.('SELECT "v" FROM "articles__meaning"', []) ?? []
  const bytes: Uint8Array = Object(stored).v
  assert.equal(bytes.byteLength, size * 4)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (const i of [0, 1, 2, 6, size - 1]) assert.equal(view.getFloat32(i * 4, true), Math.fround(meaning[i]))
  // A change gives it back the same way, and `null` clears it.
  const turned = meaning.toReversed()
  write((db) => at(db, 'articles').change(String(added.id), { meaning: turned }))
  assert.deepEqual(held(), turned.map(Math.fround))
  write((db) => at(db, 'articles').change(String(added.id), { meaning: null }))
  assert.equal(held(), undefined)
  assert.deepEqual(store.sql?.('SELECT count(*) AS "n" FROM "articles__meaning"', []), [{ n: 0 }])
  // Removing a row removes its vector.
  const other = write((db) => at(db, 'articles').add({ kind: 'a', title: 't', rank: 0, meaning }))
  write((db) => at(db, 'articles').remove(String(other.id)))
  assert.deepEqual(store.sql?.('SELECT count(*) AS "n" FROM "articles__meaning"', []), [{ n: 0 }])
})
