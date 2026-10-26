import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { tested } from './recordedProject.ts'
import { copied } from './typed.ts'

/** The project `declared` beside these tests, copied, with what the folders that `more` names lay over it. */
function declaredCopy(t: TestContext, name: string, ...more: string[]): string {
  const project = copied(t, name, 'declared')
  for (const one of more) cpSync(join(import.meta.dirname, one), project, { recursive: true })
  mkdirSync(join(project, '..', 'temp'), { recursive: true })
  return project
}

/** The table of access that a run kept, by each definition and caller, with what came of it. */
const accessOf = (project: string): Record<string, string> =>
  JSON.parse(readFileSync(join(project, 'tests', 'declared', 'access.json'), 'utf8'))

/** Each case that a run printed as text, in its order, with how it stood: `passed` or `failed`. */
function casesOf(printed: string): { line: string; stood: string }[] {
  return printed.split('\n').flatMap((line) => {
    const found = /^(passed|failed) tests\/declared: (.+)$/.exec(line.trim())
    return found ? [{ stood: found[1], line: found[2] }] : []
  })
}

test('[53-11] tent test --declared on a project with a function of each rule kind writes tests/declared/access.json; run again with no change it passes; with one rule changed it fails naming the change; --update keeps the new table', (t) => {
  const project = declaredCopy(t, 'declared-11')
  const first = tested(project, '--declared')
  assert.equal(first.ended, 0, first.printed)
  const access = accessOf(project)
  // What each caller gets of each function: the rules of nobody, a signed-in caller, a role, anyone and code.
  for (const [key, got] of Object.entries({
    'hidden - access: as nobody': 'refused T0006',
    'hidden - access: as a user with no role': 'refused T3101',
    'hidden - access: as the system': 'taken',
    'listOrders - access: as nobody': 'refused T0006',
    'listOrders - access: as a user with no role': 'taken',
    'refundOrder - access: as a user with no role': 'refused T3101',
    'refundOrder - access: as a user of the role staff': 'taken',
    'openNow - access: as nobody': 'taken',
    'staffDesk - access: as a user with no role': 'refused T3101',
    'staffDesk - access: as a user of the role staff': 'taken',
    // A route, asked by each caller that a request can be, and a command of the app's own.
    'feed - access: as nobody': 'refused T0006',
    'feed - access: as a user with no role': 'taken',
    'greet - access: as a user with no role': 'refused T3101',
    'greet - access: as a user of the role staff': 'taken',
    // And each table, read, added to, changed and removed by the same callers, and by two users where it names an owner.
    'orders - change: as a user of the role staff': 'taken',
    'orders - remove: as a user of the role staff': 'refused T2103',
    'orders - remove: as the owner': 'refused T3101',
    'orders - read: as the owner': 'taken',
  }))
    assert.equal(access[key], got, `${key} in ${JSON.stringify(access, null, 1)}`)
  assert.ok(Object.keys(access).some((key) => key.startsWith('orders - read: as another user')))
  // Each line of the output names the declaration it comes from and what came of it.
  const lines = casesOf(first.printed).map((one) => one.line)
  assert.ok(
    lines.includes("refundOrder - access: role('staff'): as a user with no role, refused T3101 (needs role 'staff')"),
  )
  assert.ok(lines.includes('openNow - access: anyone: as nobody, taken'))
  const again = tested(project, '--declared')
  assert.equal(again.ended, 0, again.printed)
  // One rule changed: the run fails, naming what changed of the table.
  const file = join(project, 'functions.ts')
  writeFileSync(
    file,
    readFileSync(file, 'utf8').replace(
      "access: role('staff'),\n  input: { order",
      "access: role('manager'),\n  input: { order",
    ),
  )
  const changed = tested(project, '--declared', '--json')
  assert.equal(changed.ended, 1, changed.printed)
  const told = (changed.answer.findings ?? []).map((one) => one.message).join('\n')
  assert.match(told, /refundOrder - access: as a user of the role staff: was taken, now refused T3101/)
  assert.equal(accessOf(project)['refundOrder - access: as a user of the role staff'], 'taken')
  const kept = tested(project, '--declared', '--update')
  assert.equal(kept.ended, 0, kept.printed)
  assert.equal(accessOf(project)['refundOrder - access: as a user of the role staff'], 'refused T3101')
  assert.equal(accessOf(project)['refundOrder - access: as a user of the role manager'] !== undefined, true)
  assert.equal(tested(project, '--declared').ended, 0)
})

