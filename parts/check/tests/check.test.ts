import assert from 'node:assert/strict'
import { ChildProcess } from 'node:child_process'
import { subscribe, unsubscribe } from 'node:diagnostics_channel'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative } from 'node:path'
import { test } from 'node:test'
import { measure } from '../../../rig/budgets.ts'
import { checkProject } from '../index.ts'
import { checkRules } from '../ours.ts'
import { list } from '../rules/list.ts'
import { checkTypes, keepTypes } from '../types.ts'
import { copyOf, lineWith, lying } from './copies.ts'

// The codes of the build and of the first rules of the check: those of the build and of the rules of the
// check, and those that the description raises, whose projects a build first makes possible.
const codes = [
  ...['T1001', 'T1002', 'T1003', 'T1004', 'T1005', 'T1006', 'T1007', 'T1008', 'T1009', 'T1010', 'T1011'],
  ...['T1012', 'T1013', 'T1014', 'T4001', 'T4002', 'T4003', 'T4004', 'T4005', 'T8000', 'T8001', 'T8002', 'T9002'],
]

test('[15-1] every rule has a passing project and a failing project, and the failing one gives exactly its code', async () => {
  // These codes are held among whatever else the check holds: a folder, a rule and a finding of a code that is none
  // of them is held by the tests of its own code.
  const folders = readdirSync(lying('.')).filter((name) => /^T\d{4}$/.test(name))
  for (const code of codes) assert.ok(folders.includes(code), `${code} has its folder of projects`)
  // Every rule of the check among these codes is a file of the list.
  const rules = list.map((one) => one.name)
  for (const code of ['T1014', 'T4001', 'T4002', 'T4003', 'T4004', 'T4005', 'T8001', 'T8002', 'T9002'])
    assert.ok(rules.includes(code), `the rule ${code} is in the list`)
  for (const code of codes) {
    for (const side of ['pass', 'fail']) assert.ok(existsSync(join(lying(code), side, 'functions')), `${code}/${side}`)
    // T8000 is what the type checker finds, which is started for it. Every other code is found by our own rules,
    // where the type checker would report the same mistake a second time under its own code.
    const check = code === 'T8000' ? checkProject : checkRules
    const ours = async (project: string) =>
      (await check(copyOf(join(code, project), `${code}-${project}`))).findings.filter((one) =>
        codes.includes(one.code),
      )
    assert.deepEqual(await ours('pass'), [], `the passing project of ${code}`)
    const failing = await ours('fail')
    assert.ok(failing.length > 0, `the failing project of ${code} is found`)
    assert.deepEqual([...new Set(failing.map((one) => one.code))], [code], `the failing project of ${code}`)
    for (const one of failing) {
      assert.ok(one.fix, `a finding of ${code} says the fix`)
      assert.equal(one.docs, `tent docs ${code}`)
    }
  }
})

test('[15-1] a folder that is named by a path from where the program was started is found with what its whole path is found with', async () => {
  const whole = copyOf(join('T8000', 'fail'), 'T8000-from-here')
  const fromHere = relative(process.cwd(), whole)
  assert.ok(!isAbsolute(fromHere), fromHere)
  const places = (findings: { code: string; where?: { file: string; line: number } }[]) =>
    findings.map((one) => `${one.code} ${one.where?.file}:${one.where?.line}`)
  const expected = places((await checkProject(whole)).findings)
  assert.deepEqual(expected, ['T8000 functions/notes.ts:5'])
  assert.deepEqual(places((await checkProject(fromHere)).findings), expected)
})

test('[15-2] a project with twenty different mistakes reports all twenty in one run', async () => {
  const made = await checkProject(copyOf('twenty', 'twenty'))
  // What another rule finds in the project is held by the tests of its code: these codes are held among it.
  const ours = made.findings.filter((one) => codes.includes(one.code))
  const found = new Set(ours.map((one) => one.code))
  // Twenty-two codes, each for a mistake of its own: every code of the list but the one for a project that is not there.
  const expected = codes.filter((code) => code !== 'T1012')
  assert.equal(expected.length, 22)
  for (const code of expected) assert.ok(found.has(code), `${code} is reported, among ${[...found].sort().join(' ')}`)
  assert.deepEqual([...found].sort(), expected)
  // Every finding has its level, its place, its sentence, its fix and its page.
  for (const one of ours) {
    assert.match(one.where?.file ?? '', /\.ts$/, one.code)
    assert.ok((one.where?.line ?? 0) > 0, one.code)
    assert.ok(one.message.length > 10 && one.fix && one.docs === `tent docs ${one.code}`, one.code)
    assert.equal(one.level, one.code === 'T8001' || one.code === 'T8002' ? 'warning' : 'error', one.code)
  }
})

