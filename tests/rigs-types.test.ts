import assert from 'node:assert/strict'
import { test } from 'node:test'
import { command, copyOf } from './rigs-plant.ts'

const cases = ['rig/wrong.ts', 'rig/wrong.tsx', 'rig/unnamed.ts']

test('[03-20] a type error fails the type check, and so does an exported value whose type cannot be named', (t) => {
  const errors = { 'rig/wrong.ts': 'TS2322', 'rig/wrong.tsx': 'TS2322', 'rig/unnamed.ts': 'TS4023' }
  for (const [one, error] of Object.entries(errors)) {
    const others = cases.filter((other) => other !== one)
    const alone = command(copyOf(t, '20', others), 'types')
    assert.notEqual(alone.code, 0, alone.out)
    assert.ok(new RegExp(`^${one.replace('.', '\\.')}\\(\\d+,\\d+\\): error ${error}`, 'm').test(alone.out), alone.out)
    assert.equal(alone.out.match(/error TS/g)?.length, 1, alone.out)
  }

  const none = command(copyOf(t, '20', cases), 'types')
  assert.equal(none.code, 0, none.out)
})
