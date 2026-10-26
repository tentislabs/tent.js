import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { recordedCopy, tested } from './recordedProject.ts'
import { typed } from './typed.ts'

/** What `.tent/tests.json` keeps of one run of one test. */
interface Kept {
  result: string
  ms: number
  key: string
  touched: Record<string, string[]>
  outside?: string[]
  whole?: true
}

/** The record of the tests of a project: each test by its file and its name, two of one name in their order. */
interface TestsKept {
  tests: { [file: string]: { [name: string]: Kept[] } }
}

// The three tests of the project, each in a file of its own that imports what it calls alone.
const [added, listed, noted] = ['an order is added and paid for', 'open orders are listed', 'a note is kept']
const filesOf: Record<string, string> = {
  [added]: 'tests/added.test.ts',
  [listed]: 'tests/listed.test.ts',
  [noted]: 'tests/noted.test.ts',
}

/** The record that `tent test` keeps in the project. */
const recordOf = (project: string): TestsKept => JSON.parse(readFileSync(join(project, '.tent', 'tests.json'), 'utf8'))

/** The kept run of one test, by its file and its name. */
function keptOf(project: string, name: string, of = filesOf[name]): Kept {
  const kept = recordOf(project).tests[of]?.[name]?.[0]
  assert.ok(kept, `${of}: ${name} is kept`)
  return kept
}

/** The tests that a run printed as text, each with how it stands: `passed`, `failed` or `replayed`. */
function linesOf(printed: string): Record<string, string> {
  const lines: Record<string, string> = {}
  for (const line of printed.split('\n')) {
    const found = /^(passed|failed|replayed) (.+)$/.exec(line.trim())
    if (found) lines[found[2]] = found[1]
  }
  return lines
}

/** Each test of the orders that a run printed, with how it stands. */
const ordersIn = (printed: string): string[] => {
  const lines = linesOf(printed)
  return [added, listed, noted].map((name) => `${lines[`${filesOf[name]}: ${name}`] ?? 'missing'} ${name}`)
}

test('[53-1] a test that touched a function, a table read through app.rows, a service and an address that answered "not found" stands in .tent/tests.json with each of them', (t) => {
  const project = recordedCopy(t, 'recorded-1')
  const ran = tested(project, '--json')
  assert.equal(ran.ended, 0, ran.printed)
  const kept = keptOf(project, added)
  assert.equal(kept.result, 'passed')
  assert.equal(typeof kept.ms, 'number')
  assert.match(kept.key, /^[0-9a-f]{16,}$/)
  for (const fn of ['addOrder', 'charge']) assert.ok(kept.touched.functions?.includes(fn), fn)
  // The table that the test read by `app.rows` alone, and the one it wrote by `app.user`.
  assert.ok(kept.touched.read?.includes('orders'), JSON.stringify(kept.touched))
  assert.ok(kept.touched.wrote?.includes('orders'))
  assert.ok(kept.touched.wrote?.includes('users'))
  assert.deepEqual(kept.touched.services, ['pay'])
  assert.ok(kept.touched.asked?.includes('/nowhere'), JSON.stringify(kept.touched))
  assert.equal(kept.outside, undefined)
  // Another test, in a file of its own, with what it touched alone.
  const other = keptOf(project, listed)
  assert.deepEqual(other.touched.functions, ['openOrders'])
  assert.equal(other.touched.services, undefined)
})

test('[53-2] a second run with nothing changed replays every test, prints each as replayed, and runs none; --json and the report count them as replayed', (t) => {
  const project = recordedCopy(t, 'recorded-2')
  const first = tested(project, '--json')
  assert.equal(first.ended, 0, first.printed)
  assert.deepEqual(
    [Reflect.get(Object(first.answer.value), 'passed'), Reflect.get(Object(first.answer.value), 'replayed')],
    [3, 0],
  )
  const before = recordOf(project)
  const second = tested(project, '--json')
  assert.equal(second.ended, 0, second.printed)
  const value = Object(second.answer.value)
  assert.deepEqual([value.passed, value.failed, value.replayed], [0, 0, 3])
  const report = JSON.parse(readFileSync(join(project, 'results', 'tests', 'report.json'), 'utf8'))
  assert.equal(report.value.replayed, 3)
  assert.equal(report.value.passed, 0)
  // Nothing ran: the record of each test stands as the first run left it.
  assert.deepEqual(recordOf(project), before)
  // As text, each test stands as replayed, and none as passed.
  const third = tested(project)
  assert.equal(third.ended, 0, third.printed)
  assert.deepEqual(ordersIn(third.printed), [`replayed ${added}`, `replayed ${listed}`, `replayed ${noted}`])
})

