import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { bundled, codeOf, engineOf, refusal, workFolder } from './apps.ts'

const holder = fileURLToPath(new URL('./held/holder.ts', import.meta.url))

const heldIn = (dataFolder: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8'))

/** A program that runs and is no engine, ended with the test by its own number. */
function otherProgram(t: TestContext): number {
  const other = spawn(process.execPath, ['-e', 'setTimeout(() => undefined, 120000)'], { stdio: 'ignore' })
  t.after(() => void other.kill())
  return Number(other.pid)
}

/** Something that listens on a port of this computer and answers every request with one text. Answers its port and what it was sent. */
function listening(t: TestContext, answers: string): Promise<{ port: number; sent: string[] }> {
  const sent: string[] = []
  const server = createServer((request, answer) => {
    const parts: Buffer[] = []
    request.on('data', (part: Buffer) => parts.push(part))
    request.on('end', () => {
      sent.push(`${request.method} ${request.url} ${JSON.stringify(request.headers)} ${Buffer.concat(parts)}`)
      answer.writeHead(200, { 'content-type': 'application/json' })
      answer.end(answers)
    })
  })
  t.after(() => {
    server.closeAllConnections()
    server.close()
  })
  return new Promise((done) => {
    server.listen(0, '127.0.0.1', () => {
      const at = server.address()
      done({ port: typeof at === 'object' && at ? at.port : 0, sent })
    })
  })
}

const token = 'the-token-of-an-engine-that-was-killed-0123456789'

test('[15-6@4] an engine that was killed is opened again where another program has its number since: nothing proves that it holds the token, so the file was left behind and is made anew', async (t) => {
  const work = workFolder(t)
  const bundle = await bundled(t, {}, work)
  const dataFolder = join(work, 'data')
  const first = engineOf(t)
  await first.open(bundle.folder, { dataFolder, mode: 'test' })
  await first.close()
  const pid = otherProgram(t)
  // Another program listens on the port, and answers as an engine would, but for the proof.
  const other = await listening(t, JSON.stringify({ ok: true, value: { proof: 'f'.repeat(64) } }))
  // The port 1 is one that nothing listens on.
  for (const port of [1, other.port]) {
    writeFileSync(join(dataFolder, 'engine.json'), JSON.stringify({ port, token, pid, mode: 'test' }))
    const engine = engineOf(t)
    const app = await engine.open(bundle.folder, { dataFolder, mode: 'test' })
    assert.equal(heldIn(dataFolder).pid, process.pid)
    assert.notEqual(heldIn(dataFolder).token, token)
    assert.equal(app.role, 'writer')
    await engine.close()
  }
  // What listens was asked for the proof alone: it was sent a number, and neither the token nor anything else.
  assert.equal(other.sent.length, 1)
  assert.match(other.sent[0], /^POST \/_t\/admin .*"number":"[0-9a-f]{64}"/)
  assert.equal(other.sent[0].includes(token), false)
})

test('[15-6@4] an engine refuses a data folder that an engine of another program holds open, which proves that it holds the token; once that program is gone the folder opens', async (t) => {
  const work = workFolder(t)
  const bundle = await bundled(t, {}, work)
  const dataFolder = join(work, 'data')
  const child = spawn(process.execPath, [holder, bundle.folder, dataFolder], { stdio: ['ignore', 'pipe', 'inherit'] })
  const gone = new Promise<void>((done) => child.once('exit', () => done()))
  t.after(async () => {
    child.kill()
    await gone
  })
  await new Promise<void>((done) => child.stdout.once('data', () => done()))
  const engine = engineOf(t)
  const refused = await refusal(engine.open(bundle.folder, { dataFolder, mode: 'test' }))
  assert.equal(refused.code, 'T0013')
  assert.match(refused.message, new RegExp(`in the program ${child.pid}\\b`))
  // The file of the other engine stands as it wrote it.
  assert.equal(heldIn(dataFolder).pid, child.pid)
  child.kill()
  await gone
  assert.equal(await codeOf(engine.open(bundle.folder, { dataFolder, mode: 'test' })), undefined)
  assert.equal(heldIn(dataFolder).pid, process.pid)
})
