import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { measure } from '../../../rig/budgets.ts'
import { root } from './typed.ts'

// The owner's clean machines with no Python, of the three systems, are where these hold: the owner names one so.
const clean = process.env.TENT_CLEAN_MACHINE === 'yes'
const onClean = { todo: clean ? false : "the owner's clean machines with no Python, of the three systems" }

/**
 * Runs the program of a clean machine on a copy of its project, in a runner's folder of its own that holds nothing
 * yet, as a program that is not held to this computer. Answers the line it said.
 */
function onAClean(t: TestContext, what: string): Record<string, unknown> {
  assert.ok(clean, 'this is a clean machine of the owner, which TENT_CLEAN_MACHINE=yes names')
  const folder = mkdtempSync(join(root, 'results', 'cli', 'python-clean-'))
  t.after(() => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  const project = join(folder, 'pythonClean')
  cpSync(join(import.meta.dirname, 'pythonClean'), project, { recursive: true })
  const home = join(folder, 'home')
  mkdirSync(home)
  const { NODE_TEST_CONTEXT: _, TENT_PARTS: __, ...env } = process.env
  const done = spawnSync(process.execPath, [join(import.meta.dirname, 'pythonPrograms', 'clean.ts'), project, what], {
    env: { ...env, TENT_HOME: home },
    encoding: 'utf8',
    timeout: 1_200_000,
  })
  assert.equal(done.status, 0, done.stderr)
  return JSON.parse(done.stdout.trim().split('\n').at(-1) ?? '{}')
}

test(
  '[25-17] measured with no bar on a clean machine: the time and the bytes from the first call of a python to its answer, and the disk that five apps use which share their packages',
  onClean,
  async (t) => {
    let bytes = 0
    await measure('python.first', () => {
      const said = onAClean(t, 'first')
      bytes = Number(said.bytes)
      return Number(said.ms)
    })
    await measure('python.firstBytes', () => bytes, { unit: 'bytes' })
    await measure('python.fiveApps', () => Number(onAClean(t, 'apps').disk), { unit: 'bytes' })
  },
)

test(
  '[25-19] on a clean Windows, macOS and Linux machine with no Python, the first python call succeeds, and a Python crash leaves the engine running',
  onClean,
  (t) => {
    const said = onAClean(t, 'first')
    assert.deepEqual(said.answer, { mean: 4.5 })
    assert.equal(said.crash, 'T7119')
    assert.deepEqual(said.after, { mean: 1.5 })
  },
)
