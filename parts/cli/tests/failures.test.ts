import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Type } from '../../core/index.ts'
import { json, list, number, object, text } from '../../core/index.ts'
import { checkValue } from '../../core/internal.ts'
import { recordedCopy, tested } from './recordedProject.ts'

/** The facts of one call of a test, as `failures` of `tent test --json` holds them. */
interface Called {
  name: string
  caller: { kind: string; user?: { id: string; roles: string[] } }
  input: Record<string, unknown>
  answer?: unknown
  error?: { code: string; message: string; fix?: string; where?: { file: string; line: number; definition?: string } }
  trace?: string
  read: { table: string; rows: Record<string, unknown>[] }[]
  wrote: {
    table: string
    id: string
    kind: string
    before?: Record<string, unknown>
    after?: Record<string, unknown>
  }[]
}

/** One failure of a test, as `failures` of `tent test --json` holds it. */
interface Failure {
  test: string
  file: string
  line: number
  expected?: unknown
  got?: unknown
  call?: Called
  fix?: string
}

// The shape of the value of `tent test --json`, with the tests replayed and the facts of each failure.
const shape: Type = object({
  passed: number(),
  failed: number(),
  replayed: number(),
  notRun: list(object({ test: text(), why: text() }), { optional: true }),
  files: list(text()),
  failures: list(
    object({
      test: text(),
      file: text(),
      line: number(),
      expected: json({ optional: true }),
      got: json({ optional: true }),
      call: object(
        {
          name: text(),
          caller: json(),
          input: json(),
          answer: json({ optional: true }),
          error: json({ optional: true }),
          trace: text({ optional: true }),
          read: list(json()),
          wrote: list(json()),
        },
        { optional: true },
      ),
      fix: text({ optional: true }),
      randomSeed: text({ optional: true }),
    }),
  ),
})

const failing = 'tests/failing.test.ts'

/** The failures of a run, and the findings that tell each, by the name of the test. */
function failuresOf(value: unknown): Failure[] {
  const failures: unknown = Reflect.get(Object(value), 'failures')
  assert.ok(Array.isArray(failures), 'the value holds its failures')
  return failures
}

test('[53-9] a failing test that called a change prints its caller, input, the rows it changed before and after, its trace and the fix of the code that refused it; --json holds the same facts in failures', (t) => {
  const project = recordedCopy(t, 'failures-1', 'recordedFailing')
  const ran = tested(project, failing, '--json')
  assert.equal(ran.ended, 1, ran.printed)
  const failures = failuresOf(ran.answer.value)
  // A test that failed on what it held, after a change that wrote.
  const open = failures.find((one) => one.test === 'the order stays open')
  assert.ok(open, JSON.stringify(failures))
  assert.deepEqual([open.file, open.line, open.expected, open.got], [failing, 15, false, true])
  assert.equal(open.call?.name, 'markPaid')
  assert.equal(open.call?.caller.kind, 'user')
  assert.deepEqual(open.call?.caller.user?.roles, ['staff'])
  assert.equal(typeof open.call?.input.order, 'string')
  const [wrote] = open.call?.wrote ?? []
  assert.deepEqual(
    [wrote?.table, wrote?.id, wrote?.kind, wrote?.before?.paid, wrote?.after?.paid],
    ['orders', open.call?.input.order, 'changed', false, true],
  )
  assert.match(String(open.call?.trace), /^[0-9a-z]{8,}$/)
  // A test whose change was refused: the code, and the fix of that code.
  const refused = failures.find((one) => one.test === 'a customer marks the order paid')
  assert.ok(refused)
  assert.deepEqual([refused.file, refused.line, refused.call?.name], [failing, 23, 'markPaid'])
  assert.equal(refused.call?.error?.code, 'T3101')
  assert.ok(refused.fix && refused.fix === refused.call?.error?.fix, JSON.stringify(refused))
  assert.deepEqual(refused.call?.wrote, [])
  // The finding of each failure tells the same in words: what came, the call with its caller, its input and its
  // rows before and after, the trace to follow; and its fix is the fix of the code that refused the call.
  const findingOf = (name: string) => (ran.answer.findings ?? []).find((one) => one.message.includes(`"${name}"`))
  const words = String(findingOf('the order stays open')?.message)
  for (const piece of [
    `${failing}:15`,
    'markPaid',
    String(open.call?.caller.user?.id),
    String(open.call?.input.order),
    '"paid":false',
    '"paid":true',
    `tent logs --trace ${open.call?.trace}`,
  ])
    assert.ok(words.includes(piece), `${piece} in ${words}`)
  // A test whose last call read rows: each row it read stands in the words, as the facts hold it.
  const listed = failures.find((one) => one.test === 'no order is open')
  const read = (listed?.call?.read ?? []).flatMap((one) => one.rows)
  assert.ok(read.length > 0, JSON.stringify(listed))
  const listedWords = String(findingOf('no order is open')?.message)
  for (const row of read)
    assert.ok(listedWords.includes(JSON.stringify(row).slice(0, 200)), `${JSON.stringify(row)} in ${listedWords}`)
  assert.equal(findingOf('a customer marks the order paid')?.fix, refused.fix)
  assert.equal(findingOf('a customer marks the order paid')?.where?.line, 23)
  // As text, the same.
  const typed = tested(project, failing, '--all')
  assert.equal(typed.ended, 1)
  assert.ok(typed.printed.includes(`tent logs --trace`), typed.printed)
})

test('[53-10] a failure of the app own code names the definition and its source line', (t) => {
  const project = recordedCopy(t, 'failures-2', 'recordedFailing')
  const ran = tested(project, failing, '--json')
  assert.equal(ran.ended, 1, ran.printed)
  const broken = failuresOf(ran.answer.value).find((one) => one.test === 'the code of the app fails')
  assert.ok(broken)
  assert.equal(broken.call?.error?.code, 'T0009')
  assert.deepEqual(broken.call?.error?.where, { file: 'functions/paid.ts', line: 17, definition: 'broken' })
  const words = String(
    (ran.answer.findings ?? []).find((one) => one.message.includes('"the code of the app fails"'))?.message,
  )
  assert.ok(words.includes('broken at functions/paid.ts:17'), words)
})

test('[15-6@12] the value of tent test --json holds the tests replayed and the facts of each failure, in its shape, as one that passed holds none', (t) => {
  const project = recordedCopy(t, 'failures-3', 'recordedFailing')
  const failed = tested(project, failing, '--json')
  assert.deepEqual(checkValue(shape, failed.answer.value), [])
  assert.equal(failuresOf(failed.answer.value).length, 4)
  const passed = tested(project, 'tests/listed.test.ts', '--json')
  assert.equal(passed.ended, 0, passed.printed)
  assert.deepEqual(checkValue(shape, passed.answer.value), [])
  assert.deepEqual(failuresOf(passed.answer.value), [])
})
