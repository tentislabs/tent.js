import assert from 'node:assert/strict'
import { test } from 'node:test'
import { project } from '../index.ts'
import { describe } from '../internal.ts'

/** Describes a project held in memory. */
const described = (value: object) => describe({ definitions: [{ value }] })

test('[54-8] release.watch.slowerBy is read from tent.ts as a time, and a value that is no time is T1011', () => {
  const read = described(project('shop', { release: { gradual: true, watch: { slowerBy: '2 ms', calls: 50 } } }))
  assert.deepEqual(read.findings, [])
  assert.deepEqual(read.description.project.release, { gradual: true, watch: { slowerBy: 2, calls: 50 } })
  // Left out, it is not stored: the engine takes its own default.
  const left = described(project('shop', { release: { watch: { slower: 0.5 } } }))
  assert.deepEqual(left.description.project.release, { watch: { slower: 0.5 } })
  const bad = described(project('shop', { release: { watch: { slowerBy: 'soon' } } }))
  assert.deepEqual(
    bad.findings.map((one) => one.code),
    ['T1011'],
  )
  assert.match(bad.findings[0].message, /release\.watch\.slowerBy/)
})
