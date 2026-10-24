import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Finding } from '../../core/index.ts'
import { checkRules } from '../ours.ts'
import { list } from '../rules/list.ts'
import { copyOf } from './copies.ts'

/** What the check finds of one code in a project of the tests, as the file, the line and the words of each. */
async function foundIn(code: string, side: 'pass' | 'fail'): Promise<Finding[]> {
  const { findings } = await checkRules(copyOf(join(code, side), `${code}-${side}`))
  return findings.filter((one) => one.code === code)
}

test('[32-9] a key that one language has and another lacks is T9001, a warning that names the key and the language', async () => {
  assert.ok(list.some((one) => one.name === 'T9001'))
  assert.deepEqual(await foundIn('T9001', 'pass'), [])
  const found = await foundIn('T9001', 'fail')
  assert.deepEqual(
    found.map((one) => [one.level, one.where?.file]),
    [
      ['warning', 'messages/tr.ts'],
      ['warning', 'messages/tr.ts'],
    ],
  )
  assert.match(found.map((one) => one.message).join('\n'), /only\.english/)
  assert.match(found.map((one) => one.message).join('\n'), /status\.paid/)
  for (const one of found) {
    assert.match(one.message, /`tr`/)
    assert.ok(one.fix)
    assert.equal(one.docs, 'tent docs T9001')
  }
})

test('[32-9] a word whose key no language has is T9003: in a view, as the label of a type, and for a value of a choice that states its words', async () => {
  assert.ok(list.some((one) => one.name === 'T9003'))
  assert.deepEqual(await foundIn('T9003', 'pass'), [])
  const found = await foundIn('T9003', 'fail')
  const said = found.map((one) => `${one.where?.file} ${one.message}`).join('\n')
  assert.equal(found.length, 3, said)
  assert.match(said, /screens\/orders\.tsx .*nothing\.here/)
  assert.match(said, /functions\/orders\.ts .*field\.title/)
  assert.match(said, /functions\/orders\.ts .*status\.void/)
  for (const one of found) {
    assert.equal(one.level, 'error')
    assert.ok(one.fix)
  }
})
