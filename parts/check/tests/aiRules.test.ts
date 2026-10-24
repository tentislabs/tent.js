import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Finding } from '../../core/index.ts'
import { checkRules } from '../ours.ts'
import { copyOf, heldToProjects } from './copies.ts'

// The rules of the check for models, agents and the counts, each with the level of what it finds.
const levels: Record<string, Finding['level']> = {
  T2016: 'error',
  T7001: 'error',
  T7002: 'warning',
  T7005: 'warning',
  T7006: 'error',
  T7007: 'error',
  T7008: 'error',
  T7010: 'error',
  T7011: 'error',
  T7012: 'error',
  T7017: 'error',
  T7018: 'warning',
  T7019: 'warning',
}

/** What the rules of our own find in a project of a rule, copied. */
async function checked(name: string, side: 'pass' | 'fail'): Promise<Finding[]> {
  const folder = copyOf(join(name, side), `${name}-${side}`)
  return (await checkRules(folder, {})).findings
}

test('[15-1@9a] every rule of models, agents and the counts has a passing project and a failing project, and the failing one gives exactly its code, at its definition, with its fix', async () => {
  for (const [name, level] of Object.entries(levels)) {
    for (const one of (await heldToProjects(name)).findings) {
      assert.equal(one.where?.file, 'functions/ai.ts', name)
      assert.ok(one.message.length > 10 && one.fix, name)
      assert.equal(one.docs, `tent docs ${name}`)
      assert.equal(one.level, level, name)
    }
  }
})

test('[15-1@10g] T2016 holds a table that shows the scores as it holds one that shows the counts, and names what it shows', async () => {
  const failing = await checked('T2016', 'fail')
  const ofScores = failing.filter((one) => one.where?.definition === 'ratings' || one.where?.definition === 'scored')
  assert.deepEqual(ofScores.map((one) => one.where?.definition).sort(), ['ratings', 'scored'])
  for (const one of ofScores) assert.match(one.message, /scores/, one.message)
  assert.doesNotMatch(ofScores.map((one) => one.message).join(' '), /counts/)
})

test('[27-14] the three-mark check warns about an agent built to have all three marks, and is silent when its sending tool asks a person', async () => {
  const [warned] = await checked('T7002', 'fail')
  assert.equal(warned.code, 'T7002')
  assert.match(
    warned.message,
    /helper: it can read what is not open to everyone, take in text from outside, and send data out/,
  )
  assert.deepEqual(await checked('T7002', 'pass'), [])
})

test('[27-17] an agent that states tell list and whose model lacks tools is T7001, also with no tool of its own', async () => {
  const found = (await checkRules(copyOf(join('tellList', 'fail'), 'T7001-list'), {})).findings
  assert.deepEqual(
    found.map((one) => one.code),
    ['T7001'],
  )
  assert.match(found[0]?.message ?? '', /lister/)
})

test('[27-10] a flow as a tool without as: starter is T7012, and one without output T7009', async () => {
  const [unstarted] = await checked('T7012', 'fail')
  assert.match(unstarted.message, /tidy: it is a tool of an agent and does not state `as: 'starter'`/)
  const undescribed = (await checkRules(copyOf(join('T7009', 'flows', 'fail'), 'T7009-flows-tool'), {})).findings
  assert.ok(
    undescribed.some((one) => one.code === 'T7009' && /output/.test(one.message)),
    JSON.stringify(undescribed.map((one) => one.message)),
  )
})
