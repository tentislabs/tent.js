import assert from 'node:assert/strict'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { Caller } from '../../core/index.ts'
import type { App } from '../../engine/index.ts'
import { createEngine } from '../../engine/index.ts'
import { copied } from './typed.ts'

// The moment that the clock of the app stands at, so that what a seed is handed as `now` is known.
const moment = Date.UTC(2031, 4, 6, 7, 8, 9)

/** Answers the rows of one table of the log of a data folder, in the order they were written. */
function logRows(dataFolder: string, table: string): Record<string, unknown>[] {
  const log = new DatabaseSync(join(dataFolder, 'logs.db'), { readOnly: true })
  try {
    return log.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all()
  } finally {
    log.close()
  }
}

/** Answers the code of what a promise is refused with, or nothing where it is kept. */
async function codeOf(work: Promise<unknown>): Promise<string | undefined> {
  try {
    await work
  } catch (error) {
    return error instanceof Error && 'code' in error ? String(error.code) : `no code: ${error}`
  }
  return undefined
}

/** Every row of a table, read with full access, without what differs from one row to the next by itself. */
async function rowsOf(app: App, table: string): Promise<Record<string, unknown>[]> {
  const rows = await app.read({ from: table }, { as: 'system' })
  return (Array.isArray(rows) ? rows : []).map(({ id: _, createdAt: __, updatedAt: ___, ...row }) => row)
}

/** A row of the log without its moment, its time and its place in a trace, and with the name of the form taken out of the name of its definition. */
const told = (row: Record<string, unknown>): Record<string, unknown> => {
  const { at: _, ms: __, trace: ___, span: ____, parent: _____, ...rest } = row
  return { ...rest, name: String(row.name).replace(/Plain|Code/, '') }
}

