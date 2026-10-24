import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Type } from '../../core/index.ts'
import { boolean, json, list, number, object, text } from '../../core/index.ts'
import { checkValue } from '../../core/internal.ts'
import type { Typed } from './typed.ts'
import { copied, root, typed } from './typed.ts'

// The project of an app that keeps a data file for each team, as the tests of the test helpers hold it.
const desk = join(root, 'parts', 'test', 'tests', 'desk')

const id = text({ pattern: '^[0-9a-hjkmnp-tv-z]{26}$' })

const file = object({
  table: text(),
  id,
  layout: text({ pattern: '^[0-9a-f]+$' }),
  tables: list(text()),
  writes: number(),
  size: number(),
  open: boolean(),
  behind: boolean(),
  unswept: boolean(),
  failed: object({ code: text({ optional: true }), message: text() }, { optional: true }),
  due: number({ optional: true }),
})

/** The stored shape of the value of each command of the files of tenants. */
const shapes: Record<string, Type> = {
  'data files': object({
    files: list(file),
    stray: object(
      {
        removed: list(text()),
        listed: list(text()),
        folded: list(text()),
        refused: list(text()),
        temporary: number(),
      },
      { optional: true },
    ),
    swept: number({ optional: true }),
    retried: object({ id, ok: boolean(), error: text({ optional: true }) }, { optional: true }),
  }),
  'data rows': list(json()),
  'data backup': object({ file: text(), writes: number(), rows: number({ optional: true }) }),
  'data restore': object({ restored: text(), of: id }),
  run: object({ value: json({ optional: true }), lines: list(json()) }),
}

/** Holds what a command printed with `--json` to the stored shape of its name, and answers its value. */
function shaped(name: string, output: Typed): Record<string, unknown> {
  assert.equal(output.ended, 0, `tent ${name} ends with 0: ${output.printed}`)
  const printed = object({ ok: boolean(), value: shapes[name], findings: list(json()) })
  assert.deepEqual(checkValue(printed, output.answer), [], `the shape of tent ${name} --json`)
  assert.deepEqual([output.answer.ok, output.answer.findings], [true, []], name)
  return Object(output.answer.value)
}

test('[15-6@4] [50-6] `tent data files` lists each file with its layout and its size, `tent data rows orders --of <id>` reads one tenant, and each command of the files of tenants prints its stored shape with --json', async (t) => {
  const project = copied(t, 'files', desk)
  const run = async (name: string, input: object): Promise<string> =>
    String(Object(shaped('run', await typed(project, 'run', name, '--with', JSON.stringify(input), '--json')).value).id)
  const [north, south] = [await run('addTeam', { name: 'North' }), await run('addTeam', { name: 'South' })]
  await run('addOrder', { team: north, title: 'a lamp' })
  await run('addOrder', { team: north, title: 'a desk' })
  await run('addOrder', { team: south, title: 'a chair' })

  // The directory: one row for each file, with its table, its tenant, its layout, its tables and its size.
  const files = shaped('data files', await typed(project, 'data', 'files', '--json')).files
  assert.ok(Array.isArray(files))
  assert.deepEqual(files.map((one) => one.id).sort(), [north, south].sort())
  for (const one of files) {
    assert.deepEqual([one.table, one.tables, one.behind, one.unswept], ['teams', ['orders'], false, false])
    assert.ok(one.size >= 20 * 1024 && one.writes > 0)
  }
  assert.equal(files[0].layout, files[1].layout)

  // One tenant is read by its id alone.
  const rows = shaped('data rows', await typed(project, 'data', 'rows', 'orders', '--of', north, '--json'))
  assert.deepEqual(
    Object.values(rows)
      .map((row) => Object(row).title)
      .sort(),
    ['a desk', 'a lamp'],
  )
  // A table of the shared file is read as before, and of a tenant table the command names its tenant.
  assert.equal(Object.values(shaped('data rows', await typed(project, 'data', 'rows', 'teams', '--json'))).length, 2)
  const noTenant = await typed(project, 'data', 'rows', 'orders', '--json')
  assert.equal(noTenant.ended, 1)
  assert.deepEqual(
    noTenant.answer.findings?.map((one) => one.code),
    ['T0002'],
  )

  // Each flag narrows the list, or does its work and says what it did.
  for (const flag of ['--behind', '--unswept', '--due'])
    assert.deepEqual(shaped('data files', await typed(project, 'data', 'files', flag, '--json')).files, [], flag)
  assert.deepEqual(shaped('data files', await typed(project, 'data', 'files', '--stray', '--json')).stray, {
    removed: [],
    listed: [],
    folded: [],
    refused: [],
    temporary: 0,
  })
  assert.equal(shaped('data files', await typed(project, 'data', 'files', '--sweep', '--json')).swept, 0)
  assert.deepEqual(shaped('data files', await typed(project, 'data', 'files', '--retry', north, '--json')).retried, {
    id: north,
    ok: true,
  })

  // `backup --whole` copies every file, and `restore --of` puts one tenant back.
  const backup = shaped('data backup', await typed(project, 'data', 'backup', '--whole', '--json'))
  const folder = String(backup.file)
  assert.deepEqual(readdirSync(folder).sort(), ['data.db', 'files.json', 'tenants'])
  assert.equal(existsSync(join(folder, 'tenants', 'teams', north.slice(-2), `${north}.db`)), true)
  await run('addOrder', { team: north, title: 'after the backup' })
  const restored = shaped('data restore', await typed(project, 'data', 'restore', folder, '--of', north, '--json'))
  assert.deepEqual(restored, { restored: folder, of: north })
  const again = shaped('data rows', await typed(project, 'data', 'rows', 'orders', '--of', north, '--json'))
  assert.equal(Object.values(again).length, 2)
})
