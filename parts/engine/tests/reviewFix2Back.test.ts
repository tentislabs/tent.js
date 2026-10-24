import assert from 'node:assert/strict'
import { connect } from 'node:net'
import { test } from 'node:test'
import type { OnRequest } from '../onRequest.ts'
import { running } from './apps.ts'

// The length an answer states: far more than the buffers of a connection of this computer hold.
const size = 2 ** 31

test('[05-2.11] a connection whose sender asked for an answer and then reads nothing of it is closed by the times of the web side, and is not held for good', async (t) => {
  const web = { bodyCloseAfter: '1 second', closeAfter: '1 second' }
  let given = 0
  let cancelled = false
  const big: OnRequest = async (request, next) => {
    if (new URL(request.url).pathname !== '/big') return next(request)
    // A data file read piece by piece, as the engine sends one: a piece is read only once the last one left.
    const pieces = new ReadableStream<Uint8Array>({
      pull(controller) {
        given += 1024 * 1024
        controller.enqueue(new Uint8Array(1024 * 1024))
      },
      cancel() {
        cancelled = true
      },
    })
    return new Response(pieces, { headers: { 'content-length': String(size) } })
  }
  const { port } = await running(t, { engine: { web, onRequest: big } })
  const socket = connect(port, '127.0.0.1')
  t.after(() => socket.destroy())
  await new Promise<void>((done) => socket.once('connect', () => done()))
  // The sender reads nothing: what arrives stays in the buffers of the system until they are full.
  socket.pause()
  socket.write(`GET /big HTTP/1.1\r\nHost: localhost:${port}\r\n\r\n`)
  for (let waited = 0; waited < 15_000 && !cancelled; waited += 250) await new Promise((done) => setTimeout(done, 250))
  assert.ok(
    cancelled,
    `the answer is still held open for a sender that read nothing for 15 seconds, ${given} bytes given`,
  )
})

test('[05-2.11] an answer that states its length and ends short closes its connection at once, as no whole answer, and does not hold it to closeAfter', async (t) => {
  const web = { closeAfter: '30 seconds' }
  const short: OnRequest = async (request, next) => {
    if (new URL(request.url).pathname !== '/short') return next(request)
    // Ten bytes of the thousand it states, and then its end.
    return new Response(new TextEncoder().encode('ten bytes!'), { headers: { 'content-length': '1000' } })
  }
  const { port } = await running(t, { engine: { web, onRequest: short } })
  const socket = connect(port, '127.0.0.1')
  t.after(() => socket.destroy())
  await new Promise<void>((done) => socket.once('connect', () => done()))
  let read = ''
  socket.setEncoding('utf8').on('data', (piece: string) => {
    read += piece
  })
  const began = performance.now()
  const closed = new Promise<void>((done) => socket.once('close', () => done()))
  // The connection is one that would be kept: the request is whole, and it asks for no close.
  socket.write(`GET /short HTTP/1.1\r\nHost: localhost:${port}\r\n\r\n`)
  const late = new Promise<'held'>((done) => setTimeout(() => done('held'), 10_000).unref())
  assert.equal(await Promise.race([closed.then(() => 'closed'), late]), 'closed', `the connection is held: ${read}`)
  assert.ok(performance.now() - began < 5000, `closed after ${performance.now() - began} ms`)
})
