import { existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Reach } from '../connect/index.ts'
import { forgetServer, keptKey, runCommandLine } from '../connect/index.ts'
import type { Terminal } from '../core/index.ts'
import type { App } from '../engine/index.ts'
import { createEngine, runnerFolder } from '../engine/index.ts'
import { add, list, originOf, remove } from './added.ts'
import { openLive } from './borrowed/ws.ts'
import { guardOf } from './guarded.ts'
import type { Running } from './reach.ts'
import { engineAt, ownEngine } from './reach.ts'
import { browserSignIn } from './signIn.ts'
import { processTerminal } from './terminal.ts'

/** The words that pick the target, which stand before the command word: the caller, and the data folder. */
function targetFlags(words: string[]): { as?: string; data?: string; rest: string[] } {
  const picked: { as?: string; data?: string } = {}
  const rest: string[] = []
  let word = false
  for (let k = 0; k < words.length; k++) {
    const [flag, given] = words[k].split(/=(.*)/s)
    if (!word && (flag === '--as' || flag === '--data')) {
      const value = given ?? words[++k]
      if (value === undefined) throw new Error(`${flag} needs a value.`)
      picked[flag === '--as' ? 'as' : 'data'] = value
      continue
    }
    if (!words[k].startsWith('--')) word = true
    rest.push(words[k])
  }
  return { ...picked, rest }
}

/** A request of the command line as the engine of this computer takes it: with its admin token and the caller it acts for. */
function local(request: Request, at: Running, as: string): Request {
  const url = new URL(request.url)
  const headers = new Headers(request.headers)
  headers.set('authorization', `Bearer ${at.token}`)
  headers.set('tent-caller', as)
  return new Request(`http://127.0.0.1:${at.port}${url.pathname}${url.search}`, {
    method: request.method,
    headers,
    ...(request.body ? { body: request.body, duplex: 'half' as const } : {}),
  })
}

// The hosts of this computer's own names, which are reached with no secure connection.
const ownHosts = ['localhost', '127.0.0.1', '[::1]']

// How long a request to a server may take, its answer read to the end: the `fetchTime` of a project that states none.
const serverTime = 120_000

/**
 * A reach of an app on a server, which follows no answer that leads to another host, and ends each request, its
 * answer with it, after `serverTime` or when the request is ended.
 */
function serverReach(address: string): Reach {
  const origin = originOf(address)
  const sent = (request: Request): Request => {
    const url = new URL(request.url)
    return new Request(`${origin}${url.pathname}${url.search}`, {
      method: request.method,
      headers: request.headers,
      redirect: 'manual',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(serverTime)]),
      ...(request.body ? { body: request.body, duplex: 'half' as const } : {}),
    })
  }
  return {
    request: (request) => fetch(sent(request)),
    live: (request) => openLive(sent(request).url, Object.fromEntries(request.headers)),
  }
}

/** The name that the list of a server's commands gives, read up to the size of a list, or nothing. */
async function listedName(answer: Response): Promise<string | undefined> {
  const reader = answer.body?.getReader()
  if (!reader) return undefined
  let text = ''
  const decoder = new TextDecoder()
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    text += decoder.decode(read.value, { stream: true })
    // The list is held to the `callSize` of a project that states none.
    if (text.length > 1_048_576) {
      await reader.cancel().catch(() => undefined)
      return undefined
    }
  }
  try {
    const named: unknown = Reflect.get(Object(Reflect.get(Object(JSON.parse(text)), 'value')), 'name')
    return typeof named === 'string' ? named : undefined
  } catch {
    return undefined
  }
}

/** Whether an address is reached over a secure connection, or is this computer's own, or a host that `--insecure` names. */
function secureOrNamed(address: string, insecure: string[]): boolean {
  const url = new URL(address)
  return url.protocol === 'https:' || ownHosts.includes(url.hostname) || insecure.includes(url.hostname.toLowerCase())
}

