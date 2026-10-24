import assert from 'node:assert/strict'
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildSaved } from '../../build/index.ts'
import { rulesThread } from '../rulesThread.ts'

const root = join(import.meta.dirname, '..', '..', '..')

test('[31-21] a build handed to the thread of our rules once the thread has ended is answered with a failure, and the round of a save does not wait for ever', async (t) => {
  const folder = join(root, 'results', 'check', 'reviewed-thread')
  rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  mkdirSync(folder, { recursive: true })
  cpSync(join(root, 'parts', 'build', 'tests', 'words'), folder, { recursive: true })
  t.after(() => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  const built = await buildSaved(folder)
  const rules = rulesThread()
  assert.ok(Array.isArray(await rules.over(built)), 'a thread that runs answers what the rules found')
  // The thread ends, as one does that runs out of memory or meets an error of its own.
  await rules.close()
  const answered = await Promise.race([
    rules.over(built).then(
      () => 'answered',
      () => 'failed',
    ),
    new Promise<'never'>((done) => setTimeout(() => done('never'), 5_000).unref()),
  ])
  assert.equal(
    answered,
    'failed',
    'a build handed to a thread that has ended is answered with a failure within 5 seconds',
  )
})
