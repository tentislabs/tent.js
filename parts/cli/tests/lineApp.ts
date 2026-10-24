import assert from 'node:assert/strict'
import { cpSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { buildProject } from '../../build/index.ts'
import { runCommandLine } from '../../connect/index.ts'
import type { Terminal } from '../../core/index.ts'
import type { App } from '../../engine/index.ts'
import { createEngine } from '../../engine/index.ts'
import { copied } from './typed.ts'

const system = { kind: 'system' } as const

// How many projects the tests of this program opened: with the number of the program, each has a folder of its own.
let opening = 0

/**
 * The project of the commands, built, with an engine that runs on its development data for the length of the test.
 * `commands` copies the command files of these tests into it, under `commands/`.
 */
export async function openedCommands(
  t: TestContext,
  o: { commands?: boolean } = {},
): Promise<{ app: App; project: string; data: string }> {
  // The engine is closed before its folder is removed: the hooks of a test run in the order they were given.
  const engine = createEngine({ port: 0 })
  t.after(() => engine.close())
  const project = copied(t, `line-${process.pid}-${++opening}`, 'commanded')
  if (o.commands) cpSync(join(import.meta.dirname, 'commandFiles'), join(project, 'commands'), { recursive: true })
  const built = await buildProject(project, { for: 'dev' })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error'),
    [],
  )
  const data = join(project, '.tent')
  const app = await engine.open(built.bundleFolder, { dataFolder: data, mode: 'test' })
  return { app, project, data }
}

/** What a run of the command line printed, to the output and to the error output, and how it ended. */
export interface RanLine {
  ended: number
  out: string
  err: string
}

/**
 * Runs the command line of the app in this program, as `cli` does on this computer: each request carries the admin
 * token of the engine and the caller that `as` names, `system` where it names none. `lines` are what a person
 * types, and `keys` the keys they press.
 */
export async function ranLine(
  app: App,
  data: string,
  words: string[],
  o: { as?: string; lines?: string[]; keys?: string[]; interactive?: boolean } = {},
): Promise<RanLine> {
  const { token, port } = JSON.parse(readFileSync(join(data, 'engine.json'), 'utf8'))
  const [out, err]: string[][] = [[], []]
  const typed = [...(o.lines ?? [])]
  const pressed = [...(o.keys ?? [])]
  const terminal: Terminal = {
    write: (text) => void out.push(text),
    error: (text) => void err.push(text),
    raw: (text) => void out.push(`<raw>${text}`),
    line: async () => typed.shift(),
    keys: async function* () {
      for (const name of pressed) yield { name, text: name, ctrl: false, alt: false, shift: false }
    },
    size: () => ({ columns: 80, rows: 24 }),
    onResize: () => () => undefined,
    interactive: o.interactive === true,
    color: false,
  }
  // The app is reached by the name of this computer and its port, as over the network, as the caller named.
  const sent = (request: Request): Request => {
    const headers = new Headers(request.headers)
    headers.set('authorization', `Bearer ${token}`)
    headers.set('tent-caller', o.as ?? 'system')
    const { pathname, search } = new URL(request.url)
    return new Request(`http://127.0.0.1:${port}${pathname}${search}`, {
      method: request.method,
      headers,
      ...(request.body ? { body: request.body, duplex: 'half' as const } : {}),
    })
  }
  const reach = {
    request: (request: Request) => app.request(sent(request), { from: '127.0.0.1' }),
    live: async (request: Request) => app.live(sent(request)),
  }
  const ended = await runCommandLine({
    words,
    terminal,
    reach,
    home: data,
    target: { local: true, ...(o.as ? { as: o.as } : {}) },
    env: {},
  })
  return { ended, out: out.join(''), err: err.join('') }
}

/** Adds a user, and answers the id of its row. */
export async function userOf(app: App, name: string, roles: string[] = []): Promise<string> {
  await app.call('addUser', { name, roles }, { as: system })
  const rows = await app.read({ from: 'users' }, { as: system })
  return String(Object((Array.isArray(rows) ? rows : []).find((one) => Object(one).name === name)).id)
}

/** The address of the engine that runs on a data folder, by the name of this computer and its port. */
export const here = (data: string): string =>
  `http://127.0.0.1:${JSON.parse(readFileSync(join(data, 'engine.json'), 'utf8')).port}`

/** The id of the version that an app runs. */
export const runningVersion = (app: App): string => String(app.versions().find((one) => one.running)?.id)

/** The value of what a command printed with `--json`, in the wire form. */
export const valueOf = (printed: string): unknown => Reflect.get(Object(JSON.parse(printed)), 'value')