/** `add`, `list` and `remove`: the addresses of servers whose commands run here. */
async function addresses(word: string, words: string[], home: string, terminal: Terminal): Promise<number> {
  if (word === 'list') return list(home, terminal)
  const insecure: string[] = []
  const given: string[] = []
  for (let k = 0; k < words.length; k++)
    if (words[k] === '--insecure' && words[k + 1]) insecure.push(words[++k].toLowerCase())
    else given.push(words[k])
  const [address, ...rest] = given
  const named = rest.indexOf('--name')
  const name = named < 0 ? undefined : rest[named + 1]
  if (!address || !/^https?:\/\//.test(address)) {
    terminal.error(`tent cli ${word} <the address of a server>\n`)
    return 2
  }
  if (word === 'add' && !secureOrNamed(address, insecure)) {
    terminal.error(
      `${originOf(address)} is reached over no secure connection: name it with --insecure ${new URL(address).hostname} to add it all the same.\n`,
    )
    return 2
  }
  if (word === 'remove') {
    remove(home, address)
    forgetServer(home, address, true)
    return 0
  }
  return add({
    home,
    address,
    ...(name ? { name } : {}),
    yes: rest.includes('--yes'),
    terminal,
    listed: async () => {
      // The key that `login` kept, where the commands are not open to nobody.
      const key = keptKey(home, address)
      const answer = await serverReach(address).request(
        new Request('http://localhost/_t/cli', key ? { headers: { authorization: `Bearer ${key}` } } : {}),
      )
      const named = await listedName(answer)
      return named === undefined ? undefined : { name: named }
    },
  })
}

/** The command line of an app on a server: reached over a secure connection, but this computer's own names and a host that `--insecure` names. */
async function onServer(target: string, after: string[], terminal: Terminal): Promise<number> {
  const insecure: string[] = []
  const rest: string[] = []
  for (let k = 0; k < after.length; k++)
    if (after[k] === '--insecure' && after[k + 1]) insecure.push(after[++k].toLowerCase())
    else rest.push(after[k])
  const url = new URL(target)
  if (rest.includes('--as')) {
    terminal.error('--as is for an app of this computer: a server is reached as the key that is kept for it.\n')
    return 2
  }
  if (!secureOrNamed(target, insecure)) {
    terminal.error(
      `${url.origin} is reached over no secure connection: name it with --insecure ${url.hostname} to send it a key all the same.\n`,
    )
    return 2
  }
  const stop = stopped()
  try {
    return await runCommandLine({
      words: rest,
      terminal,
      reach: serverReach(target),
      home: runnerFolder(),
      target: { local: false, address: originOf(target) },
      env: { TENT_KEY: process.env.TENT_KEY, TENT_AT: process.env.TENT_AT },
      signal: stop.signal,
      signIn: browserSignIn(),
    })
  } finally {
    stop.end()
  }
}

/**
 * What ends when the person stops the command: the first Ctrl+C ends the signal, so that a run is stopped with
 * it, and a second one ends the program as it always does. `end` takes the listener away when the command ends.
 */
function stopped(): { signal: AbortSignal; end(): void } {
  const ends = new AbortController()
  const stop = (): void => ends.abort(new Error('The command was stopped.'))
  process.once('SIGINT', stop)
  return { signal: ends.signal, end: () => void process.off('SIGINT', stop) }
}

/** An app of this computer that this program opened for the length of a command, and what closes it again. */
interface Opened {
  app: App
  close(): Promise<void>
}

/**
 * Runs the command line of an app of this computer, by its data folder: through the engine that runs there, with
 * its admin token, or else through the app that `open` opens in this program for the length of the command.
 * `open` answers how the command ends where it opened nothing.
 */
