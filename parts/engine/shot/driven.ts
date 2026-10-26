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
    { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] },
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
  const ending = (): void => {
    if (browser.exitCode === null && browser.signalCode === null) browser.kill()
    try {
      // The browser lets its files go a moment after it was ended: the removal tries again for three seconds.
      rmSync(folder, { recursive: true, force: true, maxRetries: 30, retryDelay: 100 })
    } catch {
      // What the browser still holds as it ends is left in the folder of passing files of the system.
    }
  }
  process.once('exit', ending)
  const commands = commandsOver((text) => void toBrowser.write(`${text}\0`), 'The channel of the browser')
  const made: Kept = {
    program: browser,
    folder,
    heard: new Map(),
    ended: false,
    raw: async (method, params = {}, inside, within) => {
      hold(1)
      try {
        return await commands.send({ method, params, ...(inside ? { sessionId: inside } : {}) }, within)
      } finally {
        hold(-1)
      }
    },
  }
  started.push({ pid: browser.pid ?? 0, ended: () => made.ended })
  const lost = (): void => {
    made.ended = true
    commands.closed()
    process.removeListener('exit', ending)
  }
  fromBrowser.on('close', lost)
  browser.on('exit', lost)
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

/** The browser of the program for a program of a browser: started at its first page, and again where it was lost. */
async function browserOf(program: string): Promise<Kept> {
  const held = await kept.get(program)?.catch(() => undefined)
  if (held && !held.ended) return held
  const made = startedBrowser(program)
  kept.set(program, made)
  return made
}

/**
 * Takes the program of a browser of the Chromium family. Opens one page in the browser of the program, starting it
 * at its first page: a browser context of its own (`Target.createBrowserContext`), a target in it and a session
 * attached to that target, whose events are told to this page alone. Answers what drives that page. Throws T0016
 * where the browser does not start within twenty seconds.
 */
export async function driven(program: string): Promise<Driven> {
  const browser = await browserOf(program)
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
  const pages = new Set<(error: Error) => void>()
  let ended = false
  return {
    send: (method, params) => {
      if (ended || browser.ended) return Promise.reject(new Error('The page of the browser was ended.'))
      return new Promise((done, failed) => {
        pages.add(failed)
        browser
          .raw(method, params, session)
          .then(done, failed)
          .finally(() => pages.delete(failed))
      })
    },
    on: (method, one) => heard.set(method, [...(heard.get(method) ?? []), one]),
    async end() {
      if (ended) return
      ended = true
      for (const failed of pages) failed(new Error('The page of the browser was ended.'))
      browser.heard.delete(session)
      await close()
    },
  }
}
