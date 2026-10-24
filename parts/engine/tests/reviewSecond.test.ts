import assert from 'node:assert/strict'
import fs, { readFileSync, writeFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import type { Clock } from '../../core/internal.ts'
import { counts } from '../index.ts'
import { childUsed, programUsed } from '../counts/program.ts'
import { kindOf } from '../stored/kind.ts'
import { list as tableList } from '../tables/list.ts'
import { keyFile, keyText, newKey } from '../values/key.ts'
import { bundled, engineOf, logRows, nobody, running, send, userOf, workFolder } from './apps.ts'
import { counting } from './countingApps.ts'
import { untilWithin } from './flowing.ts'

// What a review of the whole found in the second third of `engine`: each test holds a sentence of a document that
// the code does not hold, and fails while that stands.

/** The engine's own tables of the table of the codes and the tables, section 3, that `tables/` makes: their columns, as the
 * row of each names them and the rule above the table gives their kinds, and their keys. */
const asked: Record<string, { columns: Record<string, string>; key: string[] }> = {
  _t_rate: { columns: { key: 'text', windowStart: 'date', count: 'number' }, key: ['key'] },
  _t_sent: { columns: { id: 'text', event: 'text', data: 'json', at: 'date' }, key: ['id'] },
  _t_sessions: {
    columns: {
      fingerprint: 'text',
      user: 'text',
      createdAt: 'date',
      usedAt: 'date',
      expiresAt: 'date',
      life: 'number',
      browserOnly: 'number',
    },
    key: ['fingerprint'],
  },
  _t_attempts: {
    columns: { key: 'text', address: 'text', windowStart: 'date', count: 'number' },
    key: ['key', 'address'],
  },
  _t_holds: {
    columns: { file: 'text', tableName: 'text', rowId: 'text', column: 'text', keptAt: 'text', of: 'text' },
    key: ['file', 'tableName', 'rowId', 'column', 'keptAt'],
  },
  _t_once: {
    columns: { caller: 'text', key: 'text', run: 'text', at: 'date', result: 'json', places: 'json' },
    key: ['caller', 'key'],
  },
  _t_counting: { columns: { key: 'text', value: 'json' }, key: ['key'] },
  _t_remembered: {
    columns: {
      key: 'text',
      definition: 'text',
      caller: 'text',
      answer: 'json',
      files: 'json',
      reads: 'json',
      size: 'number',
      madeAt: 'date',
      givenAt: 'date',
      endsAt: 'date',
    },
    key: ['key'],
  },
  _t_remembered_rows: {
    columns: { tableName: 'text', rowId: 'text', key: 'text', of: 'text' },
    key: ['tableName', 'rowId', 'key'],
  },
  _t_work_places: {
    columns: { task: 'text', may: 'text', service: 'text', version: 'text', at: 'date' },
    key: ['task', 'may'],
  },
}

test('[16-4] every table of the folder of the engine’s own tables is a row of 16, section 3, with exactly its columns, their kinds and its key', async () => {
  const found: string[] = []
  for (const { name, load } of tableList) {
    const { table } = await load()
    const want = Object.hasOwn(asked, table.name) ? asked[table.name] : undefined
    if (['counts', 'scores', 'apiKeys', 'connections', 'oauth', 'files', 'filled'].includes(name)) continue
    if (!want) {
      found.push(`${table.name}: no row of the document names this table`)
      continue
    }
    const kinds = Object.fromEntries(Object.entries(table.columns).map(([column, type]) => [column, type.kind]))
    for (const [column, kind] of Object.entries(want.columns))
      if (kinds[column] !== kind) found.push(`${table.name}.${column}: ${kinds[column] ?? 'missing'}, asked ${kind}`)
    for (const column of Object.keys(kinds))
      if (!Object.hasOwn(want.columns, column)) found.push(`${table.name}.${column}: a column the row does not name`)
    if (JSON.stringify(table.key ?? []) !== JSON.stringify(want.key))
      found.push(`${table.name}: the key ${JSON.stringify(table.key)}, asked ${JSON.stringify(want.key)}`)
  }
  assert.deepEqual(found, [])
})

test('[22-12] a picture whose first box names a brand the engine does not know, as an iPhone writes HEIC, keeps the kind it was sent with', () => {
  const bytes = new Uint8Array(32)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 24)
  bytes.set(new TextEncoder().encode('ftypheic'), 4)
  bytes.set(new TextEncoder().encode('mif1heic'), 16)
  // HEIC is no kind the engine knows by its bytes: only where the bytes say nothing is the stated kind kept, and
  // they say nothing of HEIC. They are no MP4 either.
  assert.equal(kindOf(bytes, 'image/heic'), 'image/heic')
})

