import assert from 'node:assert/strict'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import type { Caller } from '../../core/index.ts'
import type { TestApp } from '../index.ts'
import { appIn } from './desks.ts'
import { copyOf } from './projects.ts'

type Row = Record<string, unknown>

const rowsOf = (answer: unknown): Row[] => (Array.isArray(answer) ? answer : [])

// The other ways a plan may reach the salary: through a link, inside `not` and `any`, by a sort and a group through
// a link, by a plan inside a filter, and through a row that a staff row is linked from.
const more = `
export const desksPaidAbove = query('desksPaidAbove', {
  access: 'signedIn',
  input: { least: number() },
  rows: desks.where({ 'holder.salary': { above: input('least') } }).limit(100),
})

export const notPaidAbove = query('notPaidAbove', {
  access: 'signedIn',
  input: { least: number() },
  rows: staff.where({ not: { salary: { above: input('least') } } }).limit(100),
})

export const anyPaidAbove = query('anyPaidAbove', {
  access: 'signedIn',
  input: { least: number() },
  rows: staff.where({ any: [{ name: 'nobody' }, { salary: { above: input('least') } }] }).limit(100),
})

export const desksBySalary = query('desksBySalary', {
  access: 'signedIn',
  rows: desks.sort('holder.salary').limit(100),
})

export const desksGrouped = query('desksGrouped', {
  access: 'signedIn',
  rows: desks.group('holder.salary', { n: count() }),
})

export const desksSummed = query('desksSummed', {
  access: 'signedIn',
  rows: desks.group('label', { total: sum('holder.salary') }),
})

export const desksOfWellPaid = query('desksOfWellPaid', {
  access: 'signedIn',
  input: { least: number() },
  rows: desks.where({ holder: { in: staff.where({ salary: { above: input('least') } }).pick('id') } }).limit(100),
})

export const renameStaff = change('renameStaff', {
  access: 'signedIn',
  input: { person: text(), name: text() },
  set: staff.change(input('person'), { name: input('name') }),
})

export const salaryInCode = query('salaryInCode', {
  access: 'signedIn',
  input: { least: number() },
  output: number(),
  run: ({ db, input: given }) => db.staff.where({ salary: { above: given.least } }).count(),
})
`

/** The test app of the ruled columns with the plans of the attacks, a person of `hr`, and one who is not. */
async function ruled(t: TestContext): Promise<{ app: TestApp; hr: string; plain: string }> {
  const folder = copyOf(t, 'ruledColumns')
  appendFileSync(join(folder, 'functions', 'functions.ts'), more)
  const { app } = await appIn(t, folder)
  const id = (caller: Caller): string => String(caller.user?.id)
  const hr = id(await app.user({ name: 'Hana', roles: ['hr'] }))
  const plain = id(await app.user({ name: 'Pia', roles: [] }))
  const ada = Object(await app.as(hr).call('addStaff', { name: 'Ada', salary: 5000, about: 'a quiet raise' }))
  await app.as(hr).call('addStaff', { name: 'Bob', salary: 4000, about: 'moves to the north' })
  await app.as(hr).call('addDesk', { label: 'by the window', holder: String(ada.id) })
  return { app, hr, plain }
}

const codeOf = async (work: Promise<unknown>): Promise<string> => {
  try {
    await work
    return 'none'
  } catch (error) {
    return String(Reflect.get(Object(error), 'code'))
  }
}

test('[45-19.4] a column with a read rule is reached by a filter through a link, inside not and any, in a plan inside a filter, and in code: refused on each path', async (t) => {
  const { app, hr, plain } = await ruled(t)
  for (const [query, input] of [
    ['desksPaidAbove', { least: 4500 }],
    ['notPaidAbove', { least: 4500 }],
    ['anyPaidAbove', { least: 4500 }],
    ['desksOfWellPaid', { least: 4500 }],
    ['salaryInCode', { least: 4500 }],
  ] as const) {
    assert.equal(await codeOf(app.as(plain).call(query, input)), 'T0013', `${query} is refused`)
    assert.equal(await codeOf(app.as(hr).call(query, input)), 'none', `${query} answers hr`)
  }
})

test('[45-19.4] a column with a read rule is reached by a sort or a group through a link: refused, or the value left out', async (t) => {
  const { app, plain } = await ruled(t)
  assert.equal(await codeOf(app.as(plain).call('desksBySalary', {})), 'T0013')
  assert.equal(await codeOf(app.as(plain).call('desksGrouped', {})), 'T0013')
  const summed = await app
    .as(plain)
    .call('desksSummed', {})
    .catch(() => [])
  for (const record of rowsOf(summed)) assert.equal('total' in record, false, 'no value worked out from the salary')
})

test('[45-19.4] a search by a caller outside a column rule is answered over the other columns, the column left out of what is matched', async (t) => {
  const { app, plain } = await ruled(t)
  const named = rowsOf(await app.as(plain).call('searched', { words: 'Ada' }))
  assert.deepEqual(
    named.map((one) => [one.name, 'about' in one]),
    [['Ada', false]],
    'a search is never refused whole',
  )
  assert.deepEqual(
    rowsOf(await app.as(plain).call('searched', { words: 'quiet' })),
    [],
    'the words about Ada match nothing',
  )
})

test('[45-19.4] the row a change answers to a caller outside a column rule is without the column', async (t) => {
  const { app, plain } = await ruled(t)
  const [ada] = rowsOf(await app.as(plain).call('allStaff', {}))
  const answer = Object(await app.as(plain).call('renameStaff', { person: String(ada.id), name: 'Ada Lovelace' }))
  assert.equal(answer.name, 'Ada Lovelace')
  assert.equal('salary' in answer, false, 'the answer of a change tells no salary')
  assert.equal('about' in answer, false)
})
