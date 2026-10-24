import assert from 'node:assert/strict'
import { once } from 'node:events'
import { test } from 'node:test'
import { Worker } from 'node:worker_threads'
import { rulesThread } from '../rulesThread.ts'

test('[31-12] the thread of our rules starts with the session, before any build is handed to it, so the first build does not wait for it to load', async (t) => {
  // Each thread that is started is told to keep no program running: so the one started here is seen.
  const unref = Reflect.get(Worker.prototype, 'unref')
  const started: Worker[] = []
  Reflect.set(Worker.prototype, 'unref', function (this: Worker) {
    started.push(this)
    return Reflect.apply(unref, this, [])
  })
  t.after(() => Reflect.set(Worker.prototype, 'unref', unref))
  const rules = rulesThread()
  t.after(() => rules.close())
  assert.equal(started.length, 1, 'a thread runs before any build is handed to it')
  await once(started[0], 'online')
})
