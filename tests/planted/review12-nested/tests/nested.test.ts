import assert from 'node:assert/strict'
import { once } from 'node:events'
import { join } from 'node:path'
import { test } from 'node:test'
import { Worker } from 'node:worker_threads'

const file = join(import.meta.dirname, '..', 'data.txt')

// The inner thread reads the file and waits on a lock; the outer one hands on what it read and waits too.
const inner = `const { parentPort } = require('node:worker_threads')
parentPort.postMessage(require('node:fs').readFileSync(${JSON.stringify(file)}, 'utf8'))
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)`
const outer = `const { Worker, parentPort } = require('node:worker_threads')
const inner = new Worker(${JSON.stringify(inner)}, { eval: true })
inner.once('message', (read) => parentPort.postMessage(read))`

test('[99-1] a test whose thread starts a thread that reads a file, and the outer thread is ended', async () => {
  const worker = new Worker(outer, { eval: true })
  const [read] = await once(worker, 'message')
  await worker.terminate()
  assert.equal(String(read).trim(), 'one')
})
