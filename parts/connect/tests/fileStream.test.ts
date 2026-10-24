import assert from 'node:assert/strict'
import test from 'node:test'
import type { Caller } from '../../core/index.ts'
import { file, post, project, service, text } from '../../core/index.ts'
import { describe } from '../../core/internal.ts'
import type { ConnectEnv, Signer } from '../env.ts'
import { guardedFetch } from '../guardedFetch.ts'
import { createServices } from '../services.ts'
import { standIn } from './servers.ts'

const system: Caller = { kind: 'system' }

// A file of 300 kB, so that it cannot reach the service in one piece.
const bytes = new Uint8Array(300_000).map((_, at) => at % 251)

/** The services over definitions held in memory, with one file whose every opening is counted, and the signers named. */
function servicesOf(definitions: object[], signers: Record<string, Signer> = {}) {
  const { description } = describe({
    definitions: [{ value: project('testedApp', {}) }, ...definitions.map((value) => ({ value }))],
  })
  let opened = 0
  const env: ConnectEnv = {
    description: () => description,
    fetch: guardedFetch({ mode: 'development', bodyTravels: true }),
    secret: () => '',
    tokens: { read: () => undefined, write: () => undefined },
    signers,
    verifiers: {},
    once: () => undefined,
    files: {
      stream: async () => {
        opened++
        return new Blob([bytes]).stream()
      },
      info: () => ({ name: 'scan.bin', kind: 'application/octet-stream', size: bytes.length }),
      put: async () => 'f2',
    },
    logged: () => undefined,
    now: () => Date.UTC(2032, 0, 1),
    sleep: async () => undefined,
  }
  const services = createServices(env)
  return {
    call: (call: string, input: object) =>
      services.call('store', call, input, { caller: system, version: 'v1', signal: new AbortController().signal }),
    opened: () => opened,
  }
}

test('[24-2] a file reaches a service as a stream of its bytes with their length, and a 307 opens it anew and sends it again', async (t) => {
  const server = await standIn(t, (request, response, asked) => {
    if (asked.path === '/up') return response.writeHead(307, { location: '/again' }).end()
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(
      JSON.stringify({ length: request.headers['content-length'], chunked: request.headers['transfer-encoding'] }),
    )
  })
  const { call, opened } = servicesOf([
    service('store', {
      url: server.origin,
      calls: {
        up: post('/up', { input: { scan: file() }, body: { bytes: 'scan', type: 'application/octet-stream' } }),
      },
    }),
  ])
  assert.deepEqual(await call('up', { scan: 'f1' }), { length: String(bytes.length) })
  assert.deepEqual(
    server.asked.map((one) => one.path),
    ['/up', '/again'],
  )
  // The file is opened once for each request it is sent with: none of it is read into memory ahead.
  assert.equal(opened(), 2)
})

test('[24-2] a body in parts that holds a file states its length, and a signer that reads the body twice reads it whole each time', async (t) => {
  const server = await standIn(t, (request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ length: request.headers['content-length'] }))
  })
  const read: number[] = []
  const hashing: Signer = async (request) => {
    read.push((await request.arrayBuffer()).byteLength)
    read.push((await request.clone().arrayBuffer()).byteLength)
    return request
  }
  const { call, opened } = servicesOf(
    [
      service('store', {
        url: server.origin,
        auth: { by: 'hashing' },
        calls: { send: post('/send', { input: { scan: file(), note: text() }, body: 'files' }) },
      }),
    ],
    { hashing },
  )
  const answer: unknown = await call('send', { scan: 'f1', note: 'the scan' })
  assert.ok(read[0] > bytes.length)
  assert.deepEqual(read, [read[0], read[0]])
  assert.deepEqual(answer, { length: String(read[0]) })
  assert.equal(opened(), 3)
})
