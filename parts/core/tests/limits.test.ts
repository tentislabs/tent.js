import assert from 'node:assert/strict'
import { test } from 'node:test'
import { action, flow, project } from '../index.ts'
import { describe, lengthOf, limitDefaults, sizeOf } from '../internal.ts'

const run = async () => undefined

/** Makes a definition with options that the types of its word would not take. */
const made = (word: object, name: string, options: object): object =>
  Object(Reflect.apply(Object(word), undefined, [name, options]))

test('[13-5] tentjs/core gives the defaults of the limits of a project, a flow and an action, and describe leaves a limit out by that one table', () => {
  // Rows of `13`, section 15, and of the limits that it names: a time in milliseconds, a size in bytes, a count.
  assert.equal(limitDefaults.project.callSize, 1_048_576)
  assert.equal(limitDefaults.project.uploadSize, 52_428_800)
  assert.equal(limitDefaults.project.queryTime, 1000)
  assert.equal(limitDefaults.project.actionTime, 30_000)
  assert.equal(limitDefaults.project.anyonePerMinute, 60)
  assert.equal(limitDefaults.project.valueSize, 1_000_000)
  assert.equal(limitDefaults.project.sessionTime, 2_592_000_000)
  // A limit that has no number of its own when it is left out is there, with nothing.
  assert.ok(Object.hasOwn(limitDefaults.project, 'workBeat'))
  assert.equal(limitDefaults.project.workBeat, undefined)
  assert.deepEqual(limitDefaults.flow, {
    steps: 1000,
    time: 2_592_000_000,
    result: 1_048_576,
    wait: 31_536_000_000,
    pass: 5000,
    stepTime: 600_000,
  })
  assert.deepEqual(limitDefaults.action, { runKept: 3_600_000, lost: 3 })

  // The table is the one that `describe` leaves a default out by: each limit written as its default is not
  // stored, and written one more it is.
  const shop = { value: project('shop', {}) }
  for (const [name, value] of Object.entries(limitDefaults.project)) {
    if (value === undefined) continue
    const stored = (limit: number) =>
      describe({ definitions: [{ value: made(project, 'shop', { limits: { [name]: limit } }) }] }).description.project
        .limits
    assert.equal(stored(value), undefined, name)
    assert.deepEqual(stored(value + 1), { [name]: value + 1 }, name)
  }
  for (const [name, value] of Object.entries(limitDefaults.flow)) {
    const stored = (limit: number) =>
      describe({ definitions: [shop, { value: made(flow, 'f', { run, limits: { [name]: limit } }) }] }).description
        .flows.f.limits
    assert.equal(stored(value), undefined, name)
    assert.deepEqual(stored(value + 1), { [name]: value + 1 }, name)
  }
  for (const [name, value] of Object.entries(limitDefaults.action)) {
    const stored = (limit: number) =>
      describe({
        definitions: [shop, { value: made(action, 'a', { access: 'signedIn', run, limits: { [name]: limit } }) }],
      }).description.functions.a.limits
    assert.equal(stored(value), undefined, name)
    assert.deepEqual(stored(value + 1), { [name]: value + 1 }, name)
  }
})

test('[13-5] sizeOf and lengthOf of tentjs/core read a size and a length of time as the document of the words writes them', () => {
  // A size: a number and KB, MB or GB, counted in 1,024s.
  assert.equal(sizeOf('1 KB'), 1024)
  assert.equal(sizeOf('10 MB'), 10_485_760)
  assert.equal(sizeOf('1 GB'), 1_073_741_824)
  assert.equal(sizeOf('1.5 KB'), 1536)
  for (const none of ['1 kb', '1KB', 'KB', '1 TB', '', 5, undefined, null]) assert.equal(sizeOf(none), undefined)
  // A length of time: a number and a unit, with or without its final s, and a number may have a decimal part.
  for (const unit of ['ms', 'second', 'minute', 'hour', 'day', 'week', 'month', 'year']) {
    assert.deepEqual(lengthOf(`1 ${unit}`), { n: 1, unit }, unit)
    if (unit !== 'ms') assert.deepEqual(lengthOf(`30 ${unit}s`), { n: 30, unit }, unit)
  }
  assert.deepEqual(lengthOf('1.5 hours'), { n: 1.5, unit: 'hour' })
  for (const none of ['a while', '5', 'hour', '5 fortnights', '-1 day', '', 5, undefined, null])
    assert.equal(lengthOf(none), undefined, String(none))
})
