import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { pathToFileURL } from 'node:url'
import { buildProject } from '../../build/index.ts'
import type { Clock } from '../../core/internal.ts'
import type { App, Engine } from '../../engine/index.ts'
import { createEngine } from '../../engine/index.ts'

/** One message of the live connection, as it was read from JSON. */
type Message = Record<string, unknown>

export const liveMoment = (ms = 10): Promise<void> => new Promise((done) => setTimeout(done, ms))

/** Waits until something holds, and fails where it never does. It waits for what it reads, and for no length of time. */
export async function untilTried(what: string, holds: () => boolean, tries = 1500): Promise<void> {
  for (let i = 0; i < tries && !holds(); i++) await liveMoment()
  assert.equal(holds(), true, `never: ${what}`)
}

/** A clock that stands still until the test moves it, for the engine and for the pages of one test alike. */
export interface Moved {
  clock: Clock
  advance(ms: number): void
  // What a page waits and repeats by, on this clock.
  wait(work: () => void, ms: number): () => void
  every(work: () => void, ms: number): () => void
}

export function movedClock(start: number = Date.UTC(2031, 0, 1)): Moved {
  let now = start
  let timers: { at: number; run: () => void; every?: number }[] = []
  const add = (timer: { at: number; run: () => void; every?: number }): (() => void) => {
    timers.push(timer)
    return () => {
      timers = timers.filter((one) => one !== timer)
    }
  }
  return {
    clock: { now: () => now, setTimer: (at, run) => add({ at, run }) },
    wait: (work, ms) => add({ at: now + ms, run: work }),
    every: (work, ms) => add({ at: now + ms, run: work, every: ms }),
    advance(ms) {
      const to = now + ms
      for (;;) {
        const due = timers.filter((one) => one.at <= to).sort((a, b) => a.at - b.at)[0]
        if (!due) break
        now = Math.max(now, due.at)
        if (due.every === undefined) timers = timers.filter((one) => one !== due)
        else due.at += due.every
        due.run()
      }
      now = to
    },
  }
}

/** The app of the living pages as one test serves it: where it is reached, and what starts its engine again. */
export interface LiveServed {
  app: App
  engine: Engine
  origin: string
  port: number
  bundleFolder: string
  // The folder of every bundle that was built so far, the first one first.
  bundles: string[]
  // The folder of the project that was built, which a test may change, and what builds it anew: it answers the
  // folder of the new bundle and its version, and changes nothing of what runs.
  projectFolder: string
  built(): Promise<{ bundleFolder: string; versionId: string }>
  dataFolder: string
  // Closes the engine and opens the same data in a new one, on the same port, as a program that was started again.
  again(): Promise<void>
  // Names what is done when the test ends, before the engine is closed: a page of the test ends there.
  ended(work: () => void): void
}

/**
 * Builds the project of the living pages and serves it on a port that the system gives, on this computer, with
 * its starter data. The engine is closed and the folder removed when the test ends, also where it fails.
 */
