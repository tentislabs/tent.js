import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable, Writable } from 'node:stream'
import { TentError } from '../../core/index.ts'
import { commandsOver } from './channel.ts'
import { endProgram } from './endProgram.ts'

type Params = Record<string, unknown>

// How long a browser is given to answer that it closes, and then to end by itself.
const closeTime = 5_000

/**
 * A page that the engine drives in a browser over its own channel for being driven: what it sends, and what it
 * hears. Each page is a browser context of its own, with its own cookies, storage, cache and first script.
 */
export interface Driven {
  // Sends a command of the channel to the page, and answers what the browser answered.
  send(method: string, params?: Params): Promise<Params>
  // Names what is told each event of the page of that name.
  on(method: string, heard: (params: Params) => void): void
  // Ends the page: its context is closed, and the browser stays for the next page of the program.
  end(): Promise<void>
}

// How long a browser that was started is given to answer its first command.
const startTime = 20_000

/**
 * Whether this system refuses the sandbox of Chromium to a program, which needs namespaces of its own: Linux refuses
 * them to root, and Ubuntu from 23.10 to a program that no AppArmor profile names, as the browsers that tests fetch
 * into a person's own folder are. A browser installed in the system's own places, as Chrome, Edge or a snap, has a
 * profile or a sandbox of its own, and keeps it.
 */
