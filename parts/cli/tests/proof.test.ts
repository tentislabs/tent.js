import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { createServer } from 'node:http'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { closed, copied, typed } from './typed.ts'

const token = 'the-token-that-engine-json-holds-0123456789abcdef'

/** A program that listens where `engine.json` says an engine does, and answers each request as the test says. */
interface Listener {
  port: number
  // Each request it was sent: its address, its headers and its body, as one text, and the number it was asked.
  sent: string[]
  numbers: string[]
}

function listening(
  t: TestContext,
  answers: (asked: { path: string; number: string }, answer: ServerResponse) => void,
): Promise<Listener> {
  const sent: string[] = []
  const numbers: string[] = []
  const server: Server = createServer((request: IncomingMessage, answer) => {
    const parts: Buffer[] = []
    request.on('data', (part: Buffer) => parts.push(part))
    request.on('end', () => {
      const body = Buffer.concat(parts).toString('utf8')
      sent.push(`${request.method} ${request.url} ${JSON.stringify(request.headers)} ${body}`)
      let number = ''
      try {
        number = String(Reflect.get(Object(JSON.parse(body)), 'number') ?? '')
      } catch {
        // A body that is no JSON asked no number.
      }
      if (request.url === '/_t/admin') numbers.push(number)
      answers({ path: String(request.url), number }, answer)
    })
  })
  t.after(() => {
    server.closeAllConnections()
    server.close()
  })
  return new Promise((done) => {
    server.listen(0, '127.0.0.1', () => {
      const at = server.address()
      done({ port: typeof at === 'object' && at ? at.port : 0, sent, numbers })
    })
  })
}

const said = (answer: ServerResponse, value: unknown): void => {
  answer.writeHead(200, { 'content-type': 'application/json' })
  answer.end(JSON.stringify({ ok: true, value }))
}

/** Writes an `engine.json` that names this program, which runs, and the port of a listener. */
function leftBehind(project: string, port: number): void {
  mkdirSync(join(project, '.tent'), { recursive: true })
  const file = join(project, '.tent', 'engine.json')
  writeFileSync(file, JSON.stringify({ port, token, pid: process.pid, mode: 'development' }))
  // An engine writes the file for the current user alone, and a command reads no other.
  closed(file)
}

/** The fingerprint of a token with a number, as an engine that holds the token answers it. */
const tokenProof = (held: string, number: string): string => createHmac('sha256', held).update(number).digest('hex')

test('[15-6@4] a command asks what listens for the fingerprint of the token with a number that it draws anew each time, and sends neither the token nor a word of the command to what answers anything else', async (t) => {
  const project = copied(t, 'proof-wrong')
  // A listener in the middle: it holds the answer that the true engine gave for another number, and plays it again.
  const earlier = 'a'.repeat(64)
  const kinds: [string, (asked: { number: string }, answer: ServerResponse) => void][] = [
    [
      'the answer of the engine to another number',
      (_asked, answer) => said(answer, { proof: tokenProof(token, earlier) }),
    ],
    ['the number itself', (asked, answer) => said(answer, { proof: asked.number })],
    [
      'a fingerprint under another token',
      (asked, answer) => said(answer, { proof: tokenProof('another', asked.number) }),
    ],
    [
      'a proof that is cut short',
      (asked, answer) => said(answer, { proof: tokenProof(token, asked.number).slice(0, 63) }),
    ],
    ['a proof that is no text', (_asked, answer) => said(answer, { proof: 7 })],
    ['what an engine answers a command', (_asked, answer) => said(answer, { epoch: '9.x', machines: [] })],
    ['no JSON', (_asked, answer) => void answer.end('by another program')],
    ['an error', (_asked, answer) => void answer.writeHead(500).end()],
  ]
  const numbers: string[] = []
  for (const [what, answers] of kinds) {
    const listener = await listening(t, answers)
    leftBehind(project, listener.port)
    const output = await typed(project, 'machines', '--json')
    // It was asked the one question, and nothing after it: no token, and no word of the command.
    assert.equal(listener.sent.length, 1, what)
    assert.equal(listener.sent[0].startsWith('POST /_t/admin {'), true, what)
    assert.equal(listener.sent[0].includes(token), false, what)
    assert.equal(listener.sent[0].includes('machines'), false, what)
    assert.match(listener.numbers[0], /^[0-9a-f]{64}$/, what)
    // No engine runs for the command: it says so, and believes nothing that it was answered.
    assert.deepEqual([output.ended, output.answer.findings?.[0].code], [1, 'T0013'], what)
    numbers.push(listener.numbers[0])
  }
  assert.equal(new Set(numbers).size, numbers.length, 'each asking draws a number of its own')
})

test('[15-6@4] a command takes what answers the fingerprint of the token with its number for the engine, and what never answers for none', async (t) => {
  const project = copied(t, 'proof-right')
  // What holds the token is the engine: it is sent the command, with the token.
  const engine = await listening(t, (asked, answer) =>
    asked.path === '/_t/admin'
      ? said(answer, { proof: tokenProof(token, asked.number) })
      : said(answer, { epoch: '1.x', machines: [] }),
  )
  leftBehind(project, engine.port)
  const output = await typed(project, 'machines', '--json')
  assert.deepEqual([output.ended, Object(output.answer.value).epoch], [0, '1.x'])
  assert.deepEqual(
    engine.sent.map((one) => one.split(' ').slice(0, 2).join(' ')),
    ['POST /_t/admin', 'POST /_t/admin/machines'],
  )
  assert.equal(engine.sent[1].includes(`Bearer ${token}`), true)
  // What takes the question and never answers it is no engine: the command ends by itself.
  const silent = await listening(t, () => undefined)
  leftBehind(project, silent.port)
  const began = performance.now()
  const waited = await typed(project, 'machines', '--json')
  assert.deepEqual([waited.ended, waited.answer.findings?.[0].code], [1, 'T0013'])
  assert.equal(silent.sent.length, 1)
  assert.ok(performance.now() - began < 20_000, 'the command does not wait for ever')
})
