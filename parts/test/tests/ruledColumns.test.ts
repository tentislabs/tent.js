import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { TestContext } from 'node:test'
import test from 'node:test'
import type { Caller } from '../../core/index.ts'
import type { TestApp } from '../index.ts'
import { appIn } from './desks.ts'
import { copyOf } from './projects.ts'

type Row = Record<string, unknown>

const rowsOf = (answer: unknown): Row[] => (Array.isArray(answer) ? answer : [])

/** The test app of the ruled columns, with a person of `hr`, a manager, and one who is neither. */
async function ruled(
  t: TestContext,
): Promise<{ app: TestApp; dataFolder: string; hr: string; boss: string; plain: string; pia: Caller }> {
  const { app, dataFolder } = await appIn(t, copyOf(t, 'ruledColumns'))
  const id = (caller: Caller): string => String(caller.user?.id)
  const hr = id(await app.user({ name: 'Hana', roles: ['hr'] }))
  const boss = id(await app.user({ name: 'Bora', roles: [] }))
  const pia = await app.user({ name: 'Pia', roles: [] })
  const plain = id(pia)
  const ada = Object(
    await app.as(hr).call('addStaff', { name: 'Ada', salary: 5000, bonus: 300, manager: boss, about: 'a quiet raise' }),
  )
  await app.as(hr).call('addStaff', { name: 'Bob', salary: 4000, about: 'moves to the north' })
  await app.as(hr).call('addDesk', { label: 'by the window', holder: String(ada.id) })
  return { app, dataFolder, hr, boss, plain, pia }
}

test('[45-5] a caller outside the read rule of a column gets each row without it, also through a link, and one inside the rule gets it; a rule that is a filter lets in the row it fits', async (t) => {
  const { app, hr, boss, plain, pia } = await ruled(t)
  const [hrRows, bossRows, plainRows] = await Promise.all(
    [hr, boss, plain].map(async (who) => rowsOf(await app.as(who).call('allStaff', {}))),
  )
  assert.deepEqual(
    hrRows.map((one) => [one.name, one.salary, one.about]),
    [
      ['Ada', 5000, 'a quiet raise'],
      ['Bob', 4000, 'moves to the north'],
    ],
  )
  for (const row of [...bossRows, ...plainRows]) {
    assert.equal('salary' in row, false, `${String(row.name)} holds no salary for a caller outside the rule`)
    assert.equal('about' in row, false)
  }
  // The bonus is read by the manager of the row alone: the filter of its rule is held against each row.
  assert.deepEqual(
    bossRows.map((one) => [one.name, one.bonus]),
    [
      ['Ada', 300],
      ['Bob', undefined],
    ],
  )
  assert.equal(
    hrRows.some((one) => 'bonus' in one),
    false,
    'hr is no manager of a row',
  )
  // Through a link the linked row is held to the same rules.
  const [desk] = rowsOf(await app.as(plain).call('desksWithHolders', {}))
  const holder = Object(desk.holder)
  assert.equal(holder.name, 'Ada')
  assert.equal('salary' in holder, false)
  const [seen] = rowsOf(await app.as(hr).call('desksWithHolders', {}))
  assert.equal(Object(seen.holder).salary, 5000)
  // A browser reads as a page and its live answer read: the same rows, without the column.
  const browser = app.browser({ as: pia })
  const read = await browser.read('allStaff', {})
  for (const row of rowsOf(Reflect.get(Object(read), 'value'))) assert.equal('salary' in row, false)
})

test('[45-5] a caller outside the read rule is refused a filter, a sort and a group by the column, a value worked out from it is left out of a group, and a search is answered over the other columns', async (t) => {
  const { app, hr, plain } = await ruled(t)
  const code = async (work: Promise<unknown>): Promise<string> => {
    try {
      await work
      return 'none'
    } catch (error) {
      return String(Reflect.get(Object(error), 'code'))
    }
  }
  assert.equal(await code(app.as(plain).call('paidAbove', { least: 4500 })), 'T0013')
  assert.equal(await code(app.as(plain).call('bySalary', {})), 'T0013')
  assert.equal(await code(app.as(plain).call('bySalaryGroup', {})), 'T0013')
  // For a caller inside the rule each answers.
  assert.deepEqual(
    rowsOf(await app.as(hr).call('paidAbove', { least: 4500 })).map((one) => one.name),
    ['Ada'],
  )
  assert.deepEqual(
    rowsOf(await app.as(hr).call('bySalary', {})).map((one) => one.name),
    ['Bob', 'Ada'],
  )
  // A group that sums the column is answered without that field for a caller outside the rule.
  for (const record of rowsOf(await app.as(plain).call('salaries', {}))) assert.equal('total' in record, false)
  assert.equal(
    rowsOf(await app.as(hr).call('salaries', {})).reduce((all, one) => all + Number(one.total), 0),
    9000,
  )
  // The words about a person are read by hr alone: for anyone else a search matches the other columns alone.
  assert.deepEqual(rowsOf(await app.as(plain).call('searched', { words: 'quiet' })), [])
  assert.deepEqual(
    rowsOf(await app.as(plain).call('searched', { words: 'Ada' })).map((one) => [one.name, 'about' in one]),
    [['Ada', false]],
  )
  assert.deepEqual(
    rowsOf(await app.as(hr).call('searched', { words: 'quiet' })).map((one) => one.name),
    ['Ada'],
  )
})

