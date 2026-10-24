import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TentError } from '../../core/index.ts'
import { Readable, Writable } from 'node:stream'
import { commandsOver } from './channel.ts'
import { endProgram } from './endProgram.ts'

type Params = Record<string, unknown>

// How long a browser is given to answer that it closes, and then to end by itself.
const closeTime = 5_000

/** A browser that the engine drives over its own channel for being driven: what it sends, and what it hears. */
export interface Driven {
  // Sends a command of the channel to the page, and answers what the browser answered.
  send(method: string, params?: Params): Promise<Params>
  // Names what is told each event of the page of that name.
  on(method: string, heard: (params: Params) => void): void
  // Ends the browser, and takes its folder away.
  end(): Promise<void>
}

// How long a browser that was started is given to answer its first command.
const startTime = 20_000

/**
 * Takes the program of a browser of the Chromium family. Starts it with no window, in a folder of its own, and
 * opens one page in it over the browser's own channel for being driven, which is a pair of pipes of this program:
 * no other program of the computer can reach it, as it could a port. Answers what drives that page. Throws T0016
 * where the browser does not answer within twenty seconds.
 */
export async function driven(program: string): Promise<Driven> {
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
  const commands = commandsOver((text) => void toBrowser.write(`${text}\0`), 'The channel of the browser')
  fromBrowser.on('close', () => commands.closed())
  browser.on('exit', () => commands.closed())
  const heard = new Map<string, ((params: Params) => void)[]>()
  let session: string | undefined
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
    if (typeof message.method === 'string' && (session === undefined || message.sessionId === session))
      for (const one of heard.get(message.method) ?? []) one(Object(message.params ?? {}))
  }
  const raw = (method: string, params: Params = {}, inside?: string, within?: number): Promise<Params> =>
    commands.send({ method, params, ...(inside ? { sessionId: inside } : {}) }, within)
  const end = async (): Promise<void> => {
    // A browser that was asked to close ends its own helper programs, and is given the time to; one that does not is ended.
    await raw('Browser.close', {}, undefined, closeTime).catch(() => undefined)
    toBrowser.end()
    await endProgram(browser, folder, closeTime)
  }
  try {
    // The first answer is the browser's word that it started.
    const made = await raw('Target.createTarget', { url: 'about:blank' }, undefined, startTime).catch(
      (error: unknown) => {
        throw error instanceof TentError
          ? new TentError('T0016', 'The browser did not start within twenty seconds.')
          : new TentError('T0016', 'The browser ended before it could be driven.')
      },
    )
    const attached = await raw('Target.attachToTarget', { targetId: made.targetId, flatten: true })
    session = String(attached.sessionId)
  } catch (error) {
    await end()
    throw error
  }
  return {
    send: (method, params) => raw(method, params, session),
    on: (method, one) => heard.set(method, [...(heard.get(method) ?? []), one]),
    end,
  }
}
