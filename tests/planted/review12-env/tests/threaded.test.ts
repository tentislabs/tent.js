import assert from 'node:assert/strict'
import { once } from 'node:events'
import { test } from 'node:test'
import { Worker } from 'node:worker_threads'

test('[99-2] a test whose thread reads a word of the environment', async () => {
  const worker = new Worker("require('node:worker_threads').parentPort.postMessage(process.env.REVIEW12_WORD ?? 'none')", {
    eval: true,
  })
  const [read] = await once(worker, 'message')
  await worker.terminate()
  assert.equal(read, 'one')
})
