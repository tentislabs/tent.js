import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { afterEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { concat, join, TentError } from '../index.ts'
import { setRuntime, valueOf } from '../internal.ts'
import { testRuntime } from './bodies-world.ts'

afterEach(() => setRuntime(null))

const program = fileURLToPath(new URL('./sized/written.ts', import.meta.url))

/** The code of what a piece of work throws, where it is a `TentError`, and what it answered where it throws nothing. */
function codeOr(work: () => unknown): unknown {
  try {
    return work()
  } catch (error) {
    return error instanceof TentError ? error.code : String(error)
  }
}

test('[12-2a] a value that is small in memory and very long once written is held to valueSize before it is written, wherever a body makes a text of a value: a program that writes one in six ways ends each with T0027 at once', async (t) => {
  // The program is bounded in memory, and in time from the moment it is loaded: one second for all six ways.
  const child = spawn(process.execPath, ['--max-old-space-size=512', program], { stdio: ['ignore', 'pipe', 'pipe'] })
  let said = ''
  let late: NodeJS.Timeout | undefined
  let killed = false
  child.stdout.setEncoding('utf8').on('data', (piece: string) => {
    said += piece
    late ??= setTimeout(() => {
      killed = true
      child.kill()
    }, 1000)
  })
  t.after(() => {
    clearTimeout(late)
    child.kill()
  })
  await new Promise<void>((done) => child.once('exit', () => done()))
  clearTimeout(late)
  assert.equal(killed, false, 'the program had not ended a second after it was loaded: a value was written out whole')
  const ended: Record<string, { code?: string; ms: number }> = JSON.parse(said.split('\n')[1] ?? '{}')
  assert.deepEqual(
    Object.entries(ended).map(([way, how]) => [way, how.code]),
    [
      ['a text with a value', 'T0027'],
      ['the sign + with a text', 'T0027'],
      ['the sign + of two lists', 'T0027'],
      ['join', 'T0027'],
      ['concat', 'T0027'],
      ['a place that is worked out', 'T0027'],
    ],
  )
})

test('[12-2a] a list that is written into a text counts as JavaScript writes it: its entries with a comma between, a list inside it the same, and nothing for an entry that is nothing', () => {
  const list = [1, [22, null, 'abc'], undefined, true]
  const written = '1,22,,abc,,true'
  assert.equal(String(list), written)
  // The limit is the one of the app whose call is under way: at the length of the text it passes, one under it not.
  for (const [limit, passes] of [
    [written.length, true],
    [written.length - 1, false],
  ] as const) {
    setRuntime(testRuntime(() => undefined, true, limit))
    const names = { list }
    const expected = passes ? written : 'T0027'
    assert.equal(
      codeOr(() => valueOf({ text: [{ name: ['list'] }] }, { names })),
      expected,
    )
    assert.equal(
      codeOr(() => valueOf({ left: '', op: '+', right: { name: ['list'] } }, { names })),
      expected,
    )
    assert.equal(
      codeOr(() => Reflect.apply(concat, undefined, [list])),
      expected,
    )
    assert.equal(
      codeOr(() => Reflect.apply(join, undefined, [[list], '-'])),
      expected,
    )
  }
  // Two lists that are added are written and joined, as JavaScript does it.
  setRuntime(testRuntime(() => undefined, true, 6))
  assert.equal(
    codeOr(() => valueOf({ left: { name: ['a'] }, op: '+', right: { name: ['a'] } }, { names: { a: [1, 2] } })),
    '1,21,2',
  )
  assert.equal(
    codeOr(() => valueOf({ left: { name: ['a'] }, op: '+', right: { name: ['a'] } }, { names: { a: [1, 23] } })),
    'T0027',
  )
  // A place that is worked out to a list is read by the text of that list.
  const names = { record: { '1,2': 'found' }, key: [1, 2], long: [1, 2, 3, 4] }
  assert.equal(
    codeOr(() => valueOf({ name: ['record', { name: ['key'] }] }, { names })),
    'found',
  )
  assert.equal(
    codeOr(() => valueOf({ name: ['record', { name: ['long'] }] }, { names })),
    'T0027',
  )
})
