import assert from 'node:assert/strict'
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { Worker } from 'node:worker_threads'
import { buildSaved } from '../../build/index.ts'
import { rulesThread } from '../rulesThread.ts'

const root = join(import.meta.dirname, '..', '..', '..')

/** What a promise comes to within a time: its value, its failure, or nothing yet. */
async function within<T>(ms: number, promise: Promise<T>): Promise<{ value: T } | { failed: unknown } | 'open'> {
  return Promise.race([
    promise.then(
      (value) => ({ value }),
      (failed: unknown) => ({ failed }),
    ),
    new Promise<'open'>((done) => setTimeout(() => done('open'), ms).unref()),
  ])
}

test('[31-21] the thread of our rules that ends on its own is started again: the build that waited is held anew there, and one that ends it twice is answered with its error', async (t) => {
  const folder = join(root, 'results', 'check', 'rules-again')
  rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  mkdirSync(folder, { recursive: true })
  cpSync(join(root, 'parts', 'build', 'tests', 'words'), folder, { recursive: true })
  t.after(() => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  const built = await buildSaved(folder)
  const rules = rulesThread()
  t.after(() => rules.close())
  const found = await rules.over(built)
  // The thread ends while a build waits for it, as one does that runs out of memory: here it is ended as the build
  // is handed to it, as many times as the test says.
  const post = Reflect.get(Worker.prototype, 'postMessage')
  let ends = 0
  Reflect.set(Worker.prototype, 'postMessage', function (this: Worker, ...given: unknown[]) {
    if (ends > 0) {
      ends--
      void this.terminate()
      return
    }
    return Reflect.apply(post, this, given)
  })
  t.after(() => Reflect.set(Worker.prototype, 'postMessage', post))
  ends = 1
  const again = await within(30_000, rules.over(built))
  assert.deepEqual(again, { value: found }, 'the build that waited is held anew by a thread started again')
  ends = 2
  const twice = await within(30_000, rules.over(built))
  assert.ok(twice !== 'open' && 'failed' in twice, 'a build that ends the thread twice is answered with its error')
  assert.match(String(twice.failed), /thread of our rules/)
  ends = 0
  assert.deepEqual(await within(30_000, rules.over(built)), { value: found }, 'the next build is held as before')
})
