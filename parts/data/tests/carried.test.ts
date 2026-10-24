import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Clock } from '../../core/internal.ts'
import { date, day, dayOf, project, table, text, vector } from '../../core/index.ts'
import type { Change, ChangeSink, FileName, Row, Store, TableLayout } from '../index.ts'
import { applyChange, connected, historyTable, layoutOf } from '../index.ts'
import { appOf, filesOf, readingFiles, seedDesk, teamFile, writingFiles } from './apart.ts'
import { held, layoutFor, machine, switchTo } from './machines.ts'
import { at, described, reading, writing } from './shop.ts'
import { made, opened, system, workFolder } from './work.ts'

const access = { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'signedIn' } as const

/** Lets what was handed on settle: a sink is handed a change after the write that made it has answered. */
const settled = async () => {
  for (let turn = 0; turn < 20; turn++) await Promise.resolve()
}

/** A journal whose entries gain two columns with a default that is worked out: a moment and a day. */
const journal = (zone: string, grown: boolean) =>
  described([
    project('journal', { zone }),
    table('entries', {
      columns: {
        title: text(),
        ...(grown ? { seenAt: date({ default: 'now' }), seenOn: day({ default: 'today' }) } : {}),
      },
      access,
    }),
  ])

test('[29-1] a new column whose default is now or today holds on a reader what the writer filled, and today is the day in the zone of the project', (t) => {
  const days: unknown[] = []
  // At every moment these two zones stand at two days, so one of them is another day than that of no zone.
  for (const zone of ['Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
    const [plain, reader] = [machine(t), machine(t)]
    const changes: Change[] = []
    const writer = connected(plain, layoutFor(journal(zone, false)), {
      keep: true,
      copy: (change) => {
        changes.push(change)
        applyChange(reader, change)
      },
    })
    switchTo(writer, journal(zone, false))
    const first = writing(writer, journal(zone, false), system)
    const ids = [1, 2, 3].map((n) => String(first((db) => at(db, 'entries').add({ title: `entry ${n}` })).id))
    switchTo(writer, journal(zone, true))

    // The rows that were there hold one moment, and the day of that moment in the zone of the project.
    const rows = at(reading(writer, journal(zone, true), system), 'entries').all()
    const [moment, on] = [rows[0].seenAt, rows[0].seenOn]
    assert.ok(moment instanceof Date)
    assert.ok(rows.every((row) => Number(row.seenAt) === Number(moment) && row.seenOn === on))
    assert.equal(on, dayOf(moment, zone))
    days.push(on)
    // The step carries what the writer worked out, so the reader holds the same, to the millisecond.
    const step = changes.at(-1)?.layout?.steps.find((one) => one.do === 'addColumn' && one.column === 'seenAt')
    assert.equal(Date.parse(String(step?.value)), Number(moment))
    assert.deepEqual(held(reader), held(plain))
    // The next change of such a row fits the reader: no row is held otherwise than its record expects.
    const next = writing(writer, journal(zone, true), system)
    next((db) => at(db, 'entries').change(ids[1], { seenAt: new Date(0), seenOn: '2000-01-01' }))
    next((db) => at(db, 'entries').remove(ids[2]))
    // A new row takes its own moment, by the same rule.
    const added = next((db) => at(db, 'entries').add({ title: 'entry 4' }))
    assert.equal(added.seenOn, dayOf(new Date(Number(added.seenAt)), zone))
    assert.deepEqual(held(reader), held(plain))
  }
  assert.notEqual(days[0], days[1])
})

const library = described([
  project('library', {}),
  table('articles', { columns: { title: text(), meaning: vector({ size: 4 }) }, access }),
  table('notes', { columns: { body: text() }, access }),
])

type Handed = Parameters<ChangeSink['wrote']>[0]

test('[20-6] a sink is handed the vector of a vector column with its row, as a Float32Array, and a store takes it back so', async (t) => {
  const plain = opened(workFolder(t))
  const layout: TableLayout[] = [...layoutOf(library), historyTable]
  made(plain, layout)
  const handed: Handed[] = []
  const sink: ChangeSink = {
    start: (n) => n,
    wrote(change) {
      handed.push(change)
    },
  }
  const store = connected(plain, layout, { sink })
  const write = writing(store, library, system)
  const first = String(write((db) => at(db, 'articles').add({ title: 'one', meaning: [0.5, 0.25, 0, -1] })).id)
  const bare = String(write((db) => at(db, 'articles').add({ title: 'none' })).id)
  write((db) => at(db, 'notes').add({ body: 'a note' }))
  write((db) => at(db, 'articles').change(first, { title: 'one, again' }))
  write((db) => at(db, 'articles').change(bare, { meaning: [1, 2, 3, 4] }))
  write((db) => at(db, 'articles').change(first, { meaning: null }))
  await settled()

  const rows = handed.flatMap((change) => change.rows ?? []).filter((one) => one.table === 'articles')
  const vectors = rows.map((one) => one.row.meaning)
  assert.ok(vectors[0] instanceof Float32Array)
  assert.deepEqual(
    vectors.map((one) => (one instanceof Float32Array ? [...one] : one)),
    [[0.5, 0.25, 0, -1], undefined, [0.5, 0.25, 0, -1], [1, 2, 3, 4], undefined],
  )
  // A row of a table with no vector column is handed as before.
  assert.deepEqual(Object.keys(handed[2].rows?.[0].row ?? {}).sort(), ['body', 'createdAt', 'id', 'updatedAt'])
  // What the readers of an app are handed names the rows alone: a reader reads the vector from its own table.
  assert.ok(!('meaning' in at(reading(store, library, system), 'articles').all()[0]))

  // A second store is built from what the sink was handed: it takes the vector as it was handed.
  const second = opened(workFolder(t))
  made(second, layout)
  for (const one of rows.slice(0, 2)) second.write((tx) => tx.add('articles', one.row, system))
  const copy = (from: Store): Row[] =>
    at(reading(from, library, system), 'articles')
      .pick(['id', 'meaning'])
      .all()
  assert.deepEqual(copy(second), [{ id: first, meaning: [0.5, 0.25, 0, -1] }, { id: bare }])
})

/** A clock of the test, which passes when the test says so. */
function testClock(): { clock: Clock; pass(ms: number): Promise<void> } {
  let now = 1_800_000_000_000
  const timers: { at: number; run: () => void }[] = []
  return {
    clock: {
      now: () => now,
      setTimer(when, run) {
        const timer = { at: when, run }
        timers.push(timer)
        return () => {
          if (timers.includes(timer)) timers.splice(timers.indexOf(timer), 1)
        }
      },
    },
    async pass(ms) {
      now += ms
      for (const timer of timers.filter((one) => one.at <= now)) {
        timers.splice(timers.indexOf(timer), 1)
        timer.run()
      }
      await settled()
    },
  }
}

test('[20-6] connected tells through noted where a sink was found to differ at start, and where it was closed for holding more than kept', async (t) => {
  const folder = workFolder(t)
  const plain = opened(folder)
  const layout: TableLayout[] = [...layoutOf(library), historyTable]
  made(plain, layout)
  plain.write((tx) => tx.add('notes', { body: 'before the sink' }, system))
  const noted: unknown[] = []
  let holds = 0
  let down = false
  const sink: ChangeSink = {
    start: () => holds,
    wrote(change) {
      if (down) throw new Error('the sink is down')
      holds = change.n
    },
  }
  const { clock } = testClock()
  // The data holds no number yet, and the sink says the same: nothing is told.
  const store = connected(plain, layout, { sink, kept: 2000, clock, noted: (what) => noted.push(what) })
  await settled()
  assert.deepEqual(noted, [])
  store.write((tx) => tx.add('notes', { body: 'the first that is counted' }, system))
  await settled()
  assert.equal(holds, 1)

  // The sink is opened again and answers a number that the data does not stand at.
  holds = 0
  store.close()
  store.open(folder)
  await settled()
  assert.deepEqual(noted, [{ sink: 'differs', n: 1 }])

  // A sink that fails is behind. Past `kept` it is closed, and that is told with the number the data stands at.
  down = true
  const body = 'a line of a note that fills what may wait for a sink. '.repeat(10)
  for (let n = 0; n < 10 && noted.length < 2; n++) {
    store.write((tx) => tx.add('notes', { body }, system))
    await settled()
  }
  const stands = store.read({ from: '_t_meta', one: 'get', id: 'n' }, system).value
  assert.deepEqual(noted[1], { sink: 'closed', n: Object(stands).value })
  assert.ok(Object(stands).value > 2, 'more than one write waited before the sink was closed')
})

test('[50-12] the change of a write that removes two tenants holds both in gone, and a searcher, a sink and a second set of files are told of each', async (t) => {
  const desk = appOf()
  const second = filesOf(t, desk)
  const changes: Change[] = []
  const handed: Handed[] = []
  const told: FileName[] = []
  const first = connected(filesOf(t, desk), layoutOf(desk), {
    keep: true,
    copy: (change) => {
      changes.push(change)
      applyChange(second, change)
    },
    sink: {
      start: (n) => n,
      wrote(change) {
        handed.push(change)
      },
    },
    searcher: { has: () => true, wrote() {}, find: () => [], gone: (of) => told.push(of) },
  })
  const s = seedDesk(first, desk)
  const write = writingFiles(first, desk)
  for (const team of [s.north, s.south, s.east]) write((db) => at(db, 'orders').of(team).add({ total: 1 }))
  const [north, south, east] = [teamFile(s.north), teamFile(s.south), teamFile(s.east)]
  assert.deepEqual([second.has(north), second.has(south), second.has(east)], [true, true, true])

  // One write of the shared file removes two tenants.
  write((db) => {
    at(db, 'teams').remove(s.south)
    at(db, 'teams').remove(s.east)
  })
  await settled()
  const removal = changes.at(-1)
  assert.deepEqual(removal?.gone, [south, east])
  assert.deepEqual(handed.at(-1)?.gone, [south, east])
  assert.deepEqual(told, [south, east])
  // The second set removed both files when it applied that one change.
  assert.deepEqual([second.has(north), second.has(south), second.has(east)], [true, false, false])
  assert.equal(at(readingFiles(second, desk), 'teams').count(), 2)
  // A write that removes no tenant holds no `gone`.
  write((db) => at(db, 'teams').add({ name: 'Far' }))
  assert.equal(changes.at(-1)?.gone, undefined)
})

test('[50-12] the count of the app has its one home: connected over the files takes above, and gives number for the write of a file thread', (t) => {
  const desk = appOf()
  // The directory of the engine says that a file which is closed holds the number 40.
  const files = connected(filesOf(t, desk), layoutOf(desk), { above: 40 })
  assert.equal(typeof files.number, 'function')
  const s = seedDesk(files, desk)
  const numberOf = (store: Store | undefined): unknown =>
    Object(store?.read({ from: '_t_meta', one: 'get', id: 'n' }, system).value).value
  // The first write of the app took the number above it.
  assert.equal(numberOf(files.shared), 41)
  writingFiles(files, desk)((db) => at(db, 'orders').of(s.north).add({ total: 1 }))
  assert.equal(numberOf(files.of(teamFile(s.north))), 42)
  // A file thread is handed the next number, and no write of the main thread takes it again.
  assert.equal(files.number(), 43)
  assert.equal(files.number(), 44)
  writingFiles(files, desk)((db) => at(db, 'orders').of(s.north).add({ total: 2 }))
  assert.equal(numberOf(files.of(teamFile(s.north))), 45)
})
