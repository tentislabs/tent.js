import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'

// The thread reads a file of the project, says so, and then waits on a lock that is never let go, so it answers
// nothing more before it is ended.
const code = `
const { readFileSync } = require('node:fs')
const { parentPort, workerData } = require('node:worker_threads')
parentPort.postMessage(readFileSync(workerData, 'utf8'))
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)
`

test('a thread that reads a file and waits on a lock', async () => {
  const thread = new Worker(code, { eval: true, workerData: fileURLToPath(new URL('../held.txt', import.meta.url)) })
  const read = await new Promise((done) => thread.once('message', done))
  assert.match(String(read), /^held/)
  await thread.terminate()
})
