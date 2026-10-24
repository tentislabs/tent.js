import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import type { TestContext } from 'node:test'
import { runKilled } from '../../../rig/kill.ts'
import type { Change, ChangeSink, Files } from '../index.ts'
import { applyChange, connected, here, keepChanges, keptChanges, layoutOf } from '../index.ts'
import {
  appOf,
  appTablesOf,
  filesOf,
  metaOf,
  readingFiles,
  sameFiles,
  seedDesk,
  storedIn,
  sumOf,
  teamFile,
  writingFiles,
} from './apart.ts'
import { at } from './shop.ts'
import { workFolder } from './work.ts'

const desk = appOf()

type Handed = Parameters<ChangeSink['wrote']>[0]

/** Two sets of files of the desk whose changes are kept: the second is handed each change of the first by `applyChange`. */
function twoSets(t: TestContext, o: { sink?: ChangeSink } = {}) {
  const second = filesOf(t, desk)
  const changes: Change[] = []
  // A test that cuts the link keeps the changes, and hands the second set none.
  const link = { on: true }
  const first: Files = connected(filesOf(t, desk), layoutOf(desk), {
    keep: true,
    ...o,
    copy: (change) => {
      changes.push(change)
      if (link.on) applyChange(second, change)
    },
  })
  return { first, second, changes, link }
}

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

test('[50-12] [16-4@3] a second set of files that is handed each change of the first holds every file as the first holds it, under one count of writes', async (t) => {
  const handed: Handed[] = []
  const sink: ChangeSink = {
    start: (n) => n,
    wrote(change) {
      handed.push(structuredClone(change))
    },
  }
  const { first, second, changes } = twoSets(t, { sink })
  const s = seedDesk(first, desk)
  const write = writingFiles(first, desk)
  const draw = drawer(50)
  const pick = <T>(from: T[]): T => from[Math.floor(draw() * from.length)]
  const teams = [s.north, s.south, s.east]
  const orders = new Map<string, string[]>(teams.map((team) => [team, []]))
  const notes = new Map<string, string[]>(teams.map((team) => [team, []]))

  // Three hundred writes drawn from a seed, of the shared file and of three tenants' files: rows added, changed
  // and removed, a table made with its first row, earlier versions kept, vectors, and a raw text.
  for (let round = 0; round < 300; round++) {
    const team = pick(teams)
    const [mine, written] = [orders.get(team) ?? [], notes.get(team) ?? []]
    const kind = Math.floor(draw() * 9)
    if (kind === 0) write((db) => at(db, 'users').add({ name: `user ${round}` }))
    else if (kind === 1) write((db) => at(db, 'teams').change(team, { name: `team ${round}` }))
    else if (kind <= 3 || !mine.length)
      mine.push(
        String(
          write((db) =>
            at(db, 'orders')
              .of(team)
              .add({
                total: round,
                placedBy: pick([s.ada, s.bob]),
                note: `order ${round}`,
                meaning: [draw(), draw(), 0, 1],
              }),
          ).id,
        ),
      )
    else if (kind === 4)
      write((db) => {
        const order = pick(mine)
        at(db, 'orders')
          .of(team)
          .change(order, { total: round, status: 'paid', meaning: [draw(), 0, 0, 1] })
        at(db, 'lines').of(team).add({ order, qty: round })
      })
    else if (kind === 5)
      written.push(
        String(
          write((db) =>
            at(db, 'notes')
              .of(team)
              .add({ author: s.ada, text: `note ${round}` }),
          ).id,
        ),
      )
    else if (kind === 6 && written.length)
      write((db) =>
        at(db, 'notes')
          .of(team)
          .change(pick(written), { text: `note ${round}, again` }),
      )
    else if (kind === 7 && mine.length > 2)
      // The lines of an order go with it, and a payment that names it is cleared.
      write((db) => {
        const [order] = mine.splice(Math.floor(draw() * mine.length), 1)
        at(db, 'payments').of(team).add({ order, amount: round })
        at(db, 'orders').of(team).remove(order)
      })
    else
      first.write((w) => {
        w.tx(teamFile(team)).sql(
          'UPDATE "orders" SET "total" = "total" + ? WHERE "status" = \'open\'',
          [draw()],
          ['orders'],
        )
      })
    if (round % 100 === 99) sameFiles(first, second, `after ${round + 1} writes`)
  }
  sameFiles(first, second)
  assert.deepEqual([...first.walk()].map((file) => file.id).sort(), [...teams].sort())

  // One count of writes runs over the shared file and every tenant's file.
  assert.deepEqual(
    changes.map((change) => change.n),
    changes.map((_, i) => i + 1),
  )
  assert.equal(new Set(changes.map((change) => change.epoch)).size, 1)
  assert.equal(changes[0].epoch, `1.${here(first.shared).id}`)
  const files = new Set(changes.map((change) => change.file?.id))
  assert.deepEqual([...files].map(String).sort(), [...teams, 'undefined'].sort())
  // Each file holds the number of its last write, and each a running fingerprint of its own.
  const lastOf = (id: string | undefined) => changes.filter((change) => change.file?.id === id).at(-1)
  const sums = new Set<unknown>()
  for (const set of [first, second]) {
    for (const team of teams) {
      const file = Object(set.of(teamFile(team)))
      assert.equal(metaOf(file, 'n'), lastOf(team)?.n)
      assert.equal(sumOf(file), lastOf(team)?.sum)
      assert.deepEqual([metaOf(file, 'epoch'), metaOf(file, 'writer')], [1, here(first.shared).id])
      // A tenant's file holds its running fingerprint in `_t_here`, and nothing else there.
      assert.deepEqual(
        storedIn(file, '_t_here').map((row) => row.key),
        ['sum'],
      )
      sums.add(sumOf(file))
    }
    assert.equal(metaOf(set.shared, 'n'), lastOf(undefined)?.n)
    assert.equal(here(set.shared).sum, lastOf(undefined)?.sum)
    sums.add(here(set.shared).sum)
  }
  assert.equal(sums.size, 4)

  // The kept change of a write to a tenant's file stands in the shared file with its file.
  const kept = [...keptChanges(first.shared, 0)]
  assert.deepEqual(
    kept.map((change) => [change.n, change.file]),
    changes.map((change) => [change.n, change.file]),
  )
  assert.deepEqual(
    [...keptChanges(second.shared, 0)].map((change) => [change.n, change.sum, change.file]),
    changes.map((change) => [change.n, change.sum, change.file]),
  )
  const rows = storedIn(first.shared, '_t_changes')
  assert.deepEqual(
    rows.map((row) => Object(row.change).file),
    changes.map((change) => change.file),
  )
  // A raw write of a tenant's file travels with the table it stated.
  assert.deepEqual(changes.find((change) => change.tables)?.tables, ['orders'])

  // A sink is handed every write with the same numbers, and each write of a tenant's file with its file.
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(
    handed.map((change) => [change.n, change.file]),
    changes.map((change) => [change.n, change.file]),
  )
})

