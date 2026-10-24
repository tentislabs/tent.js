import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { sqliteStore } from '../../data/index.ts'
import test from 'node:test'
import type { App } from '../index.ts'
import type { Answered, Running } from './apps.ts'
import { addUser, bundled, engineOf, logRows, portOf, running, send, testClock, workFolder } from './apps.ts'

/** The admin token that the engine of a data folder wrote for the commands of this computer. */
const tokenOf = (dataFolder: string): string =>
  String(JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8')).token)

/** What a test says of the command it sends: `token` stands in place of the right one, and null sends none. */
interface Commanding {
  token?: string | null
  from?: string
  headers?: Record<string, string>
  method?: string
  body?: string
  host?: string
}

/** Sends a command to the admin channel of an app, as a command of this computer does, with no network. */
function command(run: Running, name: string, args: object = {}, o: Commanding = {}): Promise<Answered> {
  const token = o.token === undefined ? tokenOf(run.dataFolder) : o.token
  return send(run.app, `${o.host ?? run.origin}/_t/admin/${name}`, {
    body: o.body ?? JSON.stringify({ args }),
    headers: { ...(token === null ? {} : { authorization: `Bearer ${token}` }), ...o.headers },
    ...(o.from === undefined ? {} : { from: o.from }),
    ...(o.method === undefined ? {} : { method: o.method }),
  })
}

/** Sends a command that must work, and answers its value. */
async function did(run: Running, name: string, args: object = {}): Promise<Record<string, unknown>> {
  const answered = await command(run, name, args)
  assert.equal(answered.status, 200, JSON.stringify(answered.body))
  assert.equal(answered.body.ok, true)
  return Object(answered.body.value)
}

/** The rows of a table of an app, read with full access. */
async function rowsOf(app: App, table: string): Promise<Record<string, unknown>[]> {
  const rows = await app.read({ from: table }, { as: 'system' })
  return Array.isArray(rows) ? rows : []
}

/** Waits until something holds, and fails where it does not within the time a test gives it. */
async function until(holds: () => boolean, what: string): Promise<void> {
  for (let tries = 0; tries < 400; tries++) {
    if (holds()) return
    await new Promise((done) => setTimeout(done, 25))
  }
  assert.fail(`it did not come to hold within ten seconds: ${what}`)
}

/** The files of the backups of a data folder, in the order they were made. */
const backupsIn = (dataFolder: string): string[] =>
  existsSync(join(dataFolder, 'backups'))
    ? readdirSync(join(dataFolder, 'backups'))
        .filter((name) => /^data-.*\.db$/.test(name))
        .sort()
    : []

/** Opens a data file to read alone, hands it to a reader, and closes it again, also where the reader fails. */
function reading<Answer>(file: string, read: (data: DatabaseSync) => Answer): Answer {
  const data = new DatabaseSync(file, { readOnly: true })
  try {
    return read(data)
  } finally {
    data.close()
  }
}

/** The lines of the log of a data folder that say a backup was tested, each with what it holds as data. */
const tested = (dataFolder: string): Record<string, unknown>[] =>
  logRows(dataFolder, 'lines')
    .filter((line) => /backup/.test(String(line.message)))
    .map((line) => ({ level: line.level, ...Object(JSON.parse(String(line.data ?? '{}'))) }))

const hour = 3_600_000

test('[15-6@4] the admin channel: each command of the engine answers its value in the wire form', async (t) => {
  // The build says of a function that it uses raw SQL, and no test of this part may use the build.
  const run = await running(t, {
    change: (description) => {
      description.functions.rawNotes.tiedTo = 'sqlite'
    },
  })
  const ada = await addUser(run.app, 'Ada', ['staff'])
  const bob = await addUser(run.app, 'Bob')
  const adaId = String(ada.user?.id)

  // `run`: the answer of the function and the lines its code wrote, as the system where no caller is named.
  const added = await did(run, 'run', { name: 'addTag', with: { name: 'by a command' } })
  assert.equal(Object(added.value).name, 'by a command')
  assert.deepEqual(added.lines, [])
  const noted = await did(run, 'run', { name: 'noted', with: { title: 'seen' }, as: adaId })
  assert.deepEqual(
    (Array.isArray(noted.lines) ? noted.lines : []).map((line) => [line.level, line.message]),
    [
      ['info', 'a note was seen'],
      ['warn', 'it was seen twice'],
      ['error', 'it was seen three times'],
    ],
  )
  // It runs as the caller that `as` names: a user by its id, with the roles of its row, nobody, or the system.
  assert.equal((await did(run, 'run', { name: 'whoAmI', as: adaId })).value, adaId)
  assert.equal((await did(run, 'run', { name: 'whoAmI', as: 'nobody' })).value, 'no user')
  assert.equal((await did(run, 'run', { name: 'whoAmI' })).value, 'no user')
  assert.equal(Array.isArray((await did(run, 'run', { name: 'staffTags', as: adaId })).value), true)
  const refused = await command(run, 'run', { name: 'staffTags', as: String(bob.user?.id) })
  assert.deepEqual([refused.status, refused.error.code], [403, 'T3101'])
  assert.equal((await command(run, 'run', { name: 'staffTags', as: 'nobody' })).error.code, 'T0006')
  assert.equal((await command(run, 'run', { name: 'whoAmI', as: 'no-such-user' })).error.code, 'T2103')
  assert.equal((await command(run, 'run', { name: 'noSuchFunction' })).error.code, 'T0001')
  assert.equal((await command(run, 'run', {})).error.code, 'T0002')
  // What a command is told of a failure is the full message, in every mode: whoever holds the token holds the data.
  assert.match(String(refused.error.message), /staff/)

  // `logs`: the calls, the errors and the slow queries, and with `errors` the errors alone.
  await assert.rejects(run.app.call('breaks', {}, { as: ada }))
  const logs = await did(run, 'logs')
  assert.deepEqual(Object.keys(logs).sort(), ['calls', 'errors', 'slow'])
  const calls: Record<string, unknown>[] = Array.isArray(logs.calls) ? logs.calls : []
  assert.equal(
    calls.some((call) => call.name === 'addTag' && call.ok === 1),
    true,
  )
  assert.equal(
    calls.some((call) => call.name === 'breaks' && call.code === 'T0009'),
    true,
  )
  const errors = await did(run, 'logs', { errors: true })
  assert.deepEqual(Object.keys(errors), ['errors'])
  assert.match(
    String(Object(Array.isArray(errors.errors) ? errors.errors[0] : {}).message),
    /the code of the app broke/,
  )
  // `since` is a length of time back from now: a moment ago holds every call, and nothing is that new a day on.
  assert.equal(Object(await did(run, 'logs', { since: '5 minutes' })).calls.length, calls.length)
  assert.equal((await command(run, 'logs', { since: 'lately' })).error.code, 'T0002')

  // `access`: one table of who can do what.
  const access = await did(run, 'access')
  const tables: Record<string, unknown>[] = Array.isArray(access.tables) ? access.tables : []
  const functions: Record<string, unknown>[] = Array.isArray(access.functions) ? access.functions : []
  assert.deepEqual(
    tables.find((one) => one.table === 'notes'),
    { table: 'notes', read: 'owner', add: 'signedIn', change: 'owner', remove: 'owner' },
  )
  assert.deepEqual(
    tables.find((one) => one.table === 'tags'),
    { table: 'tags', read: 'anyone', add: 'role staff', change: 'nobody', remove: 'nobody' },
  )
  assert.deepEqual(
    functions.find((one) => one.name === 'addTag'),
    { name: 'addTag', kind: 'change', access: 'role staff' },
  )
  assert.equal(functions.find((one) => one.name === 'myNote')?.access, 'allow')
  // A definition that has full access, and one that uses raw SQL, says so.
  assert.equal(typeof functions.find((one) => one.name === 'everyNote')?.system, 'string')
  assert.equal(functions.find((one) => one.name === 'rawNotes')?.sql, true)
  assert.equal(functions.length, Object.keys(run.app.description.functions).length)

  // `data rows`: every row of a table, with full access.
  const rows = await command(run, 'data', { what: 'rows', table: 'users' })
  assert.deepEqual(
    (Array.isArray(rows.body.value) ? rows.body.value : []).map((row) => row.name),
    ['Ada', 'Bob'],
  )
  assert.equal((await command(run, 'data', { what: 'rows' })).error.code, 'T0002')
  assert.equal((await command(run, 'data', { what: 'nothing' })).error.code, 'T0001')
  assert.equal((await command(run, 'data', {})).error.code, 'T0001')

  // `data backup`, `data restore`, `data clean`.
  const backup = await did(run, 'data', { what: 'backup' })
  assert.equal(existsSync(String(backup.file)), true)
  assert.equal(typeof backup.writes, 'number')
  assert.equal(Number(backup.rows) >= 3, true)
  await did(run, 'run', { name: 'addTag', with: { name: 'after the backup' } })
  assert.deepEqual(await did(run, 'data', { what: 'restore', file: backup.file }), { restored: backup.file })
  assert.deepEqual(
    (await rowsOf(run.app, 'tags')).map((row) => row.name),
    ['by a command'],
  )
  assert.equal((await command(run, 'data', { what: 'restore', file: join(run.dataFolder, 'no-such.db') })).status, 500)
  assert.deepEqual(await did(run, 'data', { what: 'clean' }), { dropped: [] })
})

test('[16-2@4] the admin channel is closed to whoever lacks the token, to another computer and to a request through a proxy, and a command that is none is not found', async (t) => {
  const run = await running(t, { engine: { proxy: { from: ['10.0.0.1'] } } })
  const token = tokenOf(run.dataFolder)
  const args = { name: 'addTag', with: { name: 'never' } }
  const last = token.at(-1) === 'A' ? 'B' : 'A'

  const closed: [string, Commanding][] = [
    ['no token', { token: null }],
    ['a wrong token', { token: 'x'.repeat(43) }],
    ['a token that differs in its last character', { token: token.slice(0, -1) + last }],
    ['a token of another length', { token: token.slice(0, 20) }],
    ['the token with no scheme', { token: null, headers: { authorization: token } }],
    ['the token in another header', { token: null, headers: { 'x-tent-token': token, cookie: `token=${token}` } }],
    ['another computer', { from: '203.0.113.5' }],
    ['another computer of the same network', { from: '192.168.1.7' }],
    ['a named proxy, for this computer', { from: '10.0.0.1', headers: { 'x-forwarded-for': '127.0.0.1' } }],
    ['a named proxy, for nobody', { from: '10.0.0.1' }],
  ]
  for (const [what, how] of closed) {
    const answered = await command(run, 'run', args, how)
    assert.deepEqual([answered.status, answered.error.code], [401, 'T0006'], what)
    // A refusal says nothing of the channel: not which command there is, and not what was wrong.
    assert.doesNotMatch(String(answered.error.message), /token|proxy|computer|addTag/i, what)
  }
  // A name of its own, as a page of another site would state it, is none of the names of the app.
  assert.equal((await command(run, 'run', args, { host: 'http://evil.test' })).error.code, 'T0017')

  // With the token: a command that is none, and a name that holds a slash or dots, is not found.
  for (const name of ['nothing', 'data/rows', 'data%2Frows', '..%2Fcall%2FaddTag', 'run.ts', '.', 'list', ''])
    assert.deepEqual([(await command(run, name, args)).error.code, name], ['T0001', name])
  assert.equal((await command(run, 'run', args, { method: 'GET' })).error.code, 'T0001')
  // The body is `{ "args": { ... } }`, and nothing else.
  for (const body of ['[]', '"run"', '{"args":[]}', '{"args":{},"as":"system"}', '{"input":{}}', '{'])
    assert.equal((await command(run, 'run', args, { body })).status, 400, body)

  // Nothing of all that ran, and with the token, from this computer, it does.
  assert.deepEqual(await rowsOf(run.app, 'tags'), [])
  for (const from of ['127.0.0.1', '::1', '::ffff:127.0.0.1'])
    assert.equal((await command(run, 'run', { name: 'whoAmI' }, { from })).status, 200, from)
  // A header of ours on the request names nothing: step 1 of the door takes it out.
  const stepped = await command(run, 'run', { name: 'whoAmI' }, { headers: { 'x-tent-caller': 'nobody' } })
  assert.equal(stepped.status, 200)
})

test('[20-9] a backup is taken on its schedule, as many are kept as `backups` says, and each is test-restored', async (t) => {
  const { clock, advance } = testClock()
  const run = await running(t, {
    engine: { makers: { clock: () => clock } },
    change: (description) => {
      description.project.backups = { every: hour, keep: 3 }
    },
  })
  const ada = await addUser(run.app, 'Ada')
  await run.app.call('addNote', { title: 'kept in every backup' }, { as: ada })
  assert.deepEqual(backupsIn(run.dataFolder), [])
  advance(hour - 1000)
  await new Promise((done) => setTimeout(done, 100))
  assert.deepEqual(backupsIn(run.dataFolder), [])

  for (let taken = 1; taken <= 5; taken++) {
    advance(hour)
    await until(() => tested(run.dataFolder).length === taken, `the test of backup ${taken}`)
    assert.equal(backupsIn(run.dataFolder).length, Math.min(taken, 3))
  }
  // The three that are kept are the newest three, and each was restored and counted: a user and a note.
  const kept = backupsIn(run.dataFolder)
  const lines = tested(run.dataFolder)
  assert.deepEqual(
    lines.slice(-3).map((line) => line.file),
    kept,
  )
  for (const line of lines) assert.deepEqual([line.level, line.rows], ['info', 2])
  // Nothing of a test-restore is left beside the backups, and the archive of the changes stands beside them.
  assert.deepEqual(
    readdirSync(join(run.dataFolder, 'backups'))
      .filter((name) => name !== 'archive')
      .sort(),
    kept,
  )
  // A backup is a data file that holds the rows.
  assert.deepEqual(
    reading(join(run.dataFolder, 'backups', kept[2]), (file) =>
      file
        .prepare('SELECT "title" FROM "notes"')
        .all()
        .map((row) => row.title),
    ),
    ['kept in every backup'],
  )

  // Closed, the app takes none; and no schedule where `every` is false.
  await run.app.close()
  advance(3 * hour)
  await new Promise((done) => setTimeout(done, 100))
  assert.deepEqual(backupsIn(run.dataFolder), kept)
  const other = testClock()
  const off = await running(t, {
    engine: { makers: { clock: () => other.clock } },
    change: (description) => {
      description.project.backups = { every: false }
    },
  })
  other.advance(30 * 24 * hour)
  await new Promise((done) => setTimeout(done, 100))
  assert.deepEqual(backupsIn(off.dataFolder), [])
})

test('[20-9] a backup is taken before a table change, and none where `beforeChanges` is false or nothing changes', async (t) => {
  const work = workFolder(t)
  const engine = engineOf(t)
  const dataFolder = join(work, 'data')
  const bundle = await bundled(t, {}, work)
  const first = await engine.open(bundle.folder, { dataFolder, mode: 'test' })
  // Data that is new holds nothing to keep: the tables of a first opening are made with no backup.
  assert.deepEqual(backupsIn(dataFolder), [])
  const ada = await addUser(first, 'Ada')
  await first.call('addNote', { title: 'written before the change' }, { as: ada })
  await first.close()

  // The same bundle again changes no table.
  await (await engine.open(bundle.folder, { dataFolder, mode: 'test' })).close()
  assert.deepEqual(backupsIn(dataFolder), [])

  const wider = await bundled(
    t,
    { change: (d) => void Object.assign(Object(d.tables.notes.columns), { colour: { kind: 'text', optional: true } }) },
    work,
  )
  const second = await engine.open(wider.folder, { dataFolder, mode: 'test' })
  const [before, ...more] = backupsIn(dataFolder)
  assert.deepEqual(more, [])
  // The backup holds the data as it was: the rows, and the table without its new column.
  reading(join(dataFolder, 'backups', before), (file) => {
    const columns = file
      .prepare(`SELECT name FROM pragma_table_info('notes')`)
      .all()
      .map((row) => String(row.name))
    assert.equal(columns.includes('title'), true)
    assert.equal(columns.includes('colour'), false)
    assert.equal(file.prepare('SELECT count(*) AS "n" FROM "notes"').get()?.n, 1)
  })
  assert.deepEqual(tested(dataFolder).at(-1), { level: 'info', file: before, rows: 2 })
  await second.close()

  // With `beforeChanges: false` a table change takes none.
  const widest = await bundled(
    t,
    {
      change: (d) => {
        Object.assign(Object(d.tables.notes.columns), { colour: { kind: 'text', optional: true } })
        Object.assign(Object(d.tables.notes.columns), { shade: { kind: 'text', optional: true } })
        d.project.backups = { beforeChanges: false }
      },
    },
    work,
  )
  await (await engine.open(widest.folder, { dataFolder, mode: 'test' })).close()
  assert.deepEqual(backupsIn(dataFolder), [before])

  // With `test: false` a backup is taken and not restored.
  const untested = await running(t, {
    change: (d) => {
      d.project.backups = { test: false }
    },
  })
  const taken = await did(untested, 'data', { what: 'backup' })
  assert.equal(existsSync(String(taken.file)), true)
  assert.equal(taken.rows, undefined)
  assert.deepEqual(tested(untested.dataFolder), [])
})

test('[20-9] `tent data clean` drops what was retired and nothing else, and a restore puts the data back under a running app', async (t) => {
  const work = workFolder(t)
  const engine = engineOf(t)
  const dataFolder = join(work, 'data')
  const bundle = await bundled(t, {}, work)
  const first = await engine.open(bundle.folder, { dataFolder, mode: 'test' })
  const ada = await addUser(first, 'Ada', ['staff'])
  await first.call('addNote', { title: 'a note that stays' }, { as: ada })
  await first.call('addTag', { name: 'a tag that goes' }, { as: ada })
  await first.close()

  // A bundle that states a column and a table as removed retires them: the rows are still in the file.
  const narrower = await bundled(
    t,
    {
      change: (d) => {
        const columns: Record<string, unknown> = Object(d.tables.notes.columns)
        delete columns.secret
        d.tables.notes.removed = ['secret']
        delete d.tables.tags
        d.project.removed = ['tags']
        d.project.backups = { beforeChanges: false }
      },
    },
    work,
  )
  const app = await engine.open(narrower.folder, { dataFolder, mode: 'test' })
  const port = portOf(dataFolder)
  const run: Running = { engine, app, bundle: narrower, dataFolder, port, origin: `http://localhost:${port}` }
  // What the data file holds of the two tables, read by a connection of its own.
  const held = (): { tags?: boolean; unused: string[]; columns: string[] } => {
    const store = sqliteStore()
    store.open(dataFolder, { readOnly: true })
    try {
      const layout = store.layout()
      const notes = layout.find((table) => table.name === 'notes')
      const tags = layout.find((table) => table.name === 'tags')
      return {
        ...(tags ? { tags: tags.retired === true } : {}),
        unused: notes?.unused ?? [],
        columns: Object.keys(notes?.columns ?? {}).sort(),
      }
    } finally {
      store.close()
    }
  }
  const before = held()
  assert.deepEqual([before.tags, before.unused], [true, ['secret']])
  const mark = await did(run, 'data', { what: 'backup' })

  const cleaned = await did(run, 'data', { what: 'clean' })
  assert.deepEqual(cleaned.dropped, [
    { do: 'dropColumn', table: 'notes', column: 'secret' },
    { do: 'dropTable', table: 'tags' },
  ])
  const after = held()
  assert.deepEqual([after.tags, after.unused], [undefined, []])
  assert.deepEqual(
    after.columns,
    before.columns.filter((name) => name !== 'secret'),
  )
  assert.deepEqual(
    (await rowsOf(app, 'notes')).map((row) => row.title),
    ['a note that stays'],
  )
  // A second cleaning finds nothing.
  assert.deepEqual(await did(run, 'data', { what: 'clean' }), { dropped: [] })

  // A restore under the running app: the rows written since are gone, the app answers and writes on.
  await app.call('addNote', { title: 'written after the backup' }, { as: ada })
  assert.equal((await rowsOf(app, 'notes')).length, 2)
  await did(run, 'data', { what: 'restore', file: mark.file })
  assert.deepEqual(
    (await rowsOf(app, 'notes')).map((row) => row.title),
    ['a note that stays'],
  )
  // The file that was put back held what was retired, as the data did when the backup was taken.
  assert.deepEqual(held(), before)
  await app.call('addNote', { title: 'written after the restore' }, { as: ada })
  assert.equal(await app.call('countNotes', {}, { as: ada }), 2)
})

test('[20-9] the log stays under its cap by dropping its oldest lines', async (t) => {
  const cap = 1024 * 1024
  const run = await running(t, {
    change: (description) => {
      description.project.limits = { ...Object(description.project.limits), logSize: cap }
    },
  })
  const ada = await addUser(run.app, 'Ada')
  const sizes: number[] = []
  const size = (): number =>
    ['logs.db', 'logs.db-wal'].reduce((sum, name) => {
      const file = join(run.dataFolder, name)
      return sum + (existsSync(file) ? statSync(file).size : 0)
    }, 0)
  // Each call writes three lines and its own row: together some four times the cap.
  const title = 'x'.repeat(400)
  for (let k = 0; k < 2400; k++) {
    await run.app.call('noted', { title: `${k} ${title}` }, { as: ada })
    if (k % 100 === 99) sizes.push(size())
  }
  assert.equal(Math.max(...sizes) <= cap, true, `the log grew to ${Math.max(...sizes)} bytes, over ${cap}`)
  const lines = logRows(run.dataFolder, 'lines')
  const first = JSON.parse(String(lines.find((line) => line.data)?.data)).title
  // The oldest lines are gone, the newest are there, and what is left stands in its order.
  assert.equal(Number(String(first).split(' ')[0]) > 0, true)
  assert.equal(String(JSON.parse(String(lines.findLast((line) => line.data)?.data)).title).startsWith('2399 '), true)
  const calls = logRows(run.dataFolder, 'calls')
  assert.equal(calls.length < 2400, true)
  assert.equal(calls.at(-1)?.name, 'noted')
  await run.app.close()
  assert.equal(size() <= cap, true)
  // A log under its cap drops nothing.
  const small = await running(t)
  const bob = await addUser(small.app, 'Bob')
  for (let k = 0; k < 300; k++) await small.app.call('noted', { title: `${k}` }, { as: bob })
  assert.equal(logRows(small.dataFolder, 'lines').length, 900)
})

test("[20-7@4] a person's removal: the rows of the person go, and the log says `removed` where it named them", async (t) => {
  const run = await running(t)
  const ada = await addUser(run.app, 'Ada', ['staff'])
  const bob = await addUser(run.app, 'Bob')
  const [adaId, bobId] = [String(ada.user?.id), String(bob.user?.id)]
  for (const [who, title] of [
    [ada, 'a note of Ada'],
    [bob, 'a note of Bob'],
    [bob, 'another of Bob'],
  ] as const)
    await run.app.call('addNote', { title }, { as: who })
  // Bob is refused once, so that `denied` names him too.
  await assert.rejects(run.app.call('addTag', { name: 'not for Bob' }, { as: bob }), { code: 'T3101' })
  const named = (table: string, id: string): number =>
    logRows(run.dataFolder, table).filter((row) => row.callerId === id).length
  assert.equal(named('calls', bobId) >= 3, true)
  assert.equal(named('denied', bobId), 1)
  const [callsOfBob, callsOfAda] = [named('calls', bobId), named('calls', adaId)]

  // The export: every row the person owns, and their row of `users`.
  const exported = await did(run, 'data', { what: 'user', do: 'export', id: bobId })
  assert.equal(Object(exported.user).name, 'Bob')
  assert.deepEqual(
    Object(exported.rows).notes.map((row: Record<string, unknown>) => row.title),
    ['a note of Bob', 'another of Bob'],
  )

  // The removal shows the count first, and removes nothing until it is told to.
  const shown = await did(run, 'data', { what: 'user', do: 'remove', id: bobId })
  assert.deepEqual([shown.removed, Object(shown.rows).notes, Object(shown.rows).users], [false, 2, 1])
  assert.equal((await rowsOf(run.app, 'notes')).length, 3)
  assert.equal(named('calls', bobId), callsOfBob)

  const removed = await did(run, 'data', { what: 'user', do: 'remove', id: bobId, yes: true })
  assert.deepEqual([removed.removed, Object(removed.rows).notes, Object(removed.rows).users], [true, 2, 1])
  assert.deepEqual(removed.refused, [])
  assert.deepEqual(
    (await rowsOf(run.app, 'notes')).map((row) => row.title),
    ['a note of Ada'],
  )
  assert.deepEqual(
    (await rowsOf(run.app, 'users')).map((row) => row.name),
    ['Ada'],
  )
  // The log keeps what happened, and no longer who: each row that named the person says `removed`.
  assert.equal(named('calls', bobId), 0)
  assert.equal(named('denied', bobId), 0)
  assert.equal(named('calls', 'removed'), callsOfBob)
  assert.equal(named('denied', 'removed'), 1)
  assert.equal(named('calls', adaId), callsOfAda)
  // The backups made before still hold the person, and the command says how many.
  assert.equal(removed.backups, 0)

  assert.equal((await command(run, 'data', { what: 'user', do: 'forget', id: adaId })).error.code, 'T0002')
  assert.equal((await command(run, 'data', { what: 'user', do: 'export' })).error.code, 'T0002')
  // Nobody of that id: the export holds no row.
  const nobody = await did(run, 'data', { what: 'user', do: 'export', id: 'no-such-user' })
  assert.deepEqual([nobody.user, Object(nobody.rows).notes], [undefined, []])
})
