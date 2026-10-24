import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { request as sent } from 'node:http'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { buildProject } from '../../build/index.ts'
import { guardedFetch } from '../../connect/index.ts'
import type { App, Engine } from '../../engine/index.ts'
import { createEngine } from '../../engine/index.ts'
import type { Identify, Workspaces, WorkspacesOptions } from '../index.ts'
import { createWorkspaces } from '../index.ts'

/** The caller that is the system. */
export const system = { kind: 'system' } as const

/** The caller that is nobody. */
export const nobody = { kind: 'nobody' } as const

/** The templates of these tests, by their names. */
export const templates = { blank: join(import.meta.dirname, 'blank'), coded: join(import.meta.dirname, 'coded') }

// What each test opened, closed when it ends, the newest first, before its folder is removed.
const closers = new WeakMap<TestContext, (() => unknown)[]>()

/** Has a thing closed when the test ends, before its folder is removed. */
export function closing(t: TestContext, close: () => unknown): void {
  closers.get(t)?.push(close)
}

/** A folder of one test under the folder that git leaves out, removed when the test ends, after what the test closes. */
export function folderOf(t: TestContext): string {
  const all = join(process.cwd(), 'results', 'workspaces')
  mkdirSync(all, { recursive: true })
  const folder = mkdtempSync(join(all, 'work-'))
  // One test may make several folders: what it opened is closed once, before any of them is removed.
  if (!closers.has(t)) {
    const list: (() => unknown)[] = []
    closers.set(t, list)
    t.after(async () => {
      for (const close of list.reverse()) await close()
    })
  }
  t.after(() => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  return folder
}

/**
 * The `identify` of the product of these tests: a request that names a person in `x-test-user` is that person,
 * by the row of their email in the workspace's own `users`, which is added the first time with `call`.
 */
export const identify: Identify = async ({ request, db, call }) => {
  const email = request.headers.get('x-test-user')
  if (!email) return undefined
  // The `db` of `identify` is typed for any table, and the members of a table are reached by their names.
  const of = (thing: unknown, member: string, args: unknown[]): unknown =>
    Reflect.apply(Reflect.get(Object(thing), member), thing, args)
  const found: unknown = await of(of(Reflect.get(Object(db), 'users'), 'where', [{ email }]), 'first', [])
  if (found) return String(Reflect.get(Object(found), 'id'))
  const added: unknown = await call({ definition: 'addUser' }, { email })
  return String(Reflect.get(Object(added), 'id'))
}

/** A product of these tests: its engine, on a port the system gives, its app, and the port. */
export interface Product {
  engine: Engine
  app: App
  port: number
  folder: string
  // The folder of its bundle.
  bundle?: string
}

/** Builds the project of the product of these tests and opens it in an engine of its own, closed when the test ends. */
export async function product(t: TestContext, folder: string, project = 'product'): Promise<Product> {
  const built = await buildProject(join(import.meta.dirname, project), {
    for: 'dev',
    out: join(folder, `${project}-bundle`),
  })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error'),
    [],
  )
  const engine = createEngine({ port: 0 })
  closing(t, () => engine.close())
  const data = join(folder, `${project}-data`)
  const app = await engine.open(built.bundleFolder, { dataFolder: data, mode: 'test' })
  const port = Number(JSON.parse(readFileSync(join(data, 'engine.json'), 'utf8')).port)
  return { engine, app, port, folder, bundle: built.bundleFolder }
}

/** The name under which a workspace of these tests answers. */
export const nameOf = (id: string): string => `${id}.ws.test`

/** The workspaces of a product of these tests, with what they were made over. */
export interface Held extends Product {
  workspaces: Workspaces
  // The folder that holds the workspaces.
  root: string
}

/** The role of the owners of these tests, which the workspaces trust to run their code in the product's program. */
export const trusted = ['builder']

/** Adds an owner of workspaces to the users of a product, with the role that is trusted, and answers its id. */
export async function ownerOf(at: Product, email: string): Promise<string> {
  const [row] = Object(await at.app.write([{ add: 'users', values: { email, roles: trusted } }], { as: 'system' }))
  return String(Object(row).id)
}

/**
 * Makes the workspaces of a product, each at a name of its own on the product's engine, closed when the test ends.
 * The owners that `ownerOf` adds are trusted, unless the options say otherwise.
 */
export async function held(t: TestContext, o: Partial<WorkspacesOptions> = {}, at?: Product): Promise<Held> {
  const made = at ?? (await product(t, folderOf(t)))
  const root = join(made.folder, 'workspaces')
  const workspaces = createWorkspaces({
    engine: made.engine,
    app: made.app,
    folder: root,
    address: (id) => `http://${nameOf(id)}:${made.port}`,
    fetch: guardedFetch({ mode: 'development' }),
    templates,
    trusted,
    ...o,
  })
  closing(t, () => workspaces.close())
  return { ...made, workspaces, root }
}

/** What a request to the engine answered: its status, its headers and its body as text. */
export interface Answered {
  status: number
  headers: Record<string, string>
  body: string
}

/** Sends a request to the engine on this computer under a name, as a browser that reached that name would. */
export function asked(
  port: number,
  name: string,
  path: string,
  o: { method?: string; headers?: Record<string, string>; body?: string; from?: string } = {},
): Promise<Answered> {
  return new Promise((done, failed) => {
    const request = sent(
      {
        host: '127.0.0.1',
        port,
        path,
        method: o.method ?? 'GET',
        headers: {
          host: `${name}:${port}`,
          ...(o.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...o.headers,
        },
        agent: false,
      },
      (answer) => {
        const parts: Buffer[] = []
        answer.on('data', (part: Buffer) => parts.push(part))
        answer.on('end', () =>
          done({
            status: answer.statusCode ?? 0,
            headers: Object.fromEntries(Object.entries(answer.headers).map(([key, value]) => [key, String(value)])),
            body: Buffer.concat(parts).toString('utf8'),
          }),
        )
      },
    )
    request.on('error', failed)
    request.end(o.body)
  })
}

/**
 * Calls a function of the app at a name, as a page does, as the user that `as` names where it names one, and answers
 * the value of the wire form, or the error.
 */
export async function calledAt(
  port: number,
  name: string,
  fn: string,
  input: object,
  headers: Record<string, string> = {},
  as?: string,
): Promise<{ ok: boolean; value?: unknown; error?: { code: string } }> {
  const body = JSON.stringify({ input, ...(as === undefined ? {} : { as }) })
  const answer = await asked(port, name, `/_t/call/${fn}`, { method: 'POST', body, headers })
  return JSON.parse(answer.body)
}

/** Copies a workspace's folder into another folder of workspaces, as a person copies a folder. */
export function copiedTo(from: string, id: string, to: string): void {
  mkdirSync(to, { recursive: true })
  cpSync(join(from, id), join(to, id), { recursive: true })
}
