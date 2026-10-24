import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { userInfo } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import type { Cancel, Clock } from '../../core/internal.ts'
import type { Store } from '../../data/index.ts'
import { sqliteStore } from '../../data/index.ts'
import { descriptionOf } from '../format.ts'
import type { App, Lease, MakerInput } from '../index.ts'
import {
  addUser,
  bundled,
  codeOf,
  engineOf,
  logRows,
  nobody,
  refusal,
  running,
  system,
  userOf,
  workFolder,
} from './apps.ts'

const staff = userOf('a-staff-member', ['staff'])
const names = (rows: unknown): string[] => (Array.isArray(rows) ? rows.map((row) => String(Object(row).name)) : [])

test('[21-5] one engine holds 100 small apps, each answers from its own data, and closing one does not disturb the others', async (t) => {
  const work = workFolder(t)
  const bundle = await bundled(t, {}, work)
  const engine = engineOf(t)
  const apps: App[] = []
  for (let i = 0; i < 100; i++)
    apps.push(await engine.open(bundle.folder, { dataFolder: join(work, `data-${i}`), mode: 'test' }))
  assert.equal(new Set(apps).size, 100)

  // Each app answers, and holds what was written to it and nothing of another.
  for (const [i, app] of apps.entries()) {
    assert.equal(app.description.app.name, 'desk')
    for (let k = 0; k < i % 3; k++) await app.call('addTag', { name: `tag ${k} of app ${i}` }, { as: staff })
  }
  for (const [i, app] of apps.entries())
    assert.deepEqual(
      names(await app.call('publicTags', {}, { as: nobody })),
      Array.from({ length: i % 3 }, (_, k) => `tag ${k} of app ${i}`),
    )

  // One is closed in the middle of the work of the others, which go on answering and writing.
  const closing = apps[41].close()
  const others = apps.filter((_, i) => i !== 41)
  await Promise.all(others.map((app, i) => app.call('addTag', { name: `late ${i}` }, { as: staff })))
  await closing
  assert.equal(await codeOf(apps[41].call('publicTags', {}, { as: nobody })), 'T0013')
  for (const [i, app] of others.entries())
    assert.ok(names(await app.call('publicTags', {}, { as: nobody })).includes(`late ${i}`))
})