test('[21-22] the memory that the programs a program started report is counted over time, as `children.memoryByteSeconds`', async () => {
  childUsed(0, 50_000_000)
  await new Promise((done) => setTimeout(done, 60))
  childUsed(0, 50_000_000)
  const used = programUsed(() => [], 3_600_000)
  assert.ok(used.children.memoryPeak >= 50_000_000)
  assert.ok(used.children.memoryByteSeconds > 0, 'a child held 50 MB for a moment and stood for no byte-second')
})

test('[22-5] while a new key of the secrets lies beside a key that the variable gives, as the replacing of the key leaves it, neither key is written into the log', async (t) => {
  const run = await running(t, { project: 'valued' })
  // Two keys whose text holds no sign that an address writes another way.
  const plain = (): string => {
    for (;;) {
      const text = keyText(newKey())
      if (/^[A-Za-z0-9]+=$/.test(text)) return text
    }
  }
  const [key, next] = [plain(), plain()]
  // On a server the key is the variable's, and the new key lies beside the data until the command takes it away:
  // the engine opens a value under either, and so holds both.
  const before = process.env.TENT_SECRET_KEY
  process.env.TENT_SECRET_KEY = key
  t.after(() => {
    if (before === undefined) delete process.env.TENT_SECRET_KEY
    else process.env.TENT_SECRET_KEY = before
  })
  writeFileSync(keyFile(run.dataFolder, '.next'), `${next}\n`)
  await run.app.close()
  const app = await run.engine.open(run.bundle.folder, { dataFolder: run.dataFolder, mode: 'test' })
  // A name that is no function of the app is written into the log of calls as it was sent.
  for (const sent of [key, next]) await send(app, `${run.origin}/_t/call/${encodeURIComponent(sent)}`)
  const kept = JSON.stringify(logRows(run.dataFolder, 'calls'))
  assert.equal(kept.includes(key), false, 'the key that the variable gives is in no log')
  assert.equal(kept.includes(next), false, 'the new key, which the engine holds too, is in no log')
})

/** A clock that stands still until the test moves it. */
function standingClock(start: number = Date.UTC(2031, 0, 1)) {
  let moment = start
  let timers: { at: number; run: () => void }[] = []
  const clock: Clock = {
    now: () => moment,
    setTimer(at, run) {
      const timer = { at, run }
      timers.push(timer)
      return () => {
        timers = timers.filter((one) => one !== timer)
      }
    },
  }
  const advance = (ms: number): void => {
    const to = moment + ms
    for (;;) {
      const due = timers.filter((one) => one.at <= to).sort((a, b) => a.at - b.at)[0]
      if (!due) break
      timers = timers.filter((one) => one !== due)
      moment = Math.max(moment, due.at)
      due.run()
    }
    moment = to
  }
  return { clock, advance }
}

