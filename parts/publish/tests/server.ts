import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { buildProject, describeProject } from '../../build/index.ts'
import { guardedFetch } from '../../connect/index.ts'
import type { Description } from '../../core/internal.ts'
import type { App, Engine } from '../../engine/index.ts'
import type { Makers } from '../../engine/index.ts'
import { createEngine, writeKey } from '../../engine/index.ts'
import type { History } from '../../history/index.ts'
import { openHistory } from '../../history/index.ts'
import type { Target } from '../index.ts'
import { serveSync } from '../index.ts'

/** Who writes the points of a computer of these tests. */
export const ada = { kind: 'person', id: 'ada' } as const

/** The fetch of a computer of these tests: it reaches this computer, as a command does in development. */
export const fetched = guardedFetch({ mode: 'development' })

// What each test opened, closed when it ends, the newest first, before its folder is removed.
const closers = new WeakMap<TestContext, (() => unknown)[]>()

/** Has a thing closed when the test ends, before its folder is removed. */
export function closing(t: TestContext, close: () => unknown): void {
  closers.get(t)?.push(close)
}

/** A folder of one test under the folder that git leaves out, removed when the test ends, after what the test closes. */
export function folderOf(t: TestContext): string {
  const all = join(process.cwd(), 'results', 'publish')
  mkdirSync(all, { recursive: true })
  const folder = mkdtempSync(join(all, 'work-'))
  const list: (() => unknown)[] = []
  closers.set(t, list)
  t.after(async () => {
    for (const close of list.reverse()) await close()
    rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  })
  return folder
}

/** A server of these tests: an engine that runs the project `shop` and serves its history, and how to reach it. */
export interface Server {
  engine: Engine
  app: App
  history: History
  data: string
  address: string
  // A key of the server that holds the rights it is given, exactly.
  key(rights: string[]): Target
}

/**
 * Starts a server: the project `shop` is built and run in an engine on a port the system gives, with its own
 * data folder, and `serveSync` puts its history behind the addresses of publishing. Everything is closed when the
 * test ends, before its folder is removed.
 */
export async function started(
  t: TestContext,
  folder: string,
  o: {
    mode?: 'test' | 'live'
    limits?: string
    open?: { address?: string | string[]; insecure?: boolean; makers?: Makers }
    // The project of these tests that the server runs: `shop` where none is named.
    project?: string
  } = {},
): Promise<Server> {
  const mode = o.mode ?? 'live'
  const project = join(folder, 'server-project')
  cpSync(join(import.meta.dirname, o.project ?? 'shop'), project, { recursive: true })
  if (o.limits)
    writeFileSync(
      join(project, 'tent.ts'),
      `import { project } from 'tentjs'\n\nexport const shop = project('shop', { title: 'Shop', limits: ${o.limits} })\n`,
    )
  const built = await buildProject(project, { for: 'release', out: join(folder, 'bundle') })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error'),
    [],
  )
  const data = join(folder, 'server-data')
  const engine = createEngine({ port: 0 })
  let history: History | undefined
  closing(t, async () => {
    await engine.close()
    history?.close()
  })
  const app = await engine.open(built.bundleFolder, { dataFolder: data, mode, ...o.open })
  history = openHistory(data)
  serveSync(engine, app, history)
  const port = Number(JSON.parse(readFileSync(join(data, 'engine.json'), 'utf8')).port)
  const address = `http://127.0.0.1:${port}`
  return {
    engine,
    app,
    history,
    data,
    address,
    key: (rights) => ({ address, key: writeKey(app, { name: rights.join(' '), rights }).key }),
  }
}

/** A computer of these tests: a copy of the project `shop` with its own history. */
export interface Computer {
  project: string
  history: History
  // Records the files as they stand, with their description, as a point that no later save joins, and answers it.
  save(): Promise<string>
  // Changes the text of a file, which must hold what is replaced.
  edit(path: string, from: string, to: string): void
}

/** The description of a project as its files stand, which must describe with no error. */
export async function describedNow(project: string): Promise<Description> {
  const { description, findings } = await describeProject(project)
  assert.deepEqual(
    findings.filter((one) => one.level === 'error').map((one) => `${one.code} ${one.message}`),
    [],
  )
  return description
}

/** Makes a computer under a folder of a test, by a name of its own. Its history is closed when the test ends. */
export function computer(t: TestContext, folder: string, name: string, from?: string): Computer {
  const project = join(folder, name)
  cpSync(from ?? join(import.meta.dirname, 'shop'), project, { recursive: true })
  const history = openHistory(join(project, '.tent'))
  closing(t, () => history.close())
  return {
    project,
    history,
    async save() {
      return history.record(project, {
        by: ada,
        kind: 'command',
        checked: true,
        description: await describedNow(project),
      }).id
    },
    edit(path, from, to) {
      const lies = join(project, path)
      const text = readFileSync(lies, 'utf8')
      assert.ok(text.includes(from), `${path} holds ${JSON.stringify(from)}`)
      writeFileSync(lies, text.replace(from, to))
    },
  }
}

/** Sends one request to an address of a server as a program does, with a key or with none. */
export async function sent(
  server: Server,
  path: string,
  body: unknown,
  key?: string,
  type = 'application/json',
): Promise<{ status: number; answer: Record<string, unknown> }> {
  const answer = await fetch(`${server.address}${path}`, {
    method: 'POST',
    headers: { 'content-type': type, ...(key ? { authorization: `Bearer ${key}` } : {}) },
    body: body instanceof Uint8Array ? new Uint8Array(body) : JSON.stringify(body),
  })
  const text = await answer.text()
  let read: unknown
  try {
    read = JSON.parse(text)
  } catch {
    read = { text }
  }
  return { status: answer.status, answer: Object(read) }
}