test('[53-3] a change of one function runs again exactly the tests that touched it, and replays the rest', (t) => {
  const project = recordedCopy(t, 'recorded-3')
  assert.equal(tested(project).ended, 0)
  const open = join(project, 'functions', 'open.ts')
  writeFileSync(
    open,
    readFileSync(open, 'utf8').replace('where({ paid: false })', 'where({ paid: false, title: "none" })'),
  )
  const again = tested(project)
  assert.equal(again.ended, 0, again.printed)
  assert.deepEqual(ordersIn(again.printed), [`replayed ${added}`, `passed ${listed}`, `replayed ${noted}`])
})

test('[53-4] a new flow `on` a table a test wrote, and a new screen at an address a test asked and got "not found", each run that test again', (t) => {
  const project = recordedCopy(t, 'recorded-4')
  assert.equal(tested(project).ended, 0)
  mkdirSync(join(project, 'flows'))
  writeFileSync(
    join(project, 'flows', 'kept.ts'),
    `import { flow } from 'tentjs'
import { notes } from '../tables/notes'

export const keptNote = flow('keptNote', { on: notes.added(), run: async () => 'seen' })
`,
  )
  const flowed = tested(project)
  assert.equal(flowed.ended, 0, flowed.printed)
  assert.deepEqual(ordersIn(flowed.printed), [`replayed ${added}`, `replayed ${listed}`, `passed ${noted}`])
  writeFileSync(
    join(project, 'screens', 'nowhere.tsx'),
    `import { screen } from 'tentjs/ui'

export const nowhere = screen('nowhere', { path: '/nowhere', access: 'signedIn', view: () => <p>Here now</p> })
`,
  )
  const screened = tested(project)
  assert.equal(screened.ended, 0, screened.printed)
  assert.deepEqual(ordersIn(screened.printed), [`passed ${added}`, `replayed ${listed}`, `replayed ${noted}`])
})

test('[53-5] a test that failed, one that reached outside (a plain fetch, an unfaked model, a file read through node:fs), one of --ai, and the tests of a file whose app opened in `before`, are never replayed', (t) => {
  const project = recordedCopy(t, 'recorded-5', 'recordedOutside')
  const outside = 'tests/outside.test.ts'
  const shared = 'tests/shared.test.ts'
  const first = tested(project)
  assert.equal(first.ended, 1, first.printed)
  // Each test that reached outside says what it reached; the tests of the file whose app opened in `before` run whole.
  assert.ok(keptOf(project, 'a plain fetch leaves the program', outside).outside?.length)
  assert.ok(keptOf(project, 'a model that no test faked', outside).outside?.length)
  assert.ok(keptOf(project, 'a file read through node:fs', outside).outside?.length)
  assert.equal(keptOf(project, 'the shared app lists its orders', shared).whole, true)
  const second = tested(project)
  assert.equal(second.ended, 1, second.printed)
  const lines = linesOf(second.printed)
  assert.deepEqual(ordersIn(second.printed), [`replayed ${added}`, `replayed ${listed}`, `replayed ${noted}`])
  assert.deepEqual(
    [
      'a test that fails',
      'a plain fetch leaves the program',
      'a model that no test faked',
      'a file read through node:fs',
    ].map((name) => lines[`${outside}: ${name}`]),
    ['failed', 'passed', 'passed', 'passed'],
  )
  assert.equal(lines[`${shared}: the shared app lists its orders`], 'passed')
  // A run of the tests of AI behaviour runs each of them, every time.
  for (let run = 0; run < 2; run++) {
    const ai = tested(project, '--ai', '--json')
    assert.equal(ai.ended, 0, ai.printed)
    assert.deepEqual(
      [Reflect.get(Object(ai.answer.value), 'passed'), Reflect.get(Object(ai.answer.value), 'replayed')],
      [1, 0],
    )
  }
})

