import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkInto } from '../checked.ts'
import { checkedBy, checksOf } from '../internal.ts'
import type { Type } from '../type.ts'

// The checks of a form are made at build from the types of its function's input: a send walks them, and reads no type.

// Every kind of field that a form may send. A pattern that does not read is T1014 of the build (`describe.test.ts`),
// so no input holds one.
const input: Record<string, Type> = {
  name: { kind: 'text', min: 2, max: 5 },
  mail: { kind: 'text', pattern: '^[^@ ]+@[^@ ]+$' },
  note: { kind: 'text', optional: true },
  count: { kind: 'number', min: 1, max: 9, whole: true },
  price: { kind: 'number' },
  size: { kind: 'choice', values: ['small', 'large'] },
  agreed: { kind: 'boolean' },
  later: { kind: 'text', default: 'soon' },
  when: { kind: 'date' },
  on: { kind: 'day' },
  tags: { kind: 'list', of: { kind: 'text', max: 3 }, max: 2 },
}

// What fits every field, which each case below changes.
const fits = {
  name: 'Ann',
  mail: 'ann@example.com',
  count: 3,
  price: 4.5,
  size: 'large',
  agreed: true,
  when: '2026-10-08T10:00:00.000Z',
  on: '2026-10-08',
  tags: ['a', 'b'],
}

test('[32-4] the checks made at build from the input of a function find, for each kind and each case, what the check of the door finds', () => {
  const checks = checksOf(input)
  const cases: Record<string, unknown>[] = [
    {},
    fits,
    { ...fits, name: 'A', mail: 'no mail', count: 3.5, price: Number.NaN, size: 'huge' },
    { ...fits, name: 'Annabel', mail: 'a@b', count: 12, price: '4', agreed: false },
    { ...fits, count: 0, price: 1, size: 'small' },
    // A text is counted by its characters, as the door counts them.
    { ...fits, name: 'Ä😀', note: 7 },
    // An empty text is given, as the door takes it: held to its limits and its pattern.
    { ...fits, name: '', mail: '', note: '' },
    // A switch and a choice given a value of another kind.
    { ...fits, agreed: 'yes', size: 5 },
    // A moment and a day that do not read, and lists that do not fit.
    { ...fits, when: 'soon', on: '08.10.2026', tags: 'a' },
    { ...fits, when: 42, on: '2026-13-40', tags: ['a', 'b', 'c'] },
    { ...fits, tags: ['abcd'] },
    { ...fits, tags: [7] },
  ]
  for (const values of cases) {
    // What the door finds of each field, by its dotted name, as it names a field that fails.
    const door: Record<string, string> = {}
    for (const [name, type] of Object.entries(input))
      for (const one of checkInto(type, values[name]))
        for (const [path, check] of Object.entries(Object(one.fields))) {
          const field = path ? `${name}.${path}` : name
          if (!Object.hasOwn(door, field)) door[field] = String(check)
        }
    assert.deepEqual(checkedBy(checks, values), door, JSON.stringify(values))
  }
  // The cases are those where the two could part: each kind fails in the form as at the door.
  assert.deepEqual(checkedBy(checks, { ...fits, agreed: 'yes', size: 5 }), { agreed: 'type', size: 'type' })
  assert.deepEqual(checkedBy(checks, { ...fits, when: 'soon', on: '08.10.2026', tags: 'a' }), {
    when: 'type',
    on: 'type',
    tags: 'type',
  })
  assert.deepEqual(checkedBy(checks, { ...fits, tags: ['abcd'] }), { 'tags.0': 'max' })
  assert.deepEqual(checkedBy(checks, { ...fits, name: '' }), { name: 'min' })
})

test('[32-4] the checks are made once, of plain values: once made, no type of the input is read to check a send', () => {
  let made = false
  // Types that cannot be read once the checks are made.
  const types = Object.fromEntries(
    Object.entries(input).map(([name, type]) => [
      name,
      new Proxy(type, {
        get: (target, key) => {
          if (made) throw new Error(`the type of ${name} was read at a send`)
          return Reflect.get(target, key)
        },
      }),
    ]),
  )
  const checks = checksOf(types)
  made = true
  assert.deepEqual(checkedBy(checks, { name: 'A', count: 12 }), {
    name: 'min',
    mail: 'required',
    count: 'max',
    price: 'required',
    size: 'required',
    agreed: 'required',
    when: 'required',
    on: 'required',
    tags: 'required',
  })
  assert.deepEqual(JSON.parse(JSON.stringify(checks)), checks, 'kept in a stub as they are')
  // Each check holds whether the field must be given, and the type the door holds it to, with its limits.
  assert.deepEqual(checks.count, { required: true, type: { kind: 'number', min: 1, max: 9, whole: true } })
  assert.deepEqual(checks.later, { required: false, type: { kind: 'text', default: 'soon' } })
})