export async function servedLive(
  t: TestContext,
  o: { clock?: Clock; mode?: 'test' | 'development'; project?: string } = {},
): Promise<LiveServed> {
  const all = join(process.cwd(), 'results', 'test')
  mkdirSync(all, { recursive: true })
  // The project of the living pages, where the test names no other of the projects that lie beside these tests.
  const project = o.project ?? 'living'
  const work = mkdtempSync(join(all, `${project}-`))
  const folder = join(work, project)
  cpSync(join(import.meta.dirname, project), folder, { recursive: true })
  const made = await buildProject(folder, { for: 'dev' })
  assert.deepEqual(made.findings, [])
  const dataFolder = join(work, 'data')
  const clock = o.clock
  const start = async (port: number): Promise<{ engine: Engine; app: App }> => {
    // One address holds every page of a test: the connections of an address are bounded far above them.
    const engine = createEngine({
      port,
      web: { openPerAddress: 5000 },
      ...(clock ? { makers: { clock: () => clock } } : {}),
    })
    return { engine, app: await engine.open(made.bundleFolder, { dataFolder, mode: o.mode ?? 'test' }) }
  }
  let running = await start(0)
  const ending: (() => void)[] = []
  t.after(async () => {
    for (const work of ending) work()
    await running.engine.close()
    rmSync(work, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  })
  await running.app.seed()
  const port = Number(JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8')).port)
  const mine: LiveServed = {
    ...running,
    origin: `http://localhost:${port}`,
    port,
    bundleFolder: made.bundleFolder,
    bundles: [made.bundleFolder],
    projectFolder: folder,
    async built() {
      const next = await buildProject(folder, { for: 'dev' })
      assert.deepEqual(next.findings, [])
      mine.bundles.push(next.bundleFolder)
      return { bundleFolder: next.bundleFolder, versionId: next.versionId }
    },
    dataFolder,
    async again() {
      await running.engine.close()
      running = await start(port)
      Object.assign(mine, running)
    },
    ended: (work) => void ending.push(work),
  }
  return mine
}

/** Adds a user as the system, and answers the cookie of a session that the test made for it, with the id of its row. */
export async function signedInLive(
  at: LiveServed,
  name: string,
  roles: string[],
): Promise<{ user: string; cookie: string }> {
  const row = await at.app.call('addUser', { name, roles }, { as: { kind: 'system' } })
  const user = String(Reflect.get(Object(row), 'id'))
  return { user, cookie: at.app.session(user) }
}

/** What a living page answers of one asking. */
interface Held {
  value?: unknown
  error?: Record<string, unknown>
  mark?: string
}

/** A page of the app as it lives with no browser: the page code of the bundle, over real requests and a real connection. */
export interface NodePage {
  // The record that the first HTML held, and the first HTML itself.
  record: Record<string, unknown>
  html: string
  // What the page code holds of the page: asked as a view asks, and called as a press calls.
  ask(what: string, input: unknown, how: object): Held | undefined
  call(name: string, input: unknown): Promise<unknown>
  shows(): string | undefined
  // Every message that the live connection brought, and every message that the page sent, in their order.
  heard: Message[]
  told: Message[]
  // How often the page was told to draw again, the addresses it loaded whole, and the requests it sent.
  drawn(): number
  gone: string[]
  asked: string[]
  // Whether its live connection stands open, how many it has opened so far, and what cuts the one that stands.
  connected(): boolean
  opened(): number
  cut(): void
  // Sends a message of the test's own over the connection of the page.
  send(message: object): void
}

/**
 * Opens an address of the app as a browser would, and brings the page to life with the page code of the bundle,
 * in this program. The page asks through real requests and a real WebSocket. With `timers` it waits and repeats
 * by the clock of the test.
 */
export async function nodePage(
  at: LiveServed,
  path: string,
  o: { cookie?: string; timers?: Pick<Moved, 'wait' | 'every'>; html?: string } = {},
): Promise<NodePage> {
  const headers = { origin: at.origin, ...(o.cookie ? { cookie: o.cookie } : {}) }
  const html = o.html ?? (await (await fetch(at.origin + path, { headers })).text())
  const block = /<script type="application\/json" id="tent-page">([\s\S]*?)<\/script>/.exec(html)?.[1]
  assert.ok(block, 'the first HTML holds the record of the page')
  const record: Record<string, unknown> = JSON.parse(block)
  const description = JSON.parse(readFileSync(join(at.bundleFolder, 'description.json'), 'utf8'))
  const code = await import(pathToFileURL(join(at.bundleFolder, String(description.browser.page.main))).href)
  // A part of the page code that a screen needs gives no record: it holds itself when it is loaded.
  const load = async (files: string[]): Promise<unknown[]> =>
    (
      await Promise.all(
        files.map(async (named) => {
          // A module of development is named at its mark, and lies at its address in every version: the newest
          // bundle holds what the page is told of. Any other file of a later version lies in the bundle that holds it.
          const [file, mark] = named.split('?')
          const holding = at.bundles.filter((bundle) => existsSync(join(bundle, file)))
          const lies = (mark === undefined ? holding[0] : holding.at(-1)) ?? at.bundleFolder
          return (await import(`${pathToFileURL(join(lies, file)).href}${mark === undefined ? '' : `?${mark}`}`))
            .default
        }),
      )
    ).filter((one) => one !== undefined)
  const named = Object(record.load)
  const files: string[] = [named.screen, ...named.parts].filter(
    (file: unknown) => typeof file === 'string' && file !== '',
  )
  const heard: Message[] = []
  const told: Message[] = []
  const gone: string[] = []
  const asked: string[] = []
  const sockets: WebSocket[] = []
  // A page of a test ends with its test: its connection is closed, and it waits for nothing more.
  let over = false
  const timers = new Set<NodeJS.Timeout>()
  at.ended(() => {
    over = true
    for (const timer of timers) clearTimeout(timer)
    for (const socket of sockets) socket.close()
  })
  const wait = (work: () => void, ms: number): (() => void) => {
    const timer = setTimeout(() => {
      timers.delete(timer)
      if (!over) work()
    }, ms)
    timers.add(timer)
    return () => {
      timers.delete(timer)
      clearTimeout(timer)
    }
  }
  const every = (work: () => void, ms: number): (() => void) => {
    let stop = (): void => undefined
    const again = (): void => {
      work()
      stop = wait(again, ms)
    }
    stop = wait(again, ms)
    return () => stop()
  }
  const json = async (address: string, init: RequestInit): Promise<unknown> => {
    asked.push(`${init.method ?? 'GET'} ${address}`)
    return (await fetch(at.origin + address, init)).json()
  }
  const page = code.livingPage(record, await load(files), {
    post: (address: string, body: unknown) =>
      json(address, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    get: (address: string) => json(address, { headers }),
    go: (address: string) => void gone.push(address),
    load,
    shows: () => path,
    wait,
    every,
    ...(o.timers ?? {}),
    socket(address: string, on: { opened(): void; message(text: string): void; closed(): void }) {
      // The runtime's own WebSocket takes the headers of the opening as its second word.
      const socket: WebSocket = Reflect.construct(WebSocket, [at.origin.replace(/^http/, 'ws') + address, { headers }])
      sockets.push(socket)
      if (over) socket.close()
      socket.addEventListener('open', () => on.opened())
      socket.addEventListener('message', (event) => {
        heard.push(JSON.parse(String(event.data)))
        on.message(String(event.data))
      })
      socket.addEventListener('close', () => {
        if (!over) on.closed()
      })
      return {
        send: (text: string) => {
          told.push(JSON.parse(text))
          if (socket.readyState === WebSocket.OPEN) socket.send(text)
        },
        close: () => socket.close(),
      }
    },
  })
  let drawn = 0
  page.listen(() => {
    drawn += 1
  })
  return {
    record,
    html,
    ask: (what, input, how) => page.ask(what, input, how),
    call: (name, input) => page.call(name, input),
    shows: () => page.screen()?.name,
    heard,
    told,
    drawn: () => drawn,
    gone,
    asked,
    connected: () => sockets.at(-1)?.readyState === WebSocket.OPEN,
    opened: () => sockets.length,
    cut: () => sockets.at(-1)?.close(),
    send: (message) => sockets.at(-1)?.send(JSON.stringify(message)),
  }
}

/** The rows of an answer: of a list, and of a page of one. */
export const rowsOf = (value: unknown): Record<string, unknown>[] => {
  const rows: unknown = Array.isArray(value) ? value : Reflect.get(Object(value), 'rows')
  return Array.isArray(rows) ? rows : []
}

/** The titles of the cards of an answer, in their order. */
export const cardTitlesOf = (value: unknown): string[] => rowsOf(value).map((row) => String(row.title))