test('[53-12] the edges of an input whose code throws at its max fail as internal, with the smallest failing input printed; an edge the code takes passes', (t) => {
  const project = declaredCopy(t, 'declared-12', 'declaredEdges')
  const ran = tested(project, '--declared', '--json')
  assert.equal(ran.ended, 1, ran.printed)
  const typed = tested(project, '--declared')
  const cases = casesOf(typed.printed)
  const stood = (line: string): string | undefined => cases.find((one) => one.line === line)?.stood
  assert.equal(stood('priced.price - number({ min: 0, max: 100 }): 0, taken'), 'passed', typed.printed)
  assert.equal(stood('priced.price - number({ min: 0, max: 100 }): 100, internal T0009'), 'failed', typed.printed)
  const told = (ran.answer.findings ?? []).find((one) =>
    one.message.includes('priced.price - number({ min: 0, max: 100 }): 100'),
  )
  assert.ok(told, JSON.stringify(ran.answer.findings))
  // The case is cut down to the least price that still fails, which a person calls again by hand.
  assert.match(told.message, /the smallest input that fails: \{"price":61\}/)
})

test('[53-13] a form sent empty, with its edges and with a sample, gives the same answers as the calls of points 1 and 2', (t) => {
  const project = declaredCopy(t, 'declared-13')
  const ran = tested(project, '--declared')
  assert.equal(ran.ended, 0, ran.printed)
  const cases = casesOf(ran.printed)
  const forms = cases.filter((one) => one.line.startsWith('addOrder - form on /ordering:'))
  for (const sent of ['empty', 'sample', "title 'a' (an edge)", 'total 1000 (an edge)'])
    assert.ok(
      forms.some((one) => one.line.startsWith(`addOrder - form on /ordering: ${sent},`) && one.stood === 'passed'),
      `${sent} in ${JSON.stringify(forms)}`,
    )
  // Sent with a sample, the form is taken, as the call with the sample is.
  assert.ok(forms.some((one) => one.line === 'addOrder - form on /ordering: sample, taken'))
  assert.ok(
    cases.some((one) => one.line.startsWith('addOrder - access: signedIn: as a user') && one.line.endsWith(', taken')),
  )
})

test('[53-14] [16-2@12] no generated case reaches outside: a service, a model, a plain fetch and a run that asks a person are each held, a service and a model refused with T7132', (t) => {
  const project = declaredCopy(t, 'declared-14', 'declaredOutside')
  const ran = tested(project, '--declared')
  assert.equal(ran.ended, 0, ran.printed)
  const lines = casesOf(ran.printed).map((one) => one.line)
  for (const held of [
    'charge - access: signedIn: as a user with no role, refused T7132',
    'paint - access: signedIn: as a user with no role, refused T7132',
    'fetchOut - access: signedIn: as a user with no role, refused T7132',
  ])
    assert.ok(lines.includes(held), `${held} in ${lines.join('\n')}`)
  assert.ok(
    lines.includes('askPerson - access: signedIn: as a user with no role, taken; a person was asked, and answered no'),
    lines.join('\n'),
  )
})

test('[53-15] the same description gives the same cases in the same order, the order of the names of the definitions', (t) => {
  const project = declaredCopy(t, 'declared-15')
  const [first, second] = [tested(project, '--declared'), tested(project, '--declared')]
  const [one, two] = [casesOf(first.printed), casesOf(second.printed)].map((cases) => cases.map((it) => it.line))
  assert.ok(one.length > 20, first.printed)
  assert.deepEqual(two, one, second.printed)
  const names = one.map((line) => line.split(/[ .]/)[0])
  assert.deepEqual(
    names,
    [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
  )
})

test('[53-16] a choice values are read by tent test --plan and by the generator from values', (t) => {
  const project = declaredCopy(t, 'declared-16')
  const planned = tested(project, '--plan', 'ordering', '--json')
  assert.equal(planned.ended, 0, planned.printed)
  const written = join(project, 'tests', 'ordering.test.ts')
  assert.ok(existsSync(written))
  assert.match(readFileSync(written, 'utf8'), /page\.pick\('size', 'small'\)/)
  const ran = tested(project, '--declared')
  const lines = casesOf(ran.printed).map((one) => one.line)
  for (const value of ['small', 'large'])
    assert.ok(lines.includes(`pick.size - choice('small', 'large'): '${value}', taken`), lines.join('\n'))
})
