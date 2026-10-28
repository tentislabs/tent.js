import assert from 'node:assert/strict'
import { once } from 'node:events'
import { join } from 'node:path'
import { test } from 'node:test'
import { Worker } from 'node:worker_threads'

const file = join(import.meta.dirname, '..', 'data.txt')

test('[99-1] a test whose thread reads a file and is ended at once', async () => {
  const worker = new Worker(
    `require('node:worker_threads').parentPort.postMessage(require('node:fs').readFileSync(${JSON.stringify(file)}, 'utf8'))`,
    { eval: true },
  )
  const [read] = await once(worker, 'message')
  await worker.terminate()
  assert.equal(String(read).trim(), 'one')
})
