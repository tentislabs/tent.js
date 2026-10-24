import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Finding } from '../../core/index.ts'
import { finding } from '../../core/internal.ts'
import { heldAndAdded } from '../heldAndAdded.ts'

// A save of `tent dev` loads its version beside our rules, not after them, and switches only where neither found an error.

const built = (findings: Finding[] = []) => ({ findings, versionId: 'v2', list: '/project/.tent/build/v2.json' })

test('[31-21] the version of a save is loaded while our rules hold its build, and is the one to switch to where they find no error', async () => {
  const order: string[] = []
  let answer = (found: Finding[]): void => void found
  const held = heldAndAdded({
    ...built(),
    running: 'v1',
    rules: () => {
      order.push('rules')
      return new Promise<Finding[]>((done) => (answer = done))
    },
    add: async (list) => {
      order.push(`add ${list}`)
      return 'v2'
    },
  })
  // The version is asked for before the rules have answered.
  await new Promise((done) => setImmediate(done))
  assert.deepEqual(order, ['add /project/.tent/build/v2.json', 'rules'])
  answer([finding('T6001', 'a warning of our rules', {}, 'warning')])
  const { found, version } = await held
  assert.equal(version, 'v2')
  assert.deepEqual(
    found.map((one) => one.code),
    ['T6001'],
  )
})

test('[31-21] a save whose rules find an error is not switched to, a build that failed is not loaded, nor one that runs already, and a version that cannot be loaded is told', async () => {
  const added: string[] = []
  const add = async (list: string): Promise<string> => {
    added.push(list)
    return 'v2'
  }
  const ruled = await heldAndAdded({
    ...built(),
    running: 'v1',
    rules: async () => [finding('T6001', 'an error of our rules')],
    add,
  })
  assert.equal(ruled.version, undefined)
  assert.equal(added.length, 1, 'it was loaded beside the rules')
  const broken = await heldAndAdded({
    ...built([finding('T1001', 'an error of the build')]),
    running: 'v1',
    rules: async () => [],
    add,
  })
  assert.deepEqual([broken.version, added.length], [undefined, 1], 'a build with an error is not loaded')
  const same = await heldAndAdded({ ...built(), running: 'v2', rules: async () => [], add })
  assert.deepEqual([same.version, added.length], [undefined, 1], 'the version that runs is not loaded again')
  const refused = new Error('the table change is refused')
  const failed = await heldAndAdded({
    ...built(),
    running: 'v1',
    rules: async () => [],
    add: () => Promise.reject(refused),
  })
  assert.deepEqual([failed.version, failed.failed], [undefined, refused])
})

test('[31-21] the round of tent dev holds a save against our rules through the one that loads its version beside them: its build runs no rule', () => {
  const dev = readFileSync(join(import.meta.dirname, '..', 'dev.ts'), 'utf8')
  const build = dev.slice(
    dev.indexOf('const build = async'),
    dev.indexOf('\n  }\n', dev.indexOf('const build = async')),
  )
  assert.ok(build.length > 0)
  assert.ok(!build.includes('rulesOver('), 'the build of a save runs no rule')
  assert.ok(dev.includes('heldAndAdded('))
})

test('[31-21] tent dev holds every build against our rules on their own thread, and runs none of them on its own', () => {
  const dev = readFileSync(join(import.meta.dirname, '..', 'dev.ts'), 'utf8')
  assert.ok(!dev.includes('rulesOver'), 'no rule is carried out on the thread of tent dev')
  assert.ok(dev.includes('rulesThread('))
})
