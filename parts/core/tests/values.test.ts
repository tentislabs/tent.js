import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import {
  avg,
  between,
  calc,
  ceil,
  contains,
  date,
  day,
  dayOf,
  each,
  earlier,
  fingerprint,
  floor,
  input,
  join,
  later,
  least,
  lower,
  max,
  min,
  most,
  now,
  chunks,
  random,
  range,
  round,
  sameSecret,
  settings,
  slice,
  startsWith,
  sum,
  TentError,
  token,
  trim,
  upper,
  vector,
  where,
  concat,
} from '../index.ts'
import { checkValue, describing, setRuntime, valueOf } from '../internal.ts'
import { NOW, testRuntime } from './bodies-world.ts'

afterEach(() => setRuntime(null))

const noon = new Date('2026-10-08T12:00:00.000Z')

/** The inputs that are kept with the test: a word, the values it is handed, and the value it answers on every system. */
const stored: [name: string, word: (...values: never[]) => unknown, values: unknown[], answer: unknown][] = [
  ['concat', concat, ['a', 1, null, noon, undefined, 1.5], 'a12026-10-08T12:00:00.000Z1.5'],
  ['calc', calc, ['+', 2, 3], 5],
  ['calc', calc, ['%', 7, 3], 1],
  ['calc', calc, ['/', 1, 4], 0.25],
  ['calc', calc, ['<=', 2, 2], true],
  ['calc', calc, ['==', '2', 2], true],
  ['calc', calc, ['!=', null, undefined], false],
  ['round', round, [2.345, 2], 2.35],
  ['round', round, [2.5], 3],
  ['round', round, [-2.5], -2],
  ['floor', floor, [-1.5], -2],
  ['ceil', ceil, [1.2], 2],
  ['least', least, [3, 1, 2], 1],
  // `least` and `most` pass over a value that is nothing.
  ['least', least, [3, null, 1], 1],
  ['most', most, [undefined, 2, 5], 5],
  ['least', least, [null, undefined], undefined],
  ['most', most, ['2026-01-02', '2026-03-01', '2025-12-31'], '2026-03-01'],
  ['lower', lower, ['ABC def'], 'abc def'],
  ['upper', upper, ['abc def'], 'ABC DEF'],
  ['trim', trim, ['  a b \n'], 'a b'],
  ['startsWith', startsWith, ['Hello', 'HE'], true],
  ['startsWith', startsWith, ['Éa', 'é'], false],
  ['contains', contains, ['Hello', 'ELL'], true],
  ['contains', contains, [[1, 2, 3], 2], true],
  ['contains', contains, [['a'], 'A'], false],
  ['slice', slice, ['hello', -3], 'llo'],
  ['slice', slice, [[1, 2, 3, 4], 1, 3], [2, 3]],
  ['join', join, [[1, 'a', null, new Date(0)], ', '], '1, a, , 1970-01-01T00:00:00.000Z'],
  ['range', range, [0, 3], [0, 1, 2]],
  // A range that falls, and one with a step of a tenth.
  ['range', range, [5, 0, -2], [5, 3, 1]],
  ['range', range, [0, 0.5, 0.1], [0, 0.1, 0.2, 0.30000000000000004, 0.4]],
  ['range', range, [3, 0], []],
  [
    'where',
    where,
    [
      [
        { a: 1, b: 'x' },
        { a: 2, b: 'y' },
        { a: 3, b: 'Y' },
      ],
      { a: { above: 1 }, b: { startsWith: 'y' } },
    ],
    [
      { a: 2, b: 'y' },
      { a: 3, b: 'Y' },
    ],
  ],
  ['sum', sum, [[1, 2, null, 3]], 6],
  ['sum', sum, [[{ t: 1 }, { t: 2 }, {}], 't'], 3],
  ['sum', sum, [[{ a: { b: 2 } }, { a: null }, 7], 'a.b'], 2],
  // A sum and an average of an empty list.
  ['sum', sum, [[]], 0],
  ['avg', avg, [[]], undefined],
  ['avg', avg, [[2, 4, undefined]], 3],
  ['min', min, [[3, 1, 2]], 1],
  ['min', min, [[]], undefined],
  // A `max` of days.
  ['max', max, [['2026-01-02', '2026-03-01', '2025-12-31']], '2026-03-01'],
  ['max', max, [[{ at: new Date(1) }, { at: new Date(2) }], 'at'], new Date(2)],
  // A month later from the 31st of January, a year later from the 29th of February, and a day earlier across the start of a month.
  ['later', later, ['2026-01-31', '1 month'], '2026-02-28'],
  ['later', later, ['2024-02-29', '1 year'], '2025-02-28'],
  ['earlier', earlier, ['2026-03-01', '1 day'], '2026-02-28'],
  ['later', later, ['2026-01-31', '2 weeks'], '2026-02-14'],
  ['later', later, [noon, '1.5 hours'], new Date('2026-10-08T13:30:00.000Z')],
  ['later', later, ['2026-10-08T12:00:00.000Z', '7 days'], '2026-10-15T12:00:00.000Z'],
  ['earlier', earlier, [noon, '1 month'], new Date('2026-09-08T12:00:00.000Z')],
  ['later', later, [undefined, '1 day'], undefined],
  // `between` the 31st of January and the 28th of February in months, and two equal moments in the two kinds.
  ['between', between, ['2026-01-31', '2026-02-28', 'months'], 1],
  ['between', between, ['2026-02-28', '2026-01-31', 'months'], -1],
  ['between', between, [noon, '2026-10-08T12:00:00.000Z', 'ms'], 0],
  ['between', between, [noon, new Date('2026-10-08T13:30:00.000Z'), 'hours'], 1],
  ['between', between, ['2026-01-01', '2026-01-15', 'week'], 2],
  ['between', between, [null, noon, 'days'], undefined],
  // The day of a moment in a zone ahead of UTC and in one behind it.
  ['dayOf', dayOf, [new Date('2026-10-08T22:30:00.000Z'), 'Asia/Tokyo'], '2026-10-09'],
  ['dayOf', dayOf, ['2026-10-08T01:30:00.000Z', 'America/New_York'], '2026-10-07'],
  ['dayOf', dayOf, ['2026-10-08', 'Asia/Tokyo'], '2026-10-08'],
  ['fingerprint', fingerprint, ['abc'], 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
  // `sameSecret` for two texts of unequal length, and for two empty ones.
  ['sameSecret', sameSecret, ['a', 'ab'], false],
  ['sameSecret', sameSecret, ['', ''], false],
  ['sameSecret', sameSecret, ['secret', 'secret'], true],
  ['sameSecret', sameSecret, [undefined, 'secret'], false],
  [
    'chunks',
    chunks,
    ['One.\n\nTwo.', { size: 4, overlap: 0 }],
    [
      { text: 'One.', at: 0 },
      { text: 'Two.', at: 6 },
    ],
  ],
]

/** Answers the `TentError` that a piece of work throws, and fails where it throws none. */
function thrownBy(work: () => unknown): TentError {
  try {
    work()
  } catch (thrown) {
    assert.ok(thrown instanceof TentError, `it threw what is no TentError: ${thrown}`)
    return thrown
  }
  assert.fail('it threw nothing')
}

const apply = (word: (...values: never[]) => unknown, values: unknown[]): unknown =>
  Reflect.apply(word, undefined, values)

/** What is wrong with each of these is of another kind than the word works with. */
const cannot: [what: string, work: () => unknown][] = [
  ['a length that does not read', () => later(noon, 'a while')],
  ['a length below zero', () => later(noon, '-1 day')],
  ['a unit a day does not have', () => later('2026-10-08', '3 hours')],
  ['a zone the runtime does not know', () => dayOf(noon, 'Mars/Olympus')],
  ['a range with a step of zero', () => range(0, 5, 0)],
  ['a number where a text is needed', () => apply(lower, [5])],
  ['a number where a text is needed, in a fingerprint', () => apply(fingerprint, [5])],
  ['a text where a number is needed', () => apply(round, ['2.5'])],
  ['nothing where a list is needed', () => apply(sum, [undefined])],
  ['nothing where a list is needed, in each', () => apply(each, [null, () => 1])],
  ['an entry that is no number', () => sum([1, 'two'])],
  ['two kinds in one list', () => apply(max, [[1, '2026-01-01']])],
  ['one moment and one day', () => between(noon, '2026-10-08', 'days')],
  ['a sign that calc does not have', () => apply(calc, ['**', 2, 3])],
  ['digits that are no whole number', () => token({ digits: 0.5 })],
  ['a list beyond valueSize', () => range(0, 1_000_001)],
  ['a text beyond valueSize', () => concat('x'.repeat(600_000), 'x'.repeat(400_001))],
]

test('[12-1] each value word answers its stored value, and its record for a reference, which valueOf works out to the same value', () => {
  const names = new Set(stored.map(([name]) => name))
  for (const [name, word, values, answer] of stored) {
    assert.deepEqual(apply(word, values), answer, `${name}(${JSON.stringify(values)})`)

    // Handed a reference it answers its record, and `valueOf` of that record answers what the word answers.
    const at = name === 'calc' ? 1 : 0
    const handed = values.map((value, i) => (i === at ? input('first') : value))
    const record = apply(word, handed)
    assert.ok(typeof record === 'object' && record !== null, `${name} handed a reference answers no record`)
    const form = name === 'concat' ? ['concat'] : name === 'calc' ? ['calc', 'left', 'right'] : ['fn', 'args']
    assert.deepEqual(Object.keys(record), form, `the record of ${name}`)
    if ('fn' in record) assert.equal(record.fn, name)
    const worked = valueOf(JSON.parse(JSON.stringify(record)), { ref: () => values[at], zone: 'UTC' })
    assert.deepEqual(worked, answer, `valueOf of the record of ${name}`)
  }
  for (const name of [
    'concat',
    'calc',
    'round',
    'floor',
    'ceil',
    'least',
    'most',
    'lower',
    'upper',
    'trim',
    'startsWith',
  ])
    assert.ok(names.has(name), `no stored input for ${name}`)
  for (const name of ['contains', 'slice', 'join', 'range', 'where', 'sum', 'avg', 'min', 'max', 'later', 'earlier'])
    assert.ok(names.has(name), `no stored input for ${name}`)
  for (const name of ['between', 'dayOf', 'fingerprint', 'sameSecret', 'chunks']) assert.ok(names.has(name), name)

  // `each` answers its list, and handed a reference it throws T1014 and answers no record.
  assert.deepEqual(
    each([1, 2, 3], (n, i) => n * i),
    [0, 2, 6],
  )
  assert.equal(thrownBy(() => each(input<number[]>('lines'), (line) => line)).code, 'T1014')
  // Handed one text and nothing else, each of the four is what `group` takes for a column.
  assert.deepEqual(
    [sum('total'), avg('total'), min('total'), max('total')],
    [{ sum: 'total' }, { avg: 'total' }, { min: 'total' }, { max: 'total' }],
  )
  // A record inside a record is worked out from the inside.
  const nested = round(calc('*', input<number>('net'), 1.2), 1)
  assert.deepEqual(nested, { fn: 'round', args: [{ calc: '*', left: { input: 'net' }, right: 1.2 }, 1] })
  assert.equal(valueOf(nested, { ref: () => 10.26 }), 12.3)

  // A reference is seen wherever it stands among the values, also as the seventieth and deep inside a list.
  const seventy = Array.from({ length: 70 }, (_, i) => i)
  const many = concat(...seventy, input('last'))
  assert.deepEqual(many, { concat: [...seventy, { input: 'last' }] })
  assert.equal(valueOf(many, { ref: () => '!' }), `${seventy.join('')}!`)
  const added = sum([...seventy, input<number>('last')])
  assert.deepEqual(added, { fn: 'sum', args: [[...seventy, { input: 'last' }]] })
  assert.equal(valueOf(added, { ref: () => 5 }), 2420)
  const deep = join([seventy, [seventy, [input('last')]]], ', ')
  assert.deepEqual(Object(deep).fn, 'join')

  // A value that holds itself is walked once: the word works with it as the same text does where no reference is looked for.
  const circle: unknown[] = [1, 2]
  circle.push(circle)
  const knot: Record<string, unknown> = { n: 1 }
  knot.self = knot
  knot.list = [knot, circle]
  assert.equal(contains(circle, 2), true)
  assert.deepEqual(slice(circle, 0, 2), [1, 2])
  assert.equal(concat('a', knot), 'a[object Object]')
  assert.deepEqual(
    each([knot, circle], (_, i) => i),
    [0, 1],
  )

  // A value that holds itself and holds a reference cannot be stored: the word says so, with a code of ours.
  const tied: Record<string, unknown> = { n: 1, ref: input('last') }
  tied.self = tied
  const ring: unknown[] = [input('last')]
  ring.push(ring)
  for (const work of [() => concat('a', tied), () => join(ring, ','), () => contains(ring, 1)]) {
    const error = thrownBy(work)
    assert.equal(error.code, 'T1014')
    assert.match(error.message, /holds itself/)
  }
  // A value that stands twice holds nothing of itself.
  const pair = [input('last')]
  assert.deepEqual(join([pair, pair], ','), { fn: 'join', args: [[[{ input: 'last' }], [{ input: 'last' }]], ','] })

  // A value of another kind than the word works with is T0027, which names the word.
  for (const [what, work] of cannot) assert.equal(thrownBy(work).code, 'T0027', what)
  assert.match(thrownBy(() => later(noon, 'a while')).message, /^later cannot work with "a while"/)

  // Beyond `valueSize`: 1,000,000 with an empty slot, and the limit that a runtime answers where one is in the slot.
  assert.match(thrownBy(() => range(0, 1_000_001)).message, /valueSize of 1000000/)
  setRuntime(testRuntime(() => undefined, true, 5))
  assert.deepEqual(range(0, 5), [0, 1, 2, 3, 4])
  const over = thrownBy(() => range(0, 6))
  assert.equal(over.code, 'T0027')
  assert.match(over.message, /valueSize of 5/)
  assert.equal(thrownBy(() => concat('abc', 'def')).code, 'T0027')
  assert.equal(thrownBy(() => join([1, 2, 3, 4], '-')).code, 'T0027')
  assert.equal(thrownBy(() => each([1, 2, 3, 4, 5, 6], (n) => n)).code, 'T0027')
  // Where a definition is being made no call is under way, and a runtime that answers no limit leaves the 1,000,000.
  assert.equal(describing(() => range(0, 6)).length, 6)
  setRuntime(testRuntime(() => undefined, true))
  assert.equal(range(0, 6).length, 6)
  setRuntime(null)
})

test('[12-1] the words that ask the engine, and a setting, answer their record where a definition is being made, and their value in a call', () => {
  const asked = () => [now(), random(), token(), token({ digits: 6 }), dayOf(noon), Reflect.get(settings, 'shopName')]
  const records = [
    { now: true },
    { random: true },
    { fn: 'token', args: [] },
    { fn: 'token', args: [{ object: [['digits', 6]] }] },
    { fn: 'dayOf', args: ['2026-10-08T12:00:00.000Z'] },
    { setting: 'shopName' },
  ]
  // With no engine no call is under way.
  assert.deepEqual(asked(), records)

  const drawn: string[] = []
  setRuntime(testRuntime((what, name) => drawn.push(`${what} ${name}`), true))
  // In a call each answers a value.
  const values = asked()
  assert.deepEqual([values[0], values[4], values[5]], [NOW, '2026-10-08', 'Corner Shop'])
  assert.equal(typeof values[1], 'number')
  assert.match(String(values[2]), /^token-\d+$/)
  assert.match(String(values[3]), /^\d{6}$/)
  assert.deepEqual(drawn, ['draw now', 'draw random', 'draw token', 'draw token', 'draw zone'])

  // Inside `describing` each answers its record, also while a call is under way, and nothing is asked of the engine.
  drawn.length = 0
  assert.deepEqual(describing(asked), records)
  assert.deepEqual(drawn, [])
  // What a file does after it waited is still inside.
  return describing(async () => {
    await new Promise((resolve) => setImmediate(resolve))
    assert.deepEqual(asked(), records)
    assert.deepEqual(drawn, [])
  })
})

test('[16-2@1] T0013 and T0027 are each raised by a call built to cause them', async () => {
  // T0013: an arrow handed to `each` answers a promise where waiting is not allowed, and no second entry is taken.
  const taken: number[] = []
  const waits = () =>
    each([1, 2, 3], async (n) => {
      taken.push(n)
      return n
    })
  for (const mayWait of [false, undefined]) {
    taken.length = 0
    setRuntime(testRuntime(() => undefined, mayWait))
    const error = thrownBy(waits)
    assert.deepEqual([error.code, error.name], ['T0013', 'not-allowed-here'])
    assert.ok(error.fix)
    assert.deepEqual(taken, [1])
  }
  // With no engine waiting is not allowed either: it is T0013, and never T0010.
  setRuntime(null)
  assert.equal(thrownBy(waits).code, 'T0013')
  // Where the call may wait, the entries are taken one after another.
  setRuntime(testRuntime(() => undefined, true))
  assert.deepEqual(await waits(), [1, 2, 3])

  // T0027: each wrong kind of value, with the name of the code.
  for (const [what, work] of cannot) {
    const error = thrownBy(work)
    assert.deepEqual([error.code, error.name], ['T0027', 'cannot-work-out'], what)
  }
})

test('[12-1] a day of a year under 100 is a day of the calendar, and a moment of such a year keeps its year', () => {
  const isDay = (value: string): boolean => checkValue(day(), value).length === 0
  assert.deepEqual(['0001-01-01', '0099-12-31', '0004-02-29', '0001-02-29', '0100-02-29', '9999-12-31'].map(isDay), [
    true,
    true,
    true,
    false,
    false,
    true,
  ])
  assert.equal(checkValue(date(), '0050-06-15T12:00:00.000Z').length, 0)
  assert.equal(checkValue(date(), '0050-02-30T12:00:00.000Z').length, 1)
  // The value words take such a day and such a moment, and move them on the calendar of their own year.
  assert.equal(later('0050-06-15T12:00:00.000Z', '1 day'), '0050-06-16T12:00:00.000Z')
  assert.equal(dayOf('0050-06-15T12:00:00.000Z', 'UTC'), '0050-06-15')
  assert.equal(later('0001-01-31', '1 month'), '0001-02-28')
  assert.equal(later('0003-02-28', '1 year'), '0004-02-28')
  assert.equal(later('0004-02-28', '1 day'), '0004-02-29')
  assert.equal(earlier('0100-01-01', '1 day'), '0099-12-31')
  assert.equal(later('0099-12-31', '1 week'), '0100-01-07')
  assert.equal(between('0001-01-01', '0099-12-31', 'years'), 98)
  assert.equal(dayOf('0099-12-31'), '0099-12-31')
  assert.equal(max(['0001-01-01', '0099-12-31']), '0099-12-31')
})

test('[12-1] the calendar runs from 0001-01-01 to 9999-12-31, and a word that would answer a day or a moment outside it is T0027', () => {
  // The year 0000 is no year of it, for a day and for a moment.
  assert.equal(checkValue(day(), '0000-01-01').length, 1)
  assert.equal(checkValue(date(), '0000-06-15T12:00:00Z').length, 1)
  assert.equal(checkValue(date(), new Date('0000-06-15T12:00:00Z')).length, 1)
  assert.equal(checkValue(date(), '0001-01-01T00:00:00Z').length, 0)
  assert.equal(checkValue(date(), '9999-12-31T23:59:59.999Z').length, 0)
  assert.equal(checkValue(date(), '0001-01-01T00:00:00+01:00').length, 1)
  assert.equal(thrownBy(() => dayOf('0000-06-15T12:00:00.000Z', 'UTC')).code, 'T0027')
  assert.equal(thrownBy(() => later('0000-01-01', '1 day')).code, 'T0027')
  // A day and a moment that are moved stay inside it.
  const outside: [string, () => unknown][] = [
    ['a day after the last', () => later('9999-12-31', '1 day')],
    ['a day before the first', () => earlier('0001-01-01', '1 day')],
    ['a month after the last', () => later('9999-12-01', '1 month')],
    ['a year before the first', () => earlier('0001-06-15', '1 year')],
    ['a moment after the last', () => later('9999-12-31T23:59:59Z', '1 second')],
    ['a moment before the first', () => earlier(new Date('0001-01-01T00:00:00Z'), '1 ms')],
    ['a day in a zone ahead that falls after the last', () => dayOf('9999-12-31T23:00:00.000Z', 'Asia/Tokyo')],
    ['a day in a zone behind that falls before the first', () => dayOf('0001-01-01T00:00:00.000Z', 'America/New_York')],
  ]
  for (const [what, work] of outside) {
    const error = thrownBy(work)
    assert.equal(error.code, 'T0027', what)
  }
  assert.equal(later('9999-12-30', '1 day'), '9999-12-31')
  assert.equal(earlier('0001-01-02', '1 day'), '0001-01-01')
  assert.equal(later('9999-12-31T23:59:58.000Z', '1 second'), '9999-12-31T23:59:59.000Z')
  // Inside it the day of a moment is right for every year and every zone.
  assert.equal(dayOf('0001-01-02T00:00:00.000Z', 'America/New_York'), '0001-01-01')
  assert.equal(dayOf('0001-01-01T00:00:00.000Z', 'Asia/Tokyo'), '0001-01-01')
  assert.equal(dayOf('0099-12-31T23:30:00.000Z', 'Asia/Tokyo'), '0100-01-01')
  assert.equal(dayOf('9999-12-31T10:00:00.000Z', 'America/New_York'), '9999-12-31')
})

test('[12-1] an error that names a count of a unit writes one unit without the s of many, and the length as it was written', () => {
  const stays = 'it needs a move that stays between 0001-01-01 and 9999-12-31'
  const said: [() => unknown, string][] = [
    [() => later('9999-12-31', '1 day'), `later cannot work with "9999-12-31": ${stays}, and 1 day does not.`],
    [() => earlier('0001-01-01', '1 day'), `earlier cannot work with "0001-01-01": ${stays}, and 1 day does not.`],
    [() => later('9999-12-30', '2 days'), `later cannot work with "9999-12-30": ${stays}, and 2 days does not.`],
    [() => earlier('0001-01-03', '1 week'), `earlier cannot work with "0001-01-03": ${stays}, and 1 week does not.`],
    [() => later('9999-12-01', '1 month'), `later cannot work with "9999-12-01": ${stays}, and 1 month does not.`],
    [() => earlier('0002-06-15', '3 years'), `earlier cannot work with "0002-06-15": ${stays}, and 3 years does not.`],
  ]
  for (const [work, message] of said) assert.equal(thrownBy(work).message, message)
  assert.deepEqual(
    [checkValue(vector({ size: 1 }), []), checkValue(vector({ size: 3 }), [1])].map(([miss]) => miss.message),
    ['The value is no list of 1 number.', 'The value is no list of 3 numbers.'],
  )
})