test('[53-6] --all runs every test and makes every record anew', (t) => {
  const project = recordedCopy(t, 'recorded-6')
  assert.equal(tested(project).ended, 0)
  // A record that no longer says what was touched, and a test that is gone, are made anew by a run of everything.
  const record = recordOf(project)
  const first = record.tests[filesOf[added]]?.[added]?.[0]
  assert.ok(first)
  first.touched = {}
  record.tests['tests/gone.test.ts'] = { 'a test that is gone': [{ ...first }] }
  writeFileSync(join(project, '.tent', 'tests.json'), JSON.stringify(record))
  const all = tested(project, '--all')
  assert.equal(all.ended, 0, all.printed)
  assert.deepEqual(ordersIn(all.printed), [`passed ${added}`, `passed ${listed}`, `passed ${noted}`])
  assert.deepEqual(Object.keys(recordOf(project).tests), Object.values(filesOf).sort())
  assert.ok(keptOf(project, added).touched.functions?.includes('addOrder'))
})

test('[53-7] a note made on a query thread, by a worker in the program, and after a test ended, each lands under the test it belongs to', (t) => {
  const project = recordedCopy(t, 'recorded-7', 'recordedNotes')
  const ran = tested(project)
  assert.equal(ran.ended, 0, ran.printed)
  const of = 'tests/notes.test.ts'
  // The read of the heavy query was made on its thread, which kept a record of its own.
  assert.ok(keptOf(project, 'a heavy query reads on its thread', of).touched.read?.includes('notes'))
  const worked = keptOf(project, 'a worker of the program does the work', of).touched
  for (const fn of ['noteOnGpu', 'addNote']) assert.ok(worked.functions?.includes(fn), JSON.stringify(worked))
  assert.ok(worked.wrote?.includes('notes'))
  // The call that the test before set off lands while the next test runs, and stands under the test that set it off.
  assert.ok(keptOf(project, 'work goes on after the test ended', of).touched.functions?.includes('addNote'))
  assert.deepEqual(keptOf(project, 'the next test only waits', of).touched, {})
})

test('[53-8] tent check warns, with its code, of a function and a table no test touched, and not of one a test touched; tent impact names a changed table a test read as tested', async (t) => {
  const project = recordedCopy(t, 'recorded-8')
  assert.equal((await typed(project, 'history', 'save', 'first', '--json')).ended, 0)
  assert.equal(tested(project).ended, 0)
  const checked = await typed(project, 'check', '--json')
  const untested = (checked.answer.findings ?? []).filter((one) => one.code === 'T9004')
  const named = untested.map((one) => one.where?.definition).sort()
  assert.ok(named.includes('forgotten'), JSON.stringify(named))
  assert.ok(named.includes('archive'))
  for (const touched of ['addOrder', 'openOrders', 'addNote', 'charge', 'orders', 'notes'])
    assert.ok(!named.includes(touched), touched)
  for (const one of untested) {
    assert.equal(one.level, 'warning')
    assert.match(String(one.fix), /tent test/)
  }
  // A column more of a table that a test read: the impact names its tests, and holds it as tested.
  const orders = join(project, 'tables', 'orders.ts')
  writeFileSync(
    orders,
    readFileSync(orders, 'utf8').replace('paid: boolean', 'note: text({ optional: true }), paid: boolean'),
  )
  const asked = await typed(project, 'impact', 'first', '--json')
  assert.equal(asked.ended, 0, asked.printed)
  const value = Object(asked.answer.value)
  const tests = value.tests.find((one: { name: string }) => one.name === 'orders.note')
  assert.ok(tests, JSON.stringify(value.tests))
  assert.ok(tests.tests.includes(`${filesOf[added]}: ${added}`))
  assert.ok(!value.untested.includes('orders.note'))
})
