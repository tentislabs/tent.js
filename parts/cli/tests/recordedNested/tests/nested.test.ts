import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'

// The inner thread reads a file of the project, says so, and waits on a lock that is never let go. The outer thread
// hands on what it read and lives on until it is ended.
const inner = `
const { readFileSync } = require('node:fs')
const { parentPort, workerData } = require('node:worker_threads')
parentPort.postMessage(readFileSync(workerData, 'utf8'))
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)
`
const outer = `
const { Worker, parentPort, workerData } = require('node:worker_threads')
const inner = new Worker(${JSON.stringify(inner)}, { eval: true, workerData })
inner.once('message', (read) => parentPort.postMessage(read))
`

test('a thread of a thread that reads a file, the outer thread ended', async () => {
  const thread = new Worker(outer, { eval: true, workerData: fileURLToPath(new URL('../nested.txt', import.meta.url)) })
  const read = await new Promise((done) => thread.once('message', done))
  assert.match(String(read), /^nested/)
  await thread.terminate()
})