test('[21-15] two apps in one engine: closing one leaves the other answering, with its own engine file', async (t) => {
  const work = workFolder(t)
  const bundle = await bundled(t, {}, work)
  const engine = engineOf(t)
  const [first, second] = [join(work, 'first'), join(work, 'second')]
  const one = await engine.open(bundle.folder, { dataFolder: first, mode: 'test' })
  const two = await engine.open(bundle.folder, { dataFolder: second, mode: 'development' })

  // A running engine says where it is reached, for the commands of this computer.
  const held = (folder: string): Record<string, unknown> =>
    JSON.parse(readFileSync(join(folder, 'engine.json'), 'utf8'))
  assert.deepEqual(Object.keys(held(first)).sort(), ['mode', 'pid', 'port', 'token'])
  assert.equal(held(first).pid, process.pid)
  assert.ok(Number.isInteger(held(first).port) && Number(held(first).port) > 0)
  assert.equal(held(first).port, held(second).port)
  assert.equal(held(first).mode, 'test')
  assert.equal(held(second).mode, 'development')
  assert.match(String(held(first).token), /^[A-Za-z0-9_-]{43}$/)
  assert.equal(held(first).token, held(second).token)

  // The file is readable only by the current user.
  for (const folder of [first, second]) {
    const file = join(folder, 'engine.json')
    if (process.platform === 'win32') {
      const rights = execFileSync('icacls', [file], { encoding: 'utf8' })
      const lines = rights.split(/\r?\n/).filter((line) => /:\(/.test(line))
      assert.equal(lines.length, 1, rights)
      assert.ok(lines[0].toLowerCase().includes(`\\${userInfo().username.toLowerCase()}:`), rights)
    } else assert.equal(statSync(file).mode & 0o777, 0o600)
  }

  await one.call('addTag', { name: 'of the first' }, { as: staff })
  await one.close()
  assert.equal(existsSync(join(first, 'engine.json')), false)
  assert.equal(existsSync(join(second, 'engine.json')), true)
  assert.equal(await codeOf(one.call('publicTags', {}, { as: nobody })), 'T0013')

  // The other answers and writes as before, and a closed app can be closed once more with no harm.
  await two.call('addTag', { name: 'of the second' }, { as: staff })
  assert.deepEqual(names(await two.call('publicTags', {}, { as: nobody })), ['of the second'])
  await one.close()

  // The data of the closed app is whole: it opens again, in the same engine.
  const again = await engine.open(bundle.folder, { dataFolder: first, mode: 'test' })
  assert.deepEqual(names(await again.call('publicTags', {}, { as: nobody })), ['of the first'])

  await engine.close()
  assert.equal(existsSync(join(second, 'engine.json')), false)
  assert.equal(existsSync(join(first, 'engine.json')), false)
  assert.equal(await codeOf(two.call('publicTags', {}, { as: nobody })), 'T0013')
})

test('[13-3] a description with a field that the format does not list is refused by the engine, naming the field', async (t) => {
  const work = workFolder(t)
  const engine = engineOf(t)
  const cases: [string, (description: Record<string, unknown>) => void, RegExp][] = [
    [
      'a field of a function',
      (d) => Object.assign(Object(Object(d.functions).addNote), { colour: 'red' }),
      /functions\.addNote\.colour/,
    ],
    ['a part of the description', (d) => Object.assign(d, { extras: { a: 1 } }), /extras/],
    [
      'a field of a column',
      (d) => Object.assign(Object(Object(Object(d.tables).notes).columns).title, { wide: true }),
      /tables\.notes\.columns\.title\.wide/,
    ],
    [
      'a field of another type',
      (d) => Object.assign(Object(Object(d.functions).addNote), { about: 5 }),
      /functions\.addNote\.about/,
    ],
  ]
  for (const [what, change, field] of cases) {
    const bundle = await bundled(t, { change: (description) => change(Object(description)) }, work)
    const dataFolder = join(work, `data ${what}`)
    const refused = await refusal(engine.open(bundle.folder, { dataFolder, mode: 'test' }))
    assert.equal(refused.code, 'T0011', what)
    assert.match(refused.message, field, what)
    // The app does not open: nothing says that an engine runs on its data.
    assert.equal(existsSync(join(dataFolder, 'engine.json')), false, what)
  }
  // The same bundle as it was built opens.
  const whole = await bundled(t, {}, work)
  const app = await engine.open(whole.folder, { dataFolder: join(work, 'data whole'), mode: 'test' })
  assert.equal(app.description.format, 'tent.description/1')
})

test('[14-6] a description of format 1 is still read after the format number is raised, and one of a newer number than the own of the engine is T0011', async (t) => {
  const work = workFolder(t)
  const bundle = await bundled(t, {}, work)
  // The engine of today reads format 1, and so does one whose own number was raised.
  assert.deepEqual(descriptionOf(bundle.text), bundle.description)
  assert.deepEqual(descriptionOf(bundle.text, 2), bundle.description)
  assert.deepEqual(descriptionOf(bundle.text, 7), bundle.description)

  // A description of a newer number than the own of the engine is refused, naming both.
  const newer = bundle.text.replace('"tent.description/1"', '"tent.description/2"')
  assert.throws(
    () => descriptionOf(newer),
    (error: Error & { code?: string }) =>
      error.code === 'T0011' && /\b2\b/.test(error.message) && /\b1\b/.test(error.message),
  )
  assert.throws(
    () => descriptionOf(newer.replace('description/2', 'description/9'), 8),
    (error: Error & { code?: string }) =>
      error.code === 'T0011' && /\b9\b/.test(error.message) && /\b8\b/.test(error.message),
  )
  // What states no format of ours, and what is no JSON, is no description.
  for (const text of [
    bundle.text.replace('"tent.description/1"', '"shop.description/1"'),
    bundle.text.replace('"tent.description/1"', '"tent.description/one"'),
    bundle.text.replace('"tent.description/1"', '"tent.description/0"'),
    bundle.text.replace('"tent.description/1"', '1'),
    '{ "format": ',
    '[]',
  ])
    assert.throws(
      () => descriptionOf(text),
      (error: Error & { code?: string }) => error.code === 'T0011',
    )

  // Through the engine: a bundle of a newer format does not open, and one of format 1 does.
  const engine = engineOf(t)
  const ahead = await bundled(
    t,
    { change: (description) => Object.assign(description, { format: 'tent.description/2' }) },
    work,
  )
  const refused = await refusal(engine.open(ahead.folder, { dataFolder: join(work, 'ahead'), mode: 'test' }))
  assert.equal(refused.code, 'T0011')
  assert.match(refused.message, /tent\.description\/2/)
  const app = await engine.open(bundle.folder, { dataFolder: join(work, 'data'), mode: 'test' })
  assert.equal(app.description.format, 'tent.description/1')
})

test('[16-2@4] T0018: data that the engine cannot open stops the app from opening', async (t) => {
  const work = workFolder(t)
  const bundle = await bundled(t, {}, work)
  const closed: string[] = []
  const double =
    (what: string, over: Partial<Store>): (() => Store) =>
    () => {
      const store = sqliteStore()
      const close = (): void => {
        closed.push(what)
        store.close()
      }
      return { ...store, ...over, close }
    }
  const cases: [string, () => Store, RegExp][] = [
    ['an older store', double('an older store', { version: () => ({ engine: '3.51.2', layout: 1 }) }), /3\.51\.3/],
    [
      'a much older store',
      double('a much older store', { version: () => ({ engine: '3.9.12', layout: 1 }) }),
      /3\.51\.3/,
    ],
    [
      'a file of a newer engine',
      double('a file of a newer engine', { version: () => ({ engine: '3.53.0', layout: 2 }) }),
      /newer/,
    ],
  ]
  for (const [what, store, words] of cases) {
    const engine = engineOf(t, { makers: { store } })
    const dataFolder = join(work, what)
    const refused = await refusal(engine.open(bundle.folder, { dataFolder, mode: 'test' }))
    assert.equal(refused.code, 'T0018', what)
    assert.match(refused.message, words, what)
    assert.equal(existsSync(join(dataFolder, 'engine.json')), false, what)
    // The store that was opened for the look is closed again.
    assert.ok(closed.includes(what), what)
  }

  // A definition that is tied to SQLite does not run on a store that has no raw SQL.
  const tied = await bundled(
    t,
    { change: (description) => Object.assign(description.functions.rawNotes, { tiedTo: 'sqlite' }) },
    work,
  )
  const noSql = (): Store => {
    const { sql: _, ...store } = sqliteStore()
    return store
  }
  const engine = engineOf(t, { makers: { store: noSql } })
  const refused = await refusal(engine.open(tied.folder, { dataFolder: join(work, 'no sql'), mode: 'test' }))
  assert.equal(refused.code, 'T0018')
  assert.match(refused.message, /rawNotes/)
  // The same store opens the app that is tied to nothing.
  const app = await engine.open(bundle.folder, { dataFolder: join(work, 'no sql, not tied'), mode: 'test' })
  assert.deepEqual(await app.call('publicTags', {}, { as: nobody }), [])
})

test('[22-20] the store, the clock and the lease of an app are made by the makers of the program, and the engine uses what they made', async (t) => {
  const handed: Record<string, MakerInput[]> = { store: [], clock: [], lease: [] }
  const used = { reads: 0, writes: 0, opened: [] as string[], closed: 0, clockClosed: 0, leaseClosed: 0 }
  let moment = Date.UTC(2031, 4, 6, 7, 8, 9)
  const store = (o: MakerInput): Store => {
    handed.store.push(o)
    const real = sqliteStore()
    return {
      ...real,
      open(folder, how) {
        used.opened.push(folder)
        real.open(folder, how)
      },
      read(plan, caller) {
        used.reads++
        return real.read(plan, caller)
      },
      write(work, how) {
        used.writes++
        return real.write(work, how)
      },
      close() {
        used.closed++
        real.close()
      },
    }
  }
  const timers: { at: number; run: () => void }[] = []
  const clock = (o: MakerInput): Clock & { close(): void } => {
    handed.clock.push(o)
    return {
      now: () => moment,
      setTimer: (at, run): Cancel => {
        const timer = { at, run }
        timers.push(timer)
        return () => void timers.splice(timers.indexOf(timer), 1)
      },
      close: () => void used.clockClosed++,
    }
  }
  const lease = (o: MakerInput): Lease & { close(): void } => {
    handed.lease.push(o)
    return { hold: () => true, close: () => void used.leaseClosed++ }
  }

  const { app, dataFolder } = await running(t, { engine: { makers: { store, clock, lease } } })
  // Each maker was called once for the app, and was handed where its data lies.
  for (const kind of ['store', 'clock', 'lease']) {
    assert.equal(handed[kind].length, 1, kind)
    assert.equal(handed[kind][0].dataFolder, dataFolder, kind)
    assert.equal(typeof handed[kind][0].settings, 'object', kind)
  }
  assert.deepEqual(used.opened, [dataFolder])

  // The engine reads and writes through the store that was made.
  const [reads, writes] = [used.reads, used.writes]
  const ada = await addUser(app, 'Ada')
  await app.call('addNote', { title: 'through the double' }, { as: ada })
  assert.ok(used.writes >= writes + 2)
  assert.equal(await app.call('countNotes', {}, { as: ada }), 1)
  assert.ok(used.reads > reads)

  // The time of a call is the time of the clock that was made: what a query is handed as `now`, and the log.
  const first = await app.call('moment', {}, { as: nobody })
  assert.ok(first instanceof Date)
  assert.equal(first.getTime(), moment)
  moment += 86_400_000
  const second = await app.call('moment', {}, { as: nobody })
  assert.equal(second instanceof Date && second.getTime(), moment)
  const logged = logRows(dataFolder, 'calls').filter((row) => row.name === 'moment')
  assert.deepEqual(
    logged.map((row) => row.at),
    [moment - 86_400_000, moment],
  )
  const note = await app.call('addNote', { title: 'a day later' }, { as: ada })
  assert.equal(Object(note).createdAt.getTime(), moment)

  // A made thing that has `close` is told when the app is closed, the clock among them.
  await app.close()
  assert.deepEqual([used.closed, used.clockClosed, used.leaseClosed], [1, 1, 1])
})

test('[16-4@4] the tables of an app are made when it opens, and a later bundle changes them or is refused whole', async (t) => {
  const work = workFolder(t)
  const engine = engineOf(t)
  const dataFolder = join(work, 'data')
  const bundle = await bundled(t, {}, work)
  const first = await engine.open(bundle.folder, { dataFolder, mode: 'test' })
  const ada = await addUser(first, 'Ada')
  await first.call('addNote', { title: 'kept through every change' }, { as: ada })
  await first.close()

  // A bundle with one more column and one more table is applied by itself, and the rows stay.
  const wider = await bundled(
    t,
    {
      change: (description) => {
        Object.assign(Object(description.tables.notes.columns), { colour: { kind: 'text', optional: true } })
        description.tables.shelves = { columns: { name: { kind: 'text' } }, access: { read: { rule: 'signedIn' } } }
      },
    },
    work,
  )
  const second = await engine.open(wider.folder, { dataFolder, mode: 'test' })
  assert.equal(await second.call('countNotes', {}, { as: ada }), 1)
  const store = sqliteStore()
  await second.close()
  store.open(dataFolder, { readOnly: true })
  const layout = store.layout()
  store.close()
  assert.ok(Object.keys(layout.find((table) => table.name === 'notes')?.columns ?? {}).includes('colour'))
  assert.ok(layout.some((table) => table.name === 'shelves'))
  // The tables of the engine that the data part keeps stand beside those of the app.
  for (const name of ['_t_meta', '_t_here', '_t_history'])
    assert.ok(
      layout.some((table) => table.name === name),
      name,
    )

  // A bundle in which a column is gone with no statement is refused with the finding, and nothing is changed.
  const narrower = await bundled(
    t,
    {
      change: (description) => {
        const columns: Record<string, unknown> = Object(description.tables.notes.columns)
        delete columns.done
        description.tables.racks = { columns: { name: { kind: 'text' } }, access: { read: { rule: 'signedIn' } } }
      },
    },
    work,
  )
  const refused = await refusal(engine.open(narrower.folder, { dataFolder, mode: 'test' }))
  assert.equal(refused.code, 'T2002')
  assert.match(refused.message, /done/)
  assert.equal(existsSync(join(dataFolder, 'engine.json')), false)
  store.open(dataFolder, { readOnly: true })
  const after = store.layout()
  store.close()
  assert.deepEqual(after, layout)

  // The data still opens under the bundle it was left with.
  const third = await engine.open(wider.folder, { dataFolder, mode: 'test' })
  assert.equal(await third.call('countNotes', {}, { as: ada }), 1)
})

test('[16-2@4] an app that is opened twice on one data folder, and a bundle that is no bundle, do not open', async (t) => {
  const work = workFolder(t)
  const bundle = await bundled(t, {}, work)
  const engine = engineOf(t)
  const dataFolder = join(work, 'data')
  await engine.open(bundle.folder, { dataFolder, mode: 'test' })
  // One program opens a data folder for writing, once.
  assert.equal(await codeOf(engine.open(bundle.folder, { dataFolder, mode: 'test' })), 'T0013')
  // A folder that holds no description is no bundle.
  assert.equal(
    await codeOf(engine.open(join(work, 'nothing here'), { dataFolder: join(work, 'other'), mode: 'test' })),
    'T0011',
  )
  assert.deepEqual(readdirSync(work).sort(), ['bundles', 'data'])
  // A mode that is none is refused before anything is opened.
  const none: Record<string, unknown> = { dataFolder: join(work, 'moody'), mode: 'production' }
  assert.equal(await codeOf(engine.open(bundle.folder, Object.assign({ dataFolder: '' }, none))), 'T0013')
  assert.equal(existsSync(join(work, 'moody')), false)
  // The mode is `live` where none is named.
  const live = await engine.open(bundle.folder, { dataFolder: join(work, 'live') })
  assert.equal(JSON.parse(readFileSync(join(work, 'live', 'engine.json'), 'utf8')).mode, 'live')
  assert.deepEqual(await live.call('publicTags', {}, { as: system }), [])
})

test('[20-13] the arrow of a rule that is code is the export of its name in the module of the bundle, and a module that gives the definition and no such export is T0011', async (t) => {
  const work = workFolder(t)
  const bundle = await bundled(t, {}, work)
  const engine = engineOf(t)
  // The bundle gives the rule of `myNote` as the export `myNote_access`, as a bundle of the build does.
  assert.equal(Object(bundle.description.functions.myNote.access).export, 'myNote_access')
  const module = join(bundle.folder, 'server', 'functions.ts')
  assert.match(readFileSync(module, 'utf8'), /export const myNote_access\b/)
  const app = await engine.open(bundle.folder, { dataFolder: join(work, 'data'), mode: 'test' })
  const ada = await addUser(app, 'Ada')
  const note = Object(await app.call('addNote', { title: 'of Ada' }, { as: ada }))
  assert.equal(Object(await app.call('myNote', { note: note.id }, { as: ada })).title, 'of Ada')
  await app.close()
  // The same module as its author wrote it holds the arrow inside the definition alone: the engine reads none there.
  cpSync(fileURLToPath(new URL('./desk/functions.ts', import.meta.url)), module)
  const refused = await refusal(engine.open(bundle.folder, { dataFolder: join(work, 'plain'), mode: 'development' }))
  assert.equal(refused.code, 'T0011')
  assert.match(refused.message, /rule of myNote/)
})