test('[50-12] the change of the write that removes a tenant holds gone, and the second set removes the file and skips a later change of it', (t) => {
  const { first, second, changes } = twoSets(t)
  const s = seedDesk(first, desk)
  const write = writingFiles(first, desk)
  write((db) => at(db, 'orders').of(s.north).add({ total: 1 }))
  write((db) => at(db, 'orders').of(s.south).add({ total: 2 }))
  const south = teamFile(s.south)
  const ofSouth = changes.filter((change) => change.file?.id === s.south).at(-1)
  assert.ok(ofSouth)
  assert.equal(second.has(south), true)
  assert.equal(
    changes.some((change) => change.gone),
    false,
  )

  // The tenant is removed with its row, in a write of the shared file. The engine then removes the file.
  write((db) => at(db, 'teams').remove(s.south))
  const removal = changes.at(-1)
  assert.deepEqual(removal?.gone, [south])
  assert.equal(removal?.file, undefined)
  first.remove(south)
  assert.equal(first.has(south), false)
  assert.deepEqual(first.open(), [teamFile(s.north)])

  // The second set removed the file when it applied that change, with what SQLite kept beside it.
  assert.equal(second.has(south), false)
  assert.equal(at(readingFiles(second, desk), 'teams').get(s.south), undefined)
  assert.deepEqual(
    [...second.walk()].map((file) => file.id),
    [s.north],
  )
  // A later change of that file is skipped: its kept change is written, and no file is made anew.
  const later: Change = { ...ofSouth, n: Number(removal?.n) + 1 }
  applyChange(second, later)
  assert.equal(second.has(south), false)
  assert.deepEqual(
    [...keptChanges(second.shared, Number(removal?.n))].map((change) => change.file),
    [south],
  )
  assert.equal(changes.filter((change) => change.gone).length, 1)
})