test('[12-5] through the door, a query, a change and an action whose run was read do what the same definitions do as code', async (t) => {
  // The engine is closed before the folder of the copy is removed, which it holds open: also after a failure.
  const closing: (() => Promise<void>)[] = []
  t.after(async () => {
    for (const close of closing) await close()
  })
  const project = copied(t, 'bodies', 'bodies')
  const built = await buildProject(project, { for: 'dev' })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error'),
    [],
  )
  // The definitions of `plain.ts` are stored with their body and no module, and their twins as code.
  for (const name of ['list', 'add', 'total', 'quiet']) {
    const [plain, code] = [built.description.functions[`${name}Plain`], built.description.functions[`${name}Code`]]
    assert.deepEqual([plain.form, Array.isArray(plain.body), plain.module], ['plain', true, undefined], name)
    assert.deepEqual([code.form, code.body, typeof code.module], ['code', undefined, 'string'], name)
  }

  const data = join(project, '..', 'data')
  const engine = createEngine({
    port: 0,
    makers: { clock: () => ({ now: () => moment, setTimer: () => () => undefined }) },
  })
  closing.push(() => engine.close())
  const app = await engine.open(built.bundleFolder, { dataFolder: data, mode: 'test' })

  // A seed whose arrow was read names a row it added, and is handed `now`.
  assert.equal(Array.isArray(Object(built.description.seed).body), true)
  await app.seed()
  const [core] = Object(await app.read({ from: 'teams' }, { as: 'system' }))
  assert.deepEqual(await rowsOf(app, 'items'), [{ title: 'seeded', n: 1, team: core.id, at: new Date(moment) }])

  const [ada, bob] = Object(
    await app.write(
      [
        { add: 'users', values: { name: 'Ada', roles: [] } },
        { add: 'users', values: { name: 'Bob', roles: [] } },
      ],
      { as: 'system' },
    ),
  )
  await app.write([{ add: 'members', values: { team: core.id, user: ada.id } }], { as: 'system' })
  const as = (row: { id: string }): Caller => ({ kind: 'user', user: { id: row.id, roles: [] } })
  const call = (name: string, input: unknown, who = ada): Promise<unknown> => app.call(name, input, { as: as(who) })

  // A change: the same answer, the same row, and the same rows of the log.
  for (const form of ['Plain', 'Code'])
    assert.deepEqual(await call(`add${form}`, { title: 'a lamp', n: 4 }), { title: 'a lamp', n: 4, twice: 8 }, form)
  const lamps = (await rowsOf(app, 'items')).filter((row) => row.title === 'a lamp')
  assert.deepEqual(lamps, [
    { title: 'a lamp', n: 4 },
    { title: 'a lamp', n: 4 },
  ])
  // A query, with both sides of its choice.
  const listed: unknown[] = []
  for (const min of [0, 4, 99]) {
    listed.push(await call('listPlain', { min }))
    assert.deepEqual(await call('listCode', { min }), listed.at(-1), `from ${min}`)
  }
  assert.deepEqual(listed.slice(1), [
    { count: 2, titles: ['a lamp', 'a lamp'], top: 'a lamp' },
    { count: 0, titles: [], top: 'none' },
  ])
  // An action, which calls a change: the two forms see the same rows, each before its own.
  assert.deepEqual(await call('totalPlain', { title: 'a desk' }), { total: 9, added: 'a desk' })
  assert.deepEqual(await call('totalCode', { title: 'a desk' }), { total: 16, added: 'a desk' })
  assert.deepEqual(
    (await rowsOf(app, 'items')).filter((row) => row.title === 'a desk'),
    [
      { title: 'a desk', n: 7 },
      { title: 'a desk', n: 7 },
    ],
  )
  // An action whose `run` is written `async` and holds no `await` answers its caller the same in both forms.
  assert.deepEqual(
    [await call('quietPlain', { name: 'Ada' }), await call('quietCode', { name: 'Ada' })],
    ['hello Ada', 'hello Ada'],
  )

  // The log holds the same row for each call of the two forms, and the same line that the change wrote.
  const calls = logRows(data, 'calls').map(told)
  for (const name of ['add', 'list', 'total', 'quiet']) {
    const [plain, code] = ['Plain', 'Code'].map((form) =>
      logRows(data, 'calls')
        .filter((row) => row.name === `${name}${form}`)
        .map(told),
    )
    assert.ok(plain.length > 0, `${name} is in the log`)
    assert.deepEqual(plain, code, `the rows of the log of ${name}`)
  }
  assert.equal(
    calls.filter((row) => row.name === 'add').length,
    4,
    'the two changes, and each once more from an action',
  )
  const lines = (form: string) =>
    logRows(data, 'lines')
      .filter((row) => row.name === `add${form}`)
      .map(told)
  assert.equal(lines('Plain').length, 2)
  assert.deepEqual(lines('Plain'), lines('Code'))
  assert.deepEqual([lines('Plain')[0].message, lines('Plain')[0].data], ['an item was added', '{"n":4}'])

  // A change whose body fails at its last statement leaves no row.
  const before = (await rowsOf(app, 'items')).length
  assert.equal(await codeOf(call('failsLast', { title: 'never' })), 'not-kept')
  // And so does one whose `each` is handed an arrow that answers a promise.
  assert.equal(await codeOf(call('waitsInEach', { title: 'never' })), 'T0013')
  assert.equal((await rowsOf(app, 'items')).length, before)

  // A body that walks a long list is ended at its next entry, and the engine still answers.
  const began = performance.now()
  assert.equal(await codeOf(call('walks', {})), 'T0008')
  assert.ok(performance.now() - began < 5000, 'it was ended long before it had walked the list')
  assert.deepEqual(await call('listCode', { min: 99 }), { count: 0, titles: [], top: 'none' })

  // Two plain queries that call each other end at the depth of calls.
  assert.equal(await codeOf(call('ping', { n: 0 })), 'T0028')

  // A rule made with `allow` that reads `db` lets a member of the team in, and refuses another caller.
  const seen = Object(await call('teamItems', { team: core.id }))
  assert.deepEqual([seen.length, seen[0].title], [1, 'seeded'])
  assert.equal(await codeOf(call('teamItems', { team: core.id }, bob)), 'T3101')
  // One whose arrow calls a change is refused, and nothing is written.
  assert.equal(await codeOf(call('ruleWrites', {})), 'T0013')
  assert.equal((await rowsOf(app, 'items')).filter((row) => row.title === 'touched').length, 0)

  await engine.close()

  // Without the file of the code twins, the project is read: nothing of it is run.
  rmSync(join(project, 'functions', 'code.ts'))
  const plain = await buildProject(project, { for: 'release' })
  assert.deepEqual(plain.findings, [])
  assert.equal(Array.isArray(Object(plain.description.seed).body), true)
  assert.equal(existsSync(join(plain.bundleFolder, 'server')), false, 'a project of plain definitions gives no module')
})
