import assert from 'node:assert/strict'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createServer } from 'node:http'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { App, Engine, Makers } from '../../engine/index.ts'
import { createEngine } from '../../engine/index.ts'
import { testSecrets } from '../secrets.ts'
import { closing, copyOf } from './projects.ts'

/** What a stand-in service was asked: the method, the path, the headers and the bytes of each request, in order. */
export interface Heard {
  method: string
  path: string
  headers: Record<string, string>
  body: Buffer
}

/** A server on this computer that stands in for the outside services of a test, with what it was asked so far. */
export interface Remote {
  origin: string
  heard: Heard[]
}

/**
 * Starts a server on this computer, on a free port, which answers each request as the test says. It is closed,
 * with every connection it holds, when the test ends, also where the test fails.
 */
export async function remoteOf(
  t: TestContext,
  answer: (heard: Heard, response: ServerResponse, request: IncomingMessage) => void,
): Promise<Remote> {
  const heard: Heard[] = []
  const server = createServer((request, response) => {
    const pieces: Buffer[] = []
    request.on('data', (piece: Buffer) => pieces.push(piece))
    request.on('end', () => {
      const headers: Record<string, string> = {}
      for (const [name, value] of Object.entries(request.headers)) headers[name] = String(value)
      const one = { method: request.method ?? '', path: request.url ?? '', headers, body: Buffer.concat(pieces) }
      heard.push(one)
      answer(one, response, request)
    })
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  closing(t, async () => {
    server.closeAllConnections()
    await new Promise((done) => server.close(done))
  })
  const at = server.address()
  assert.ok(at !== null && typeof at === 'object')
  return { origin: `http://127.0.0.1:${at.port}`, heard }
}

/** Answers a request with a status and a body of JSON. */
export function answerJson(response: ServerResponse, status: number, body: unknown, headers: object = {}): void {
  response.writeHead(status, { 'content-type': 'application/json', ...headers })
  response.end(JSON.stringify(body))
}

/** An app of a copy of a project of the tests, in an engine of its own on the clock of the system. */
export interface Serviced {
  app: App
  engine: Engine
  dataFolder: string
  // The address of the app on this computer, by the port that its engine listens on.
  origin: string
}

/**
 * Builds a copy of a project of the tests whose every service is reached at the address of the stand-in server,
 * gives each secret it names its value of test data, and opens it in an engine of its own, in the mode the test
 * names: so a test reads the log of its data folder. It is closed when the test ends.
 */
export async function servicedEngine(
  t: TestContext,
  remote: Remote,
  o: {
    project?: string
    mode?: 'development' | 'test' | 'live'
    secrets?: Record<string, string>
    makers?: Makers
  } = {},
): Promise<Serviced> {
  const folder = copyOf(t, o.project ?? 'serviced')
  for (const name of readdirSync(folder, { recursive: true, encoding: 'utf8' }))
    if (name.endsWith('.ts')) {
      const file = join(folder, name)
      writeFileSync(file, readFileSync(file, 'utf8').split('http://127.0.0.1:1').join(remote.origin))
    }
  const made = await buildProject(folder, { for: 'dev', out: join(folder, 'bundle') })
  assert.deepEqual(
    made.findings.filter((one) => one.level === 'error').map((one) => `${one.code} ${one.message}`),
    [],
  )
  const dataFolder = join(folder, 'data')
  testSecrets(dataFolder, made.description, o.secrets ?? {})
  const engine = createEngine({ port: 0, ...(o.makers ? { makers: o.makers } : {}) })
  closing(t, () => engine.close())
  const app = await engine.open(made.bundleFolder, { dataFolder, mode: o.mode ?? 'test' })
  const { port } = JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8'))
  return { app, engine, dataFolder, origin: `http://localhost:${port}` }
}

/** The code that a promise was refused with, or `ok` where it was kept. */
export const callCodeOf = (call: Promise<unknown>): Promise<string> =>
  call.then(
    () => 'ok',
    (error) => String(Reflect.get(Object(error), 'code')),
  )

/** Waits, by the clock of the program, until a test of the state holds. */
export async function untilWithin(what: string, holds: () => boolean, within = 10_000): Promise<void> {
  const ends = performance.now() + within
  while (!holds()) {
    assert.ok(performance.now() < ends, `never: ${what}`)
    await new Promise((done) => setTimeout(done, 5))
  }
}