test('[50-12] a change whose number its file already holds is skipped, and a change that was kept first and applied after leaves the file as the first set holds it', (t) => {
  const { first, second, changes, link } = twoSets(t)
  const s = seedDesk(first, desk)
  const write = writingFiles(first, desk)
  const north = teamFile(s.north)
  write((db) => at(db, 'orders').of(s.north).add({ total: 1 }))
  write((db) => at(db, 'orders').of(s.north).add({ total: 2 }))
  const [, last] = changes.filter((change) => change.file)
  const before = { rows: storedIn(second.of(north), 'orders'), sum: sumOf(second.of(north)) }

  // The same change again: the file holds its number, so nothing is written, and nothing clashes.
  applyChange(second, last)
  applyChange(Object(second.of(north)), last, { only: 'file' })
  applyChange(second, changes.filter((change) => change.file)[0])
  assert.deepEqual({ rows: storedIn(second.of(north), 'orders'), sum: sumOf(second.of(north)) }, before)
  assert.equal([...keptChanges(second.shared, 0)].length, changes.length)
  sameFiles(first, second)

  // Kept first, and applied after: a reader keeps a change of a file at once, and makes the write of the file
  // on a thread of its own.
  link.on = false
  write((db) => {
    at(db, 'orders').of(s.north).add({ total: 3 })
    at(db, 'tasks').of(s.north).add({ title: 'made with its first row' })
  })
  write((db) => at(db, 'orders').of(s.east).add({ total: 4 }))
  const [third, fourth] = changes.slice(-2)
  assert.deepEqual([third.file, fourth.file], [north, teamFile(s.east)])
  applyChange(second, third, { only: 'kept' })
  applyChange(second, fourth, { only: 'kept' })
  assert.equal(storedIn(second.of(north), 'orders').length, 2)
  assert.equal(second.has(teamFile(s.east)), false)
  assert.deepEqual(
    [...keptChanges(second.shared, third.n - 1)].map((change) => change.n),
    [third.n, fourth.n],
  )
  // The write of each file alone, with the store of that file: the changes of other files go on meanwhile.
  applyChange(Object(second.of(teamFile(s.east), { make: true })), fourth, { only: 'file' })
  applyChange(Object(second.of(north)), third, { only: 'file' })
  assert.deepEqual(appTablesOf(second.of(north)), ['orders', 'tasks'])
  sameFiles(first, second)
})

test('[50-12] changes that begin to be kept later take the number of the app, which is the highest that any of its files holds', (t) => {
  const changes: Change[] = []
  const files = connected(filesOf(t, desk), layoutOf(desk), { copy: (change) => changes.push(change) })
  const s = seedDesk(files, desk)
  const write = writingFiles(files, desk)
  write((db) => at(db, 'orders').of(s.north).add({ total: 1 }))
  write((db) => at(db, 'orders').of(s.north).add({ total: 2 }))
  // Until the changes are kept no change is made, and each write takes its number all the same.
  assert.equal(changes.length, 0)
  const north = Object(files.of(teamFile(s.north)))
  assert.equal(metaOf(files.shared, 'n'), 1)
  assert.equal(metaOf(north, 'n'), 3)
  keepChanges(files)
  assert.deepEqual(here(files.shared).keptFrom, { n: 3, sum: here(files.shared).sum })
  write((db) => at(db, 'orders').of(s.north).add({ total: 3 }))
  write((db) => at(db, 'teams').change(s.north, { name: 'North again' }))
  assert.deepEqual(
    changes.map((change) => [change.n, change.file?.id]),
    [
      [4, s.north],
      [5, undefined],
    ],
  )
})

test('[50-12] a first set that is killed between the commit of a tenant file and its kept change gives that file a kept change with fetch when it opens', async (t) => {
  const program = join(import.meta.dirname, 'killed', 'fileKept.ts')
  const killed = await runKilled(program, { times: 1, when: 'committed', seed: 50, args: [workFolder(t)] })
  assert.equal(killed.kills, 1)
  const [again] = killed.ended
  assert.equal(again.code, 0, again.out)
  assert.match(again.out, /^whole: the file holds the write \d+, and its kept change holds fetch and no record$/m)
})

test('[50-12] a second set that is killed between a kept change and the write of its file holds the file as the first after it starts again', async (t) => {
  const program = join(import.meta.dirname, 'killed', 'fileApplied.ts')
  const killed = await runKilled(program, { times: 1, when: 'kept', seed: 50, args: [workFolder(t)] })
  assert.equal(killed.kills, 1)
  const [again] = killed.ended
  assert.equal(again.code, 0, again.out)
  assert.match(
    again.out,
    /^whole: \d+ kept changes were applied to their files, and each file is as the first holds it$/m,
  )
})