test('[45-6] where on a findable sealed column finds the row, the same value in another findable column does not match, nothing is stored open, and a sort or a range on it is T2026', async (t) => {
  const { app, dataFolder, hr } = await ruled(t)
  await app.as(hr).call('addAccount', { email: 'ada@example.com' })
  await app.as(hr).call('addAccount', { email: 'bob@example.com', spare: 'ada@example.com' })
  const found = rowsOf(await app.as(hr).call('byEmail', { email: 'ada@example.com' }))
  assert.deepEqual(
    found.map((one) => [one.email, one.spare]),
    [['ada@example.com', undefined]],
  )
  // The same value in `spare` is bound to its own column: a search by `email` does not reach it, and one by `spare` does.
  assert.deepEqual(
    rowsOf(await app.as(hr).call('bySpare', { email: 'ada@example.com' })).map((one) => one.email),
    ['bob@example.com'],
  )
  assert.deepEqual(rowsOf(await app.as(hr).call('byEmail', { email: 'nobody@example.com' })), [])
  // The fingerprint is handed to no code, and the file holds no value as it was written.
  const stored = await app.read({ from: 'accounts' }, { as: { kind: 'system' } })
  assert.deepEqual(Object.keys(Object(rowsOf(stored)[0])).sort(), ['createdAt', 'email', 'id', 'updatedAt'])
  const file = new DatabaseSync(join(dataFolder, 'data.db'), { readOnly: true })
  try {
    const held = JSON.stringify(file.prepare('SELECT * FROM "accounts"').all())
    assert.equal(held.includes('example.com'), false, held)
  } finally {
    file.close()
  }
  await assert.rejects(app.as(hr).call('sortedEmails', {}), { code: 'T2026' })
  await assert.rejects(app.as(hr).call('emailsAfter', { email: 'b' }), { code: 'T2026' })
})

test('[45-5] a row that code with full access read is held to the read rule of a column again where it leaves through a typed answer, a field of a group too', async (t) => {
  const folder = copyOf(t, 'ruledColumns')
  const functions = join(folder, 'functions', 'functions.ts')
  writeFileSync(
    functions,
    `${readFileSync(functions, 'utf8')}
export const staffAsSystem = query('staffAsSystem', {
  access: 'signedIn',
  system: 'a test reads every row with full access',
  run: ({ db }) => db.system.staff.oldest('createdAt').all(),
})

export const salaryGroupsAsSystem = query('salaryGroupsAsSystem', {
  access: 'signedIn',
  system: 'a test groups every row with full access',
  run: ({ db }) => db.system.staff.group('salary', { n: count() }).all(),
})
`,
  )
  const { app } = await appIn(t, folder)
  const hr = await app.user({ name: 'Hana', roles: ['hr'] })
  const pia = await app.user({ name: 'Pia', roles: [] })
  await app.as(hr).call('addStaff', { name: 'Ada', salary: 5000 })
  const rows = async (who: Caller, name: string) => rowsOf(await app.as(who).call(name, {}))
  assert.deepEqual(
    (await rows(hr, 'staffAsSystem')).map((one) => one.salary),
    [5000],
  )
  assert.deepEqual(
    (await rows(pia, 'staffAsSystem')).map((one) => 'salary' in one),
    [false],
  )
  assert.deepEqual(await rows(hr, 'salaryGroupsAsSystem'), [{ salary: 5000, n: 1 }])
  assert.deepEqual(await rows(pia, 'salaryGroupsAsSystem'), [{ n: 1 }])
})