/** An app that falls asleep after ten minutes, asleep, with the events it raised. */
async function asleep(t: TestContext) {
  const bundle = await bundled(t, { project: 'sleepy' })
  const { clock, advance } = standingClock()
  const engine = engineOf(t, { makers: { clock: () => clock } })
  const heard: string[] = []
  engine.on('app.asleep', () => void heard.push('asleep'))
  engine.on('app.woke', () => void heard.push('woke'))
  const dataFolder = join(workFolder(t), 'data')
  const app = await engine.open(bundle.folder, { dataFolder, mode: 'test', sleepAfter: '10 minutes' })
  await app.call('addMark', { what: 'one' }, { as: nobody })
  advance(11 * 60_000)
  await untilWithin(() => heard.length === 1, 'the app fell asleep')
  const { port, token } = JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8'))
  return { app, heard, origin: `http://localhost:${port}`, token: String(token) }
}

test('[21-24] the admin command `asleep` of an app that sleeps wakes nothing, and answers that it sleeps', async (t) => {
  const { app, heard, origin, token } = await asleep(t)
  const answered = await send(app, `${origin}/_t/admin/asleep`, {
    body: JSON.stringify({ args: {} }),
    headers: { authorization: `Bearer ${token}` },
  })
  assert.equal(answered.status, 200)
  assert.deepEqual(heard, ['asleep'], 'the command woke the app')
  assert.equal(Object(answered.body.value).asleep, true)
})

test('[21-24] `app.read` of `counts` wakes an app that sleeps for nothing', async (t) => {
  const { app, heard } = await asleep(t)
  await app.read(counts.where({}), { as: 'system' })
  assert.deepEqual(heard, ['asleep'], 'a read of the counts woke the app')
})

test('[20-7] after a person is removed, nothing of the counts names them: what was counted for them and not yet written is written as `removed`', async (t) => {
  const run = await counting(t, {
    change: (description) => {
      Reflect.set(description.project, 'countBy', 'caller')
    },
  })
  const maya = userOf('maya-person-review')
  await run.app.call('addNote', { title: 'by maya' }, { as: maya })
  const { token } = JSON.parse(readFileSync(join(run.dataFolder, 'engine.json'), 'utf8'))
  const removed = await send(run.app, `${run.origin}/_t/admin/data`, {
    body: JSON.stringify({ args: { what: 'user', do: 'remove', id: 'maya-person-review', yes: true } }),
    headers: { authorization: `Bearer ${token}` },
  })
  assert.equal(removed.status, 200, JSON.stringify(removed.body))
  const rows = await run.counted()
  assert.deepEqual(
    rows.filter((row) => row.user === 'maya-person-review' || row.caller === 'user:maya-person-review'),
    [],
  )
  assert.ok(rows.some((row) => row.caller === 'removed' && row.name === 'addNote'))
})

test('[22-16] an upload that is cut off on its way leaves no file of the engine open behind it', async (t) => {
  const run = await counting(t)
  const opened: { path: string; closed: () => boolean }[] = []
  const original = fs.createWriteStream
  fs.createWriteStream = new Proxy(original, {
    apply(target, self, args: Parameters<typeof original>) {
      const stream = Reflect.apply(target, self, args)
      opened.push({ path: String(args[0]), closed: () => stream.closed || stream.destroyed })
      return stream
    },
  })
  syncBuiltinESMExports()
  t.after(() => {
    fs.createWriteStream = original
    syncBuiltinESMExports()
  })
  let sent = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent++ === 0) controller.enqueue(new Uint8Array(1000).fill(65))
      else controller.error(new Error('the connection of the sender was cut'))
    },
  })
  // A body that is a stream is sent one way, which a request must be told.
  const how: RequestInit & { duplex: 'half' } = {
    method: 'POST',
    headers: { 'content-type': 'text/plain', 'content-length': '100000', origin: run.origin },
    body,
    duplex: 'half',
  }
  const answer = await run.app.request(new Request(`${run.origin}/_t/files?name=cut.txt`, how))
  await answer.arrayBuffer()
  await new Promise((done) => setTimeout(done, 100))
  const incoming = opened.filter((one) => one.path.includes('.incoming'))
  assert.ok(incoming.length > 0, 'the upload began to be written')
  assert.deepEqual(
    incoming.filter((one) => !one.closed()).map((one) => one.path),
    [],
    'the file that the upload was written to is still open',
  )
})
