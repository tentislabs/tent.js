import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { test } from 'node:test'
import { idMaker } from '../ids.ts'
import { opened, workFolder } from './work.ts'

const letters = '0123456789abcdefghjkmnpqrstvwxyz'

/** Reads an id back into its 128 bits, as a number without end. */
function bitsOf(id: string): bigint {
  let bits = 0n
  for (const letter of id) bits = bits * 32n + BigInt(letters.indexOf(letter))
  return bits
}

test('[20-12] a million ids made in one program, across a clock that is stepped back, are each larger than the one before', () => {
  let clock = 1_800_000_000_000
  let made = 0
  // The clock stands still for a thousand ids, then moves on by a millisecond, and three times it is stepped back:
  // by a second, by an hour and by a year.
  const back = new Map([
    [200_000, 1000],
    [500_000, 3_600_000],
    [800_000, 31_536_000_000],
  ])
  const ids = idMaker(() => clock)
  let last = ''
  for (made = 0; made < 1_000_000; made++) {
    if (made % 1000 === 0) clock += 1
    clock -= back.get(made) ?? 0
    const id = ids.next()
    if (id.length !== 26 || id <= last) assert.fail(`id ${made}, ${id}, is not larger than ${last}`)
    last = id
  }
  assert.equal(made, 1_000_000)
})

test('[20-12] an id is a version-7 unique id in 26 characters, with the time in front and random bits behind', () => {
  const at = 1_800_000_000_123
  const ids = idMaker(() => at)
  const [first, second] = [ids.next(), ids.next()]
  for (const id of [first, second]) {
    assert.match(id, /^[0-9a-hjkmnp-tv-z]{26}$/)
    const bits = bitsOf(id)
    // Two zero bits stand in front of the 128, so the whole is under 2 to the 128th.
    assert.ok(bits < 1n << 128n)
    assert.equal(Number(bits >> 80n), at, 'the first 48 bits are the time in milliseconds')
    assert.equal(Number((bits >> 76n) & 15n), 7, 'the version')
    assert.equal(Number((bits >> 62n) & 3n), 2, 'the variant')
  }
  assert.ok(second > first)
  // Two makers at one moment draw other bits.
  const others = new Set(Array.from({ length: 200 }, () => idMaker(() => at).next()))
  assert.equal(others.size, 200)
  // A maker that is told an id goes on above it, also where its own clock is behind it.
  const late = idMaker(() => at - 86_400_000)
  late.above(second)
  assert.ok(late.next() > second)
  late.above(first)
  assert.ok(late.next() > second, 'an id that is lower than the last one moves nothing')
})

test('[20-12] a store that opens starts above the largest id each table holds, so ids grow across a restart with the clock stepped back', (t) => {
  const folder = workFolder(t)
  const program = join(import.meta.dirname, 'started', 'ids.ts')
  // Each start is a program of its own: its maker of ids knows of the start before only what the data file holds.
  const start = (clock: number, tables: string[]): string[] => {
    const printed = execFileSync(process.execPath, [program, folder, String(clock), ...tables], { encoding: 'utf8' })
    const ids: unknown = JSON.parse(printed)
    return Array.isArray(ids) ? ids.map(String) : []
  }
  const before = start(1_800_000_000_000, ['orders', 'lines', 'lines'])
  // The program starts again an hour earlier, as after a clock that was set. The largest id of the file is a line's,
  // and the first row of the second start is an order: the ids of every table are read.
  const after = start(1_800_000_000_000 - 3_600_000, ['orders', 'lines'])
  const all = [...before, ...after]
  assert.equal(all.length, 5)
  assert.deepEqual([...all].sort(), all, 'each id is larger than the one before it')
  assert.equal(new Set(all).size, 5)
  // The file holds the ids of both starts, each in its table.
  const store = opened(folder)
  const idsOf = (table: string) =>
    store.sql?.(`SELECT "id" FROM "${table}" ORDER BY "_n"`, []).map((row) => Reflect.get(Object(row), 'id'))
  assert.deepEqual(idsOf('orders'), [all[0], all[3]])
  assert.deepEqual(idsOf('lines'), [all[1], all[2], all[4]])
})
