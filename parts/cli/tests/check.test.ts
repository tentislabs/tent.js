import assert from 'node:assert/strict'
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import { createEngine } from '../../engine/index.ts'
import type { Typed } from './typed.ts'
import { copied, root, typed, typedApart } from './typed.ts'

/** The line of a file of a project that holds a piece of text, counted from 1. */
const lineOf = (project: string, file: string, piece: string): number =>
  readFileSync(join(project, file), 'utf8')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .findIndex((line) => line.includes(piece)) + 1

/** The findings of a check of one code, each as its code and its place. */
const found = (output: Typed, code: string): unknown[] =>
  (output.answer.findings ?? []).filter((one) => one.code === code).map((one) => [one.code, one.where])

// The table of the orders with one more column, and a file with a mistake that no table change has a part in.
const withNote = `import { boolean, link, role, table, text } from 'tentjs'

export const orders = table('orders', {
  columns: { title: text(), owner: link('users'), paid: boolean({ default: false }), note: text({ optional: true }) },
  owner: 'owner',
  access: { read: 'owner', add: 'signedIn', change: role('staff'), remove: role('staff') },
})
`
const broken = `import { query } from 'tentjs'
import { orders } from '../tables/orders'

export const waits = query('waits', { access: 'signedIn', run: async ({ db }) => db.orders.limit(5).all() })
`

test('[15-7] `tent check` on a project with an error, with no engine running, still reports the findings of a table change against its data', async (t) => {
  const project = copied(t, 'check')
  const data = join(project, '.tent')
  const table = join(project, 'tables', 'orders.ts')
  const without = readFileSync(table, 'utf8')
  writeFileSync(table, withNote)
  // With no data yet, and with none running, the check has nothing to hold the project against, and starts nothing.
  const fresh = typedApart(project, 'check', '--json')
  assert.deepEqual([fresh.ended, fresh.answer.ok, fresh.answer.findings], [0, true, []], fresh.printed)
  assert.equal(existsSync(join(data, 'data.db')), false, 'the check made no data')

  // A command makes the data of the project, with the column in it.
  const made = await typed(project, 'run', 'addUser', '--with', '{"name":"Maya","roles":[]}', '--json')
  assert.equal(made.ended, 0, made.printed)
  const same = typedApart(project, 'check', '--json')
  assert.deepEqual([same.ended, same.answer.findings], [0, []], same.printed)

  // The column goes, with no `removed`, and a query is written with a mistake of its own.
  writeFileSync(table, without)
  writeFileSync(join(project, 'functions', 'broken.ts'), broken)
  const checked = typedApart(project, 'check', '--json')
  assert.deepEqual([checked.ended, checked.answer.ok], [1, false], checked.printed)
  const place = {
    file: 'tables/orders.ts',
    line: lineOf(project, 'tables/orders.ts', "table('orders'"),
    definition: 'orders',
  }
  assert.deepEqual(found(checked, 'T2002'), [['T2002', place]])
  const gone = checked.answer.findings?.find((one) => one.code === 'T2002')
  assert.equal(gone?.message, 'The column `orders.note` is gone, and `removed` does not name it.')
  assert.match(gone?.fix ?? '', /removed/)
  assert.equal(found(checked, 'T4005').length, 1, 'the mistake of the project is reported beside it')
  // It ended by itself, started no engine, and left the data as it was.
  assert.equal(existsSync(join(data, 'engine.json')), false)

  // As text, the finding stands with its place, its fix and its page.
  const text = await typed(project, 'check')
  assert.equal(text.ended, 1)
  assert.match(text.printed, /error T2002 +tables\/orders\.ts:\d+ +orders/)
  assert.match(text.printed, /more: tent docs T2002/)

  // The statement that the fix names takes the finding away, and the mistake of the project stays.
  writeFileSync(table, without.replace("owner: 'owner',", "owner: 'owner',\n  removed: ['note'],"))
  const stated = typedApart(project, 'check', '--json')
  assert.deepEqual([found(stated, 'T2002'), found(stated, 'T4005').length], [[], 1], stated.printed)

  // With an engine running on the data, the check asks it for its facts, through the admin channel.
  writeFileSync(table, withNote)
  rmSync(join(project, 'functions', 'broken.ts'))
  const built = await buildProject(project, { for: 'dev' })
  const engine = createEngine({ port: 0 })
  t.after(() => engine.close())
  await engine.open(built.bundleFolder, { dataFolder: data, mode: 'development' })
  writeFileSync(table, without)
  const reached: string[] = []
  const real = globalThis.fetch
  globalThis.fetch = (...handed: Parameters<typeof fetch>) => {
    const [first] = handed
    reached.push(first instanceof Request ? first.url : String(first))
    return real(...handed)
  }
  try {
    const live = await typed(project, 'check', '--json')
    assert.deepEqual(found(live, 'T2002'), [['T2002', place]], live.printed)
    assert.equal(live.ended, 1)
  } finally {
    globalThis.fetch = real
  }
  assert.equal(reached.filter((url) => /\/_t\/admin\/facts$/.test(url)).length, 1, reached.join(' '))
  await engine.close()
  assert.equal(existsSync(join(data, 'engine.json')), false)
})

test('[15-1@4] the failing project of each rule that passes T2001 to T2004 on fails against the data of its passing project, with exactly its code', async (t) => {
  const rules = join(root, 'parts', 'check', 'tests')
  for (const code of ['T2001', 'T2002', 'T2003', 'T2004']) {
    const project = copied(t, `check-${code}`, join(rules, code, 'pass'))
    // The passing project makes its data, with one row, and passes against it.
    const added = await typed(project, 'run', 'addNote', '--with', '{"body":"open","n":"three"}', '--json')
    assert.equal(added.ended, 0, added.printed)
    const passing = await typed(project, 'check', '--json')
    assert.deepEqual([passing.ended, passing.answer.findings], [0, []], `${code}: ${passing.printed}`)

    // The failing project is the same app after a change of its tables: its files stand in place of the others.
    rmSync(join(project, 'functions'), { recursive: true })
    cpSync(join(rules, code, 'fail'), project, { recursive: true })
    const failing = await typed(project, 'check', '--json')
    assert.equal(failing.ended, 1, `${code}: ${failing.printed}`)
    assert.deepEqual([...new Set(failing.answer.findings?.map((one) => one.code))], [code], failing.printed)
    assert.equal(failing.answer.findings?.length, 1, code)
    const [one] = failing.answer.findings ?? []
    assert.ok(one.fix, code)
    const gone = code === 'T2003'
    assert.deepEqual(
      one.where,
      gone
        ? { file: 'tent.ts', line: lineOf(project, 'tent.ts', "project('shop'"), definition: 'shop' }
        : {
            file: 'functions/notes.ts',
            line: lineOf(project, 'functions/notes.ts', "table('notes'"),
            definition: 'notes',
          },
      code,
    )
    if (code === 'T2001') assert.match(one.message, /^1 row of `notes` does not fit/)
  }
})