async function onThisComputer(o: {
  words: string[]
  terminal: Terminal
  data: string
  as: string
  open(): Promise<Opened | number>
}): Promise<number> {
  const stop = stopped()
  // The modules of the app of this computer are kept under the runner's folder, by the path of its data folder.
  const run = (reach: Reach): Promise<number> =>
    runCommandLine({
      words: o.words,
      terminal: o.terminal,
      reach,
      home: runnerFolder(),
      target: { local: true, as: o.as, data: o.data },
      env: {},
      signal: stop.signal,
    })
  try {
    const running = await engineAt(o.data)
    if (running)
      return await run({
        request: (request) => fetch(local(request, running, o.as)),
        live: (request) => {
          const sent = local(request, running, o.as)
          return openLive(sent.url, Object.fromEntries(sent.headers))
        },
      })
    const opened = await o.open()
    if (typeof opened === 'number') return opened
    try {
      const own = ownEngine(o.data)
      // The engine is in this program: the runner reaches it with no network, as a request of this computer.
      return await run({
        request: (request) => opened.app.request(local(request, own, o.as), { from: '127.0.0.1' }),
        live: async (request) => opened.app.live(local(request, own, o.as)),
      })
    } finally {
      await opened.close()
    }
  } finally {
    stop.end()
  }
}

/** Opens a bundle in an engine of this program, on a data folder and in a mode, until it is closed. */
async function bundleOpened(bundle: string, dataFolder: string, mode: 'development' | 'live'): Promise<Opened> {
  const engine = createEngine({ port: 0 })
  try {
    return { app: await engine.open(bundle, { dataFolder, mode }), close: () => engine.close() }
  } catch (error) {
    await engine.close()
    throw error
  }
}

/** Builds a project for development and opens it on its data folder; where the build stops, prints why and answers 2. */
async function projectOpened(project: string, dataFolder: string, terminal: Terminal): Promise<Opened | number> {
  // The build tools are loaded only where a project is built: an install of the player alone runs a bundle.
  const { buildProject } = await import('../build/index.ts')
  const built = await buildProject(project, { for: 'dev', ...guardOf(project, dataFolder) })
  const errors = built.findings.filter((one) => one.level === 'error')
  if (!errors.length) return bundleOpened(built.bundleFolder, dataFolder, 'development')
  for (const one of errors) terminal.error(`error ${one.code}: ${one.message}\n`)
  return 2
}

/**
 * `tent cli <target> <words>`: the runner of an app's command line, with no launcher. The target is the folder of
 * a project, with `--data` its data folder; a bundle folder with `--data`; or the address of a server. With an
 * engine running on that data folder the runner reaches it over this computer's own network, with its admin
 * token; with none, it opens the app in this program for the length of the command: a project is built and opened
 * on the development data. `--as` names the caller, the system where it is left out. `add`, `list` and `remove`
 * handle the addresses of servers. Answers how the command ends.
 */
export async function commandLine(words: string[], folder: string): Promise<number> {
  const [target, ...after] = words
  const { terminal, close } = processTerminal()
  try {
    if (target === undefined) {
      terminal.error('tent cli <a project, a bundle with --data, or the address of a server> <command> [flags]\n')
      return 2
    }
    const home = runnerFolder()
    if (['add', 'list', 'remove'].includes(target)) return await addresses(target, after, home, terminal)
    if (/^https?:\/\//.test(target)) return await onServer(target, after, terminal)
    const place = resolve(folder, target)
    const picked = targetFlags(after)
    const as = picked.as ?? 'system'
    const here = { words: picked.rest, terminal, as }
    // A file, or a path that is not there, is no target: it is refused as `tent start` refuses what holds no bundle.
    if (!existsSync(place) || !statSync(place).isDirectory()) {
      terminal.error(
        `error T0011: ${place} is no folder of a project or of a bundle. tent cli <a project, a bundle with --data, or the address of a server> <command> [flags]\n`,
      )
      return 2
    }
    if (existsSync(join(place, 'description.json')) && !existsSync(join(place, 'tent.ts'))) {
      if (picked.data === undefined) {
        terminal.error(`tent cli ${target} names a bundle: name its data folder with --data <folder>.\n`)
        return 2
      }
      const data = resolve(folder, picked.data)
      return await onThisComputer({ ...here, data, open: () => bundleOpened(place, data, 'live') })
    }
    const data = picked.data === undefined ? join(place, '.tent') : resolve(place, picked.data)
    return await onThisComputer({ ...here, data, open: () => projectOpened(place, data, terminal) })
  } finally {
    close()
  }
}