function sandboxRefused(program: string): boolean {
  if (process.platform !== 'linux') return false
  if (process.getuid?.() === 0) return true
  if (/^\/(usr|opt|snap)\//.test(program)) return false
  try {
    return readFileSync('/proc/sys/kernel/apparmor_restrict_unprivileged_userns', 'utf8').trim() === '1'
  } catch {
    return false
  }
}

/** A browser of the program: its channel, what each of its pages hears, and whether it ended. */
interface Kept {
  program: ChildProcess
  folder: string
  raw(method: string, params?: Params, inside?: string, within?: number): Promise<Params>
  // Answers every command a page still waits on with its failure, at once: it holds the program no longer.
  letGo(session: string): void
  heard: Map<string, Map<string, ((params: Params) => void)[]>>
  ended: boolean
}

// The browser of the program for each program of a browser, started at its first page: a page is a context of it,
// as Playwright's runner keeps one browser and gives each test a context, a few megabytes in place of a hundred.
const kept = new Map<string, Promise<Kept>>()
// Each browser this program started, by the number of its program, which a test of the engine reads.
const started: { pid: number; ended: () => boolean }[] = []

/** The browsers this program started, each with the number of its program and whether it ended. */
export const startedBrowsers = (): { pid: number; ended: boolean }[] =>
  started.map((one) => ({ pid: one.pid, ended: one.ended() }))

/**
 * Takes the program of a browser of the Chromium family. Starts it with no window, in a folder of its own, over the
 * browser's own channel for being driven, which is a pair of pipes of this program: no other program of the computer
 * can reach it, as it could a port. It holds this program open only while a command waits for its answer, and ends
 * when this program ends. Throws T0016 where it does not answer within twenty seconds.
 */
async function startedBrowser(program: string): Promise<Kept> {
  const folder = mkdtempSync(join(tmpdir(), 'tent-shot-'))
  // With `--remote-debugging-pipe` the browser reads its commands from its fourth stream and writes on its fifth,
  // each message ended by a zero byte, as playwright-core 1.64 drives it (`PipeTransport` of its `coreBundle.js`).
  const browser = spawn(
    program,
    [
      '--headless=new',
      '--remote-debugging-pipe',
      `--user-data-dir=${folder}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-sync',
      '--hide-scrollbars',
      '--mute-audio',
      // Where the system refuses the sandbox the browser runs without one, as playwright-core starts it everywhere.
      ...(sandboxRefused(program) ? ['--no-sandbox'] : []),
      'about:blank',
    ],
    // On Linux and macOS the browser leads a group of its own, with the programs it starts: the group ends as one.
    { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' },
  )
  const [, , , toBrowser, fromBrowser] = browser.stdio
  if (!(toBrowser instanceof Writable) || !(fromBrowser instanceof Readable)) {
    await endProgram(browser, folder, 0)
    throw new TentError('T0016', 'The browser was started with no channel to drive it.')
  }
  // A pipe that the browser closed by ending is no failure of this program.
  toBrowser.on('error', () => undefined)
  fromBrowser.on('error', () => undefined)
  // The browser holds this program open while a command waits, and no longer: it ends with the program.
  const pipes = [toBrowser, fromBrowser].filter((one) => one instanceof Socket)
  let waiting = 0
  const hold = (by: number): void => {
    waiting += by
    browser[waiting > 0 ? 'ref' : 'unref']()
    for (const pipe of pipes) pipe[waiting > 0 ? 'ref' : 'unref']()
  }
  hold(0)
  const running = (): boolean => browser.exitCode === null && browser.signalCode === null
  const killed = (): void => {
    // A browser asked to end on Linux and macOS closes its windows first and writes into its folder after it was
    // taken away, outliving this program: it and its helpers are ended where they stand, as Windows ends a program.
    if (running())
      try {
        if (process.platform === 'win32' || browser.pid === undefined) browser.kill()
        else process.kill(-browser.pid, 'SIGKILL')
      } catch {
        browser.kill('SIGKILL')
      }
  }
  const removed = (): void => {
    try {
      // The browser lets its files go a moment after it was ended: the removal tries again for three seconds.
      rmSync(folder, { recursive: true, force: true, maxRetries: 30, retryDelay: 100 })
    } catch {
      // What the browser still holds as it ends is left in the folder of passing files of the system.
    }
  }
  // As this program runs out of work, the browser is ended and waited for until the system has gathered its end: a
  // program that ends at once leaves an ended browser that the system still counts, on Linux and macOS, until another
  // program gathers it.
  const outOfWork = (): void => {
    if (!running()) return
    browser.ref()
    killed()
  }
  process.once('beforeExit', outOfWork)
  // A program that is made to end runs no more work: the browser is ended where it stands.
  const ending = (): void => {
    killed()
    removed()
  }
  process.once('exit', ending)
  const commands = commandsOver((text) => void toBrowser.write(`${text}\0`), 'The channel of the browser')
  // What fails each command that a page waits on, by the session of the page.
  const waits = new Map<string, Set<(error: Error) => void>>()
  const made: Kept = {
    program: browser,
    folder,
    heard: new Map(),
    ended: false,
    raw: (method, params = {}, inside, within) =>
      new Promise<Params>((done, failed) => {
        hold(1)
        const ofPage = inside === undefined ? undefined : (waits.get(inside) ?? new Set())
        if (inside !== undefined && ofPage) waits.set(inside, ofPage)
        let waiting = true
        const settled = (): void => {
          if (!waiting) return
          waiting = false
          hold(-1)
          ofPage?.delete(fail)
        }
        const fail = (error: Error): void => {
          settled()
          failed(error)
        }
        ofPage?.add(fail)
        commands.send({ method, params, ...(inside ? { sessionId: inside } : {}) }, within).then((value) => {
          settled()
          done(value)
        }, fail)
      }),
    letGo: (session) => {
      for (const fail of waits.get(session) ?? []) fail(new Error('The page of the browser was ended.'))
      waits.delete(session)
    },
  }
  started.push({ pid: browser.pid ?? 0, ended: () => made.ended })
  const lost = (): void => {
    made.ended = true
    commands.closed()
  }
  fromBrowser.on('close', lost)
  browser.on('exit', () => {
    lost()
    process.removeListener('beforeExit', outOfWork)
    process.removeListener('exit', ending)
    removed()
  })
  let pending = ''
  fromBrowser.on('data', (piece: Buffer) => {
    const parts = `${pending}${piece.toString()}`.split('\0')
    pending = parts.pop() ?? ''
    for (const part of parts) take(part)
  })
  const take = (text: string): void => {
    let told: unknown
    try {
      told = JSON.parse(text)
    } catch {
      return
    }
    const message: Params = typeof told === 'object' && told !== null ? Object(told) : {}
    if (typeof message.id === 'number') {
      commands.answer(
        message.id,
        message.error
          ? { error: new Error(String(Object(message.error).message)) }
          : { value: Object(message.result ?? {}) },
      )
      return
    }
    // Each event is told to the page whose session it came by, and to no other.
    if (typeof message.method === 'string' && typeof message.sessionId === 'string')
      for (const one of made.heard.get(message.sessionId)?.get(message.method) ?? []) one(Object(message.params ?? {}))
  }
  // The first answer is the browser's word that it started.
  await made.raw('Browser.getVersion', {}, undefined, startTime).catch(async (error: unknown) => {
    await endProgram(browser, folder, 0)
    throw error instanceof TentError
      ? new TentError('T0016', 'The browser did not start within twenty seconds.')
      : new TentError('T0016', 'The browser ended before it could be driven.')
  })
  return made
}

/**
 * The browser of the program for a program of a browser: started at its first page, and again where it was lost.
 * Pages asked for at once wait on the one start: the start is kept before anything is waited for.
 */
async function browserOf(program: string): Promise<Kept> {
  for (;;) {
    const held = kept.get(program)
    if (held === undefined) {
      const made = startedBrowser(program)
      kept.set(program, made)
      return made
    }
    const one = await held.catch(() => undefined)
    if (one && !one.ended) return one
    if (kept.get(program) === held) kept.delete(program)
  }
}

/**
 * Takes the program of a browser of the Chromium family. Opens one page in the browser of the program, starting it
 * at its first page: a browser context of its own (`Target.createBrowserContext`), a target in it and a session
 * attached to that target, whose events are told to this page alone. Answers what drives that page. Throws T0016
 * where the browser does not start within twenty seconds.
 */
export async function driven(program: string): Promise<Driven> {
  const browser = await browserOf(program)
  try {
    return await pageIn(browser)
  } catch (error) {
    // A browser that was ending as the page was opened, as one that was sent a signal to end on Linux and macOS and
    // still answers while it closes, is started again for the page, once.
    if (!browser.ended) throw error
    return pageIn(await browserOf(program))
  }
}

/** Opens one page in a browser of the program, as `driven` says. */
async function pageIn(browser: Kept): Promise<Driven> {
  const context = String((await browser.raw('Target.createBrowserContext', { disposeOnDetach: true })).browserContextId)
  const close = (): Promise<unknown> =>
    browser
      .raw('Target.disposeBrowserContext', { browserContextId: context }, undefined, closeTime)
      .catch(() => undefined)
  let session: string
  try {
    const made = await browser.raw('Target.createTarget', { url: 'about:blank', browserContextId: context })
    session = String((await browser.raw('Target.attachToTarget', { targetId: made.targetId, flatten: true })).sessionId)
  } catch (error) {
    await close()
    throw error
  }
  const heard = new Map<string, ((params: Params) => void)[]>()
  browser.heard.set(session, heard)
  // A command of an ended page fails at once, as one of a browser that ended does.
  let ended = false
  return {
    send: (method, params) =>
      ended || browser.ended
        ? Promise.reject(new Error('The page of the browser was ended.'))
        : browser.raw(method, params, session),
    on: (method, one) => heard.set(method, [...(heard.get(method) ?? []), one]),
    async end() {
      if (ended) return
      ended = true
      browser.letGo(session)
      browser.heard.delete(session)
      await close()
    },
  }
}
