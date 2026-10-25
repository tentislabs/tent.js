import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { findPage } from '../../docs/index.ts'
import { command as testCommand } from '../commands/test.ts'
import { testFiles } from '../testsRan.ts'
import { copied, shell, typedApart } from './typed.ts'

/** The value that `tent test --json` printed, as a record. */
const valueOf = (answer: { value?: unknown }): Record<string, unknown> => Object(answer.value)

test('[48-7] --plan writes a test for a screen with a form, which runs and passes', async (t) => {
  const project = copied(t, 'plan', 'planned')
  const planned = typedApart(project, 'test', '--plan', 'ordersScreen', '--json')
  assert.equal(planned.ended, 0, planned.printed)
  const file = join(project, 'tests', 'ordersScreen.test.ts')
  assert.equal(valueOf(planned.answer).file, 'tests/ordersScreen.test.ts', planned.printed)
  const written = readFileSync(file, 'utf8')
  // It opens the screen as a test user and fills each field of the input of each function it calls with a value
  // of its type; the words of a press are the view's, which the description does not hold.
  assert.match(written, /app\.open\('\/orders', \{ as: user \}\)/)
  assert.match(written, /page\.type\('title', /)
  assert.match(written, /page\.type\('count', '1'\)/)
  assert.match(written, /page\.pick\('urgent', true\)/)
  assert.match(written, /What calls addOrder/)
  assert.match(written, /What calls addSample/)
  // A test file of that name is there now: a second plan does not write over it.
  assert.notEqual(typedApart(project, 'test', '--plan', 'ordersScreen', '--json').ended, 0)
  // The test it wrote runs and passes, with the tests that were there.
  const tested = typedApart(project, 'test', '--json')
  assert.equal(tested.ended, 0, tested.printed)
  assert.equal(valueOf(tested.answer).failed, 0, tested.printed)
  assert.equal(valueOf(tested.answer).passed, 4, tested.printed)
})

test('[48-7] --plan picks the first value of a choice of the input, read where the description keeps a choice values', (t) => {
  const project = copied(t, 'plan-choice', 'planned')
  const functions = join(project, 'functions.ts')
  writeFileSync(
    functions,
    readFileSync(functions, 'utf8')
      .replace('import { boolean, change, input,', 'import { boolean, change, choice, input,')
      .replace(
        'input: { title: text(), count: number(), urgent: boolean() },',
        "input: { title: text(), count: number(), urgent: boolean(), size: choice(['small', 'large']) },",
      ),
  )
  const planned = typedApart(project, 'test', '--plan', 'ordersScreen', '--json')
  assert.equal(planned.ended, 0, planned.printed)
  assert.match(readFileSync(join(project, 'tests', 'ordersScreen.test.ts'), 'utf8'), /page\.pick\('size', 'small'\)/)
})

test('[48-7] --shard runs a share of the files split by their names, and --join gives the same report as one run', async (t) => {
  const project = copied(t, 'shard', 'planned')
  const whole = typedApart(project, 'test', '--json')
  assert.equal(whole.ended, 0, whole.printed)
  // Each run keeps its report, which a machine hands on.
  const kept = join(project, 'results', 'tests', 'report.json')
  assert.ok(existsSync(kept))
  const folders = [join(project, '..', 'first'), join(project, '..', 'second')]
  const shares: string[][] = []
  for (const [n, folder] of folders.entries()) {
    const one = typedApart(project, 'test', '--shard', `${n + 1}/2`, '--json')
    assert.equal(one.ended, 0, one.printed)
    const files = valueOf(one.answer).files
    shares.push(Array.isArray(files) ? files.map(String) : [])
    mkdirSync(folder, { recursive: true })
    renameSync(kept, join(folder, 'report.json'))
  }
  // The two shares are the files split by their names, and together all of them.
  assert.deepEqual(shares, [['tests/count.test.ts'], ['tests/orders.test.ts']])
  const joined = typedApart(project, 'test', ...folders.flatMap((folder) => ['--join', folder]), '--json')
  assert.equal(joined.ended, 0, joined.printed)
  assert.deepEqual(valueOf(joined.answer), valueOf(whole.answer))
  assert.deepEqual(joined.answer.findings, whole.answer.findings)
  // A share of no form is refused.
  assert.notEqual(typedApart(project, 'test', '--shard', '3/2', '--json').ended, 0)
})

test('[15-6] tent test <file> runs that file, tent test <name> the tests of that name, and a word that names neither is a usage error that names the usage', async (t) => {
  const project = copied(t, 'one-file', 'planned')
  const file = typedApart(project, 'test', 'tests/orders.test.ts', '--json')
  assert.equal(file.ended, 0, file.printed)
  assert.deepEqual([valueOf(file.answer).files, valueOf(file.answer).passed], [['tests/orders.test.ts'], 2])
  const named = typedApart(project, 'test', 'an order is added', '--json')
  assert.equal(named.ended, 0, named.printed)
  assert.equal(valueOf(named.answer).passed, 1, named.printed)
  // A word that names no file and no test is not found; a second word, which the command does not take, is T0038.
  for (const [words, ended] of [
    [['probe'], 1],
    [['tests/none.test.ts'], 1],
    [['tests/orders.test.ts', 'tests/count.test.ts'], 2],
  ] as const) {
    const refused = typedApart(project, 'test', ...words, '--json')
    assert.equal(refused.ended, ended, refused.printed)
    assert.equal(refused.answer.findings?.[0]?.code, ended === 2 ? 'T0038' : 'T0001', refused.printed)
    assert.match(String(refused.answer.findings?.[0]?.message), /tent test \[<file or name>\]/, refused.printed)
  }
  // No word is taken for --from-runs: no file of evals is written.
  assert.deepEqual(testFiles(project, true), [])
})

test('[15-6] a word that tent test does not take is refused with the usage line of its page, command.test, of which the command keeps no copy', async () => {
  const page = findPage('command.test')?.text ?? ''
  const usage = /## Usage\n+```\n(.+)\n```/.exec(page)?.[1] ?? ''
  assert.match(usage, /^tent test \[<file or name>\]/)
  if ('raw' in testCommand) throw new Error('tent test is no command that prints by itself')
  const refused = await testCommand.run({ folder: import.meta.dirname, args: { only: 'orders', watch: true } })
  assert.equal(
    refused.findings?.[0]?.message.endsWith(`It is typed: ${usage}`),
    true,
    String(refused.findings?.[0]?.message),
  )
  const code = readFileSync(new URL('../commands/test.ts', import.meta.url), 'utf8')
  assert.equal(code.includes('[--looks update]'), false)
})

test('[48-7] --looks update keeps the new pictures and the new things heard that the tests wrote', async (t) => {
  const project = copied(t, 'looks', 'planned')
  const looks = join(project, 'tests', 'looks', 'chromium')
  const heard = join(project, 'tests', 'heard', 'chromium')
  mkdirSync(looks, { recursive: true })
  mkdirSync(heard, { recursive: true })
  writeFileSync(join(looks, 'orders.new.png'), 'a picture')
  writeFileSync(join(looks, 'kept.png'), 'kept')
  writeFileSync(join(heard, 'orders.new.txt'), '- main\n')
  const updated = typedApart(project, 'test', '--looks', 'update', '--json')
  assert.equal(updated.ended, 0, updated.printed)
  assert.deepEqual(valueOf(updated.answer).kept, ['tests/heard/chromium/orders.txt', 'tests/looks/chromium/orders.png'])
  assert.equal(readFileSync(join(looks, 'orders.png'), 'utf8'), 'a picture')
  assert.equal(existsSync(join(looks, 'orders.new.png')), false)
  assert.equal(readFileSync(join(looks, 'kept.png'), 'utf8'), 'kept')
})

test('[48-7] --watch runs first the tests that touched a changed definition, then the rest', async (t) => {
  const project = copied(t, 'watch', 'planned')
  // The runner carries out no file for a program that it finds this in, as it would in a test that a test started.
  const { NODE_TEST_CONTEXT: _, ...env } = process.env
  const watching = spawn(process.execPath, [shell, 'test', '--watch'], {
    cwd: project,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  t.after(() => {
    if (watching.exitCode === null) watching.kill()
  })
  const lines: string[] = []
  const heard: (() => void)[] = []
  let left = ''
  for (const stream of [watching.stdout, watching.stderr])
    stream.on('data', (piece: Buffer) => {
      const text = left + piece.toString()
      const all = text.split(/\r?\n/)
      left = all.pop() ?? ''
      lines.push(...all)
      for (const one of heard.splice(0)) one()
    })
  /** Waits until the watch has ended so many rounds, for what it prints and for no length of time. */
  const rounds = async (count: number): Promise<void> => {
    while (lines.filter((line) => line.startsWith('ran ')).length < count) {
      if (watching.exitCode !== null) assert.fail(`the watch ended: ${lines.join('\n')}`)
      await new Promise<void>((done) => heard.push(done))
    }
  }
  await rounds(1)
  const first = lines.length
  // A change of the definition that one test touched, saved as an editor saves it.
  const functions = join(project, 'functions.ts')
  writeFileSync(
    functions,
    readFileSync(functions, 'utf8').replace(
      'rows: orders.count() })',
      'rows: orders.where({ urgent: false }).count() })',
    ),
  )
  await rounds(2)
  const round = lines.slice(first)
  const ended = round.filter((line) => line.startsWith('passed ') || line.startsWith('failed '))
  assert.equal(
    round.find((line) => line.startsWith('first,')),
    'first, the tests that touched countOrders:',
    round.join('\n'),
  )
  assert.deepEqual(ended, [
    'passed tests/count.test.ts: the orders are counted',
    'passed tests/orders.test.ts: an order is added',
    'passed tests/orders.test.ts: a sample is added',
  ])
  watching.kill()
})
