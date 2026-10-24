import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { request as plainRequest } from 'node:http'
import { request as secureRequest } from 'node:https'
import { createServer } from 'node:net'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { TLSSocket } from 'node:tls'
import { fileURLToPath } from 'node:url'
import { buildProject } from '../../build/index.ts'
import { startWords } from './startWords.ts'
import { shell } from './typed.ts'

// What the tests of an app that runs as its own server share: the shop of `secureShop/`, built for each test, free
// ports of this computer, `tent start` as a program of its own, and requests by a name over the secure port and
// over the plain one, which reach this computer whatever name they carry.

const shop = fileURLToPath(new URL('./secureShop/', import.meta.url))

// What each test started, ended before its folders are removed: a program that runs holds its files.
const endings = new WeakMap<TestContext, (() => Promise<unknown>)[]>()

/** Hands a test what is to be ended with it, before its folders are removed. */
export function endedBeforeFolders(t: TestContext, end: () => Promise<unknown>): void {
  endings.set(t, [...(endings.get(t) ?? []), end])
}

/** An empty folder for one test under the folder that git leaves out, removed when the test ends. */
export function workOf(t: TestContext, name: string): string {
  const folder = join(process.cwd(), 'results', 'secure', `${name}-${process.pid}-${Date.now()}`)
  mkdirSync(folder, { recursive: true })
  t.after(async () => {
    const ends = endings.get(t) ?? []
    endings.delete(t)
    for (const one of ends.reverse()) await one()
    rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  })
  return folder
}

/** Copies the shop into a folder and builds it. Answers the folder of the project and of its bundle. */
export async function builtShop(folder: string): Promise<{ project: string; bundle: string; versionId: string }> {
  const project = join(folder, 'shop')
  cpSync(shop, project, { recursive: true })
  const built = await buildProject(project, { for: 'release' })
  const errors = built.findings.filter((one) => one.level === 'error')
  if (errors.length) throw new Error(errors.map((one) => `${one.code} ${one.message}`).join(', '))
  return { project, bundle: built.bundleFolder, versionId: built.versionId }
}

/** A port of this computer that was free a moment ago. */
export async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const at = server.address()
  await new Promise<void>((done) => server.close(() => done()))
  return typeof at === 'object' && at ? at.port : 0
}

/** Writes the root of an authority into a file of the folder, as `--secure roots=` takes it. Answers the file. */
export function rootsIn(folder: string, root: string): string {
  const file = join(folder, 'roots.pem')
  writeFileSync(file, root)
  return file
}

/** `tent start` as a program of its own: what it printed, its end, and what ends it. */
export interface TentStart {
  child: ChildProcess
  out: string[]
  err: string[]
  ended: Promise<number | null>
  stop(): Promise<number | null>
}

/** Starts `tent start` with the words that follow it, ended with the test by its own number and no other. */
export function startTent(
  t: TestContext,
  words: string[],
  o: { cwd: string; env?: Record<string, string> },
): TentStart {
  const child = spawn(process.execPath, [shell, ...startWords(['start', ...words])], {
    cwd: o.cwd,
    env: { ...process.env, TENT_NOTICES: 'off', ...o.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const out: string[] = []
  const err: string[] = []
  child.stdout?.setEncoding('utf8').on('data', (part: string) => out.push(part))
  child.stderr?.setEncoding('utf8').on('data', (part: string) => err.push(part))
  const ended = new Promise<number | null>((done) => child.once('exit', (code) => done(code)))
  const stop = async (): Promise<number | null> => {
    if (child.exitCode === null && child.signalCode === null) child.kill()
    return ended
  }
  endedBeforeFolders(t, stop)
  return { child, out, err, ended, stop }
}

/** What a request was answered: its status, its headers, its body as text, and over a secure connection the fingerprint of its certificate. */
export interface Asked {
  status: number
  headers: Record<string, string | string[] | undefined>
  body: string
  fingerprint?: string
}

/**
 * Asks the secure port of this computer for a path, as the name it is handed, held to the roots. Refused where
 * the connection is closed, as at its start for a name that has no certificate.
 */
export function securely(port: number, name: string, path: string, roots: string): Promise<Asked> {
  return new Promise((done, failed) => {
    const asked = secureRequest(
      {
        host: '127.0.0.1',
        port,
        path,
        servername: name,
        headers: { host: `${name}:${port}` },
        ca: roots,
        agent: false,
      },
      (answer) => {
        const parts: Buffer[] = []
        const fingerprint =
          answer.socket instanceof TLSSocket ? answer.socket.getPeerX509Certificate()?.fingerprint256 : undefined
        answer.on('data', (part: Buffer) => parts.push(part))
        answer.on('end', () =>
          done({
            status: answer.statusCode ?? 0,
            headers: answer.headers,
            body: Buffer.concat(parts).toString('utf8'),
            ...(fingerprint ? { fingerprint } : {}),
          }),
        )
      },
    )
    asked.on('error', failed)
    asked.setTimeout(10_000, () => asked.destroy(new Error('no answer within 10 seconds')))
    asked.end()
  })
}

/** Asks the plain port of this computer for a path, as the name it is handed. */
export function plainly(port: number, name: string, path: string): Promise<Asked> {
  return new Promise((done, failed) => {
    const asked = plainRequest({ host: '127.0.0.1', port, path, headers: { host: name }, agent: false }, (answer) => {
      const parts: Buffer[] = []
      answer.on('data', (part: Buffer) => parts.push(part))
      answer.on('end', () =>
        done({ status: answer.statusCode ?? 0, headers: answer.headers, body: Buffer.concat(parts).toString('utf8') }),
      )
    })
    asked.on('error', failed)
    asked.setTimeout(10_000, () => asked.destroy(new Error('no answer within 10 seconds')))
    asked.end()
  })
}

/** Waits until the secure port serves a name, and answers what it served first. Fails after its time. */
export async function served(port: number, name: string, roots: string, within = 60_000): Promise<Asked> {
  const ends = Date.now() + within
  let last: unknown
  for (;;) {
    try {
      return await securely(port, name, '/_t/health', roots)
    } catch (error) {
      last = error
    }
    if (Date.now() > ends) throw new Error(`${name} was not served on ${port} within ${within} ms: ${String(last)}`)
    await new Promise((done) => setTimeout(done, 200))
  }
}

/** Waits until a condition holds, looking again after each short pause, and fails with what it waited for. */
export async function untilMinute(
  holds: () => boolean | Promise<boolean>,
  what: string,
  within = 60_000,
): Promise<void> {
  const ends = Date.now() + within
  while (!(await holds())) {
    if (Date.now() > ends) throw new Error(`waited in vain for ${what}`)
    await new Promise((done) => setTimeout(done, 100))
  }
}