test('[10-3] each example of the document of the words is reported as plain, and two that are made code are reported as code with what made them so', async () => {
  const plain = await checkProject(copyOf('words', 'words'))
  assert.deepEqual(plain.findings, [])
  const names = ['shop', 'orders', 'users', 'customers', 'openOrders', 'markPaid', 'reopen', 'refund', 'bigOrder']
  assert.deepEqual(Object.keys(plain.forms).sort(), [...names, 'stripe', 'slack', 'writer'].sort())
  for (const [name, form] of Object.entries(plain.forms)) assert.equal(form, 'plain', name)
  assert.deepEqual(plain.why, {})

  // The same refund with one call of a function of the file's own, and a table with a rule whose arrow holds a `let`.
  const folder = copyOf('forms', 'forms')
  const code = await checkProject(folder)
  assert.deepEqual(code.findings, [])
  const line = (file: string, piece: string) => lineWith(readFileSync(join(folder, file), 'utf8'), piece)
  assert.equal(code.forms.refund, 'code')
  assert.equal(
    code.why.refund,
    `run: a call of \`noted\`, a function of the file's own, on line ${line('functions/refund.ts', 'noted(input.reason)')}`,
  )
  assert.equal(code.forms.customers, 'code')
  assert.equal(code.why.customers, `access.read: \`let\`, on line ${line('tables/shop.ts', 'let name')}`)
  assert.deepEqual(Object.keys(code.why).sort(), ['customers', 'refund'])
  for (const name of names.filter((one) => one !== 'refund' && one !== 'customers'))
    assert.equal(code.forms[name], 'plain', name)
})

test('[10-5] an async run on a query or a change is refused by the type checker and by the check', async () => {
  const folder = copyOf('async', 'async')
  const made = await checkProject(folder)
  const text = readFileSync(join(folder, 'functions', 'notes.ts'), 'utf8')
  const lines = [lineWith(text, 'run: async ({ db })'), lineWith(text, 'run: async ({ input, db })')]
  for (const code of ['T4005', 'T8000']) {
    const found = made.findings.filter((one) => one.code === code)
    assert.deepEqual(
      found.map((one) => one.where?.line),
      lines,
      code,
    )
    for (const one of found) assert.equal(one.level, 'error')
  }
  assert.match(made.findings.find((one) => one.code === 'T8000')?.message ?? '', /^TS\d+: .*Promise/)
  assert.match(made.findings.find((one) => one.code === 'T4005')?.fix ?? '', /Take `async` away/)
  assert.equal(made.findings.length, 4)
})

