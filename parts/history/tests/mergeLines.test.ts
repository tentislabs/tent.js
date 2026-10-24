import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mergeLines } from '../merge/lines.ts'

const lines = (count: number, changed: (k: number) => boolean, mark: string): string[] =>
  Array.from({ length: count }, (_, k) => (changed(k) ? `${mark} ${k}` : `line ${k}`))

test('[40-4] two large texts that each changed thousands of other lines merge line by line, with every change of both', () => {
  const base = lines(8000, () => false, '')
  const ours = lines(8000, (k) => k % 4 === 0 && k < 6000, 'ours')
  const theirs = lines(8000, (k) => k % 4 === 2 && k < 6000, 'theirs')
  const merged = mergeLines(base, ours, theirs)
  assert.deepEqual(merged.apart, [])
  assert.deepEqual(
    merged.lines,
    lines(8000, (k) => k % 2 === 0 && k < 6000, '').map((one, k) =>
      one.startsWith(' ') ? `${k % 4 === 0 ? 'ours' : 'theirs'} ${k}` : one,
    ),
  )
})

test('[40-4] lines that both sides added and removed alike merge once, and a text both changed apart clashes where ours stays', () => {
  const base = ['a', 'b', 'c', 'd', 'e']
  const both = mergeLines(base, ['a', 'x', 'c', 'e'], ['a', 'x', 'c', 'e'])
  assert.deepEqual(both, { lines: ['a', 'x', 'c', 'e'], apart: [] })
  const apart = mergeLines(base, ['a', 'ours', 'c', 'd', 'e'], ['a', 'theirs', 'c', 'd', 'e'])
  assert.deepEqual(apart.lines, ['a', 'ours', 'c', 'd', 'e'])
  assert.deepEqual(apart.apart, [{ line: 2, count: 1, at: 1, ours: ['ours'], theirs: ['theirs'], base: ['b'] }])
  // Texts with no line in common are wholly apart.
  const none = mergeLines(['a', 'b'], ['c', 'd'], ['e', 'f'])
  assert.deepEqual(none.lines, ['c', 'd'])
  assert.equal(none.apart.length, 1)
})