test('[12-3b] the check reports a word that asks the engine at the top of a file, two moments and two lists compared by JavaScript', async () => {
  const folder = copyOf('signs', 'signs')
  const made = await checkRules(folder)
  const text = readFileSync(join(folder, 'functions', 'signs.ts'), 'utf8')
  const of = (code: string) =>
    made.findings.filter((one) => one.code === code).map((one) => `${one.where?.definition ?? ''}:${one.where?.line}`)
  // A reference word and a setting, each read at the top of the file.
  assert.deepEqual(of('T1014'), [`:${lineWith(text, "input('first')")}`, `:${lineWith(text, 'settings.shopName')}`])
  // `-` between two inputs, `===` between a column of a row and an input, a moment in a text, and `calc` in a form written with values.
  assert.deepEqual(
    of('T8001'),
    ['apart', 'same', 'told', 'byCalc'].map((name) => `${name}:${lineWith(text, `query('${name}'`)}`),
  )
  const moments = made.findings.filter((one) => one.code === 'T8001')
  assert.match(moments[0].fix ?? '', /between/)
  assert.match(moments[2].fix ?? '', /concat/)
  // Rows that `db` handed against a field of an input, and two lists written in place.
  const lists = `lists:${lineWith(text, "query('lists'")}`
  assert.deepEqual(of('T8002'), [lists, lists])
  assert.match(made.findings.find((one) => one.code === 'T8002')?.fix ?? '', /a field of each, as their ids/)
  for (const one of made.findings) assert.equal(one.level, one.code === 'T1014' ? 'error' : 'warning')
  assert.equal(made.findings.length, 8, 'and nothing is found of what compares rightly')

  // The fail projects of the three codes hold the cases of the document.
  const top = await checkRules(copyOf(join('T1014', 'fail'), 'top'))
  assert.match(top.findings[0].message, /`now\(\)`, a word that asks the engine, stands at the top/)
})

test('[15-3] our rules finish within the budget on a project of a hundred definitions, and the warm type check within its own', async () => {
  const folder = copyOf('hundred', 'hundred')
  const first = await checkRules(folder)
  assert.deepEqual(first.findings, [])
  const count = ['tables', 'functions', 'flows'].reduce(
    (sum, group) => sum + Object.keys(Object(first.description)[group]).length,
    0,
  )
  assert.equal(count, 100)
  await measure('check.rules', async () => {
    const made = await checkRules(folder)
    assert.deepEqual(made.findings, [])
  })

  // The type checker is kept running, as development keeps it, and a pass is measured from a save to its end.
  const kept = keepTypes(folder, first.source)
  try {
    assert.deepEqual(await kept.next(), [])
    const file = join(folder, 'part0.ts')
    const text = readFileSync(file, 'utf8')
    let saves = 0
    await measure(
      'check.types',
      async () => {
        writeFileSync(file, `${text}\n// saved ${++saves}\n`)
        assert.deepEqual(await kept.next(), [])
      },
      { warm: true },
    )
    // A mistake that is saved is reported by the pass that read the saved file, and a mended file by the pass that
    // read it mended: one save after another, each answered by a pass that began after it.
    for (let round = 0; round < 6; round++) {
      const wrong = round % 2 === 0
      writeFileSync(file, wrong ? `${text}\nconst wrong${round}: number = 'text'\n` : `${text}\n// mended ${round}\n`)
      assert.deepEqual(
        (await kept.next()).map((one) => [one.code, one.where?.file]),
        wrong ? [['T8000', 'part0.ts']] : [],
        `save ${round + 1}`,
      )
    }
  } finally {
    kept.stop()
  }
})

test('[15-3] where the type checker ends by itself, what waits for its next pass is refused, and waits no longer', async () => {
  const folder = copyOf('hundred', 'hundred-ended')
  const { source } = await checkRules(folder)
  // The runtime tells of each program that is started: so the test holds the type checker, to end it from outside.
  const started: ChildProcess[] = []
  const see = (told: unknown) => {
    const program: unknown = Object(told).process
    if (program instanceof ChildProcess) started.push(program)
  }
  subscribe('child_process', see)
  const kept = keepTypes(folder, source)
  unsubscribe('child_process', see)
  let late: ReturnType<typeof setTimeout> | undefined
  try {
    assert.equal(started.length, 1, 'the type checker is the one program that was started')
    assert.deepEqual(await kept.next(), [])
    const waits = kept.next()
    const tooLate = new Promise<never>((_, failed) => {
      late = setTimeout(() => failed(new Error('it still waits, ten seconds after the type checker ended')), 10_000)
    })
    started[0].kill()
    await assert.rejects(Promise.race([waits, tooLate]), /the type checker ended by itself/)
    // And what asks after the end is refused at once.
    await assert.rejects(Promise.race([kept.next(), tooLate]), /the type checker ended by itself/)
  } finally {
    clearTimeout(late)
    kept.stop()
  }
})

test('[15-3] a file added while the type checker is kept running, which nothing imports, is read by the pass after it is saved, and the fix is worked out from the file as it is saved', async () => {
  const folder = copyOf('T8001/pass', 'T8001-pass-added')
  const { source } = await checkRules(folder)
  const kept = keepTypes(folder, source)
  let late: ReturnType<typeof setTimeout> | undefined
  // A pass that never comes fails the test, and does not hold it.
  const next = () =>
    Promise.race([
      kept.next(),
      new Promise<never>((_, failed) => {
        late = setTimeout(() => failed(new Error('no pass came within thirty seconds of the save')), 30_000)
      }),
    ]).finally(() => clearTimeout(late))
  try {
    assert.deepEqual(await next(), [])
    writeFileSync(join(folder, 'functions', 'added.ts'), "export const wrong: number = 'text'\n")
    assert.deepEqual(
      (await next()).map((one) => [one.code, one.where?.file, one.where?.line]),
      [['T8000', 'functions/added.ts', 1]],
    )
    writeFileSync(
      join(folder, 'functions', 'added.ts'),
      "const order = { placedBy: 'a user' }\nexport const name: string = order.placedBy.name\n",
    )
    const [one] = await next()
    assert.deepEqual([one?.code, one?.where?.line], ['T8000', 2])
    assert.match(String(one?.fix), /with\('placedBy'\)/)
  } finally {
    clearTimeout(late)
    kept.stop()
  }
})

test('[15-1] an error of the type checker that names no place, a file it is handed that is not found, is T8000 too, run once and kept running', async () => {
  const folder = copyOf('T8001/pass', 'T8001-pass-gone')
  const { source } = await checkRules(folder)
  const gone = { ...source, 'gone.ts': { file: join(folder, 'gone.ts'), text: '' } }
  const named = (found: { code: string; message: string }[]) =>
    found.some((one) => one.code === 'T8000' && /^TS\d+: .*gone\.ts/.test(one.message))
  assert.ok(named(await checkTypes(folder, gone)), 'the type checker run once names the file that is not found')
  const kept = keepTypes(folder, gone)
  try {
    assert.ok(named(await kept.next()), 'the type checker kept running names it too')
  } finally {
    kept.stop()
  }
})
