import { heldProgram } from '../../rooms/hold.ts'
import type { AppProgram, ProgramStart } from '../../rooms/room.ts'
import { createInterface } from 'node:readline'
import type { Channel } from '../../../connect/index.ts'
import type { Opened } from '../../opened.ts'
import { storedLimit } from '../../limits.ts'
import { valuesOf } from '../../values/ofApp.ts'
import { placedFolder, runFrom } from '../../placedFolders.ts'
import { namedEnvironment } from '../../namedEnvironment.ts'
import { isStored } from '../../../core/internal.ts'

// The waits before a program that ended by itself is started again, as those of a failed step: the last holds on.
const waits = [5_000, 30_000, 180_000]

/** One program of an outside server, with the channel the engine speaks to it over. */
interface Program {
  channel: Channel
  stop(): void
  // Starts the program again from the folder of the version that runs now, where it runs from another.
  follow(): void
}

/** The programs of the outside servers of an app, by the name of their service. */
const held = new WeakMap<Opened, Map<string, Program>>()

/** The environment of a program: what `env` of its service names, each value a literal or a secret. */
function envOf(o: Opened, stored: Record<string, unknown>): Record<string, string> {
  const mcp = isStored(stored.mcp) ? stored.mcp : {}
  const named = isStored(mcp.env) ? mcp.env : {}
  const made: Record<string, string> = {}
  for (const [name, value] of Object.entries(named))
    made[name] =
      isStored(value) && typeof value.secret === 'string' ? valuesOf(o).secrets.value(value.secret) : String(value)
  return made
}

/**
 * Starts the program of one service, in the folder of the version, with no shell: the words of `command` are the
 * program and its words, as they were written. Each line of its output is a message; a message is written as a
 * line of its input. When it ends by itself it is started again after a wait, and what listens is kept.
 */
function programOf(o: Opened, service: string, stored: Record<string, unknown>): Program {
  const mcp = isStored(stored.mcp) ? stored.mcp : {}
  const words = Array.isArray(mcp.command) ? mcp.command.map(String) : []
  const heard = new Set<(message: object) => void>()
  let child: AppProgram | undefined
  let stopped = false
  let tries = 0
  // The folder the program runs from, and whether it was ended to be started again from another.
  let from: string | undefined
  let moving = false
  const start = (): void => {
    if (stopped || !words.length) return
    let made: AppProgram
    // A program reads the files of the version by their places: a list of development is laid out for it.
    const cwd = placedFolder(o.bundle, '')
    try {
      const asked: ProgramStart = {
        for: 'mcp',
        command: words[0],
        args: words.slice(1),
        folder: cwd,
        // The named environment of a Python program, so a program that `npx` starts finds its folders and its proxy.
        env: { ...namedEnvironment(), ...envOf(o, stored) },
      }
      heldProgram(o.description, asked)
      made = o.room.program(asked)
    } catch (error) {
      // A program that cannot be started at all, as a `.cmd` file with no shell on Windows, is said once and left.
      o.log.write('lines', {
        at: o.clock.now(),
        level: 'error',
        message: `The program of ${service} cannot be started: ${error instanceof Error ? error.message : String(error)}`,
      })
      return
    }
    child = made
    from = cwd
    // No tidying takes the folder away while the program runs from it.
    const left = runFrom(cwd)
    // What the program writes to its error stream is let go, so a full pipe never holds it up.
    made.stderr.resume()
    // A program that ends before it has read what it was sent closes its input: that is no failure of the engine.
    made.stdin.on('error', () => undefined)
    createInterface({ input: made.stdout }).on('line', (line) => {
      tries = 0
      let message: unknown
      try {
        message = JSON.parse(line)
      } catch {
        return
      }
      if (isStored(message)) for (const one of heard) one(message)
    })
    made.ended.then(
      () => {
        left()
        child = undefined
        from = undefined
        if (stopped) return
        if (moving) {
          moving = false
          start()
          return
        }
        const wait = waits[Math.min(tries, waits.length - 1)]
        tries += 1
        o.log.write('lines', {
          at: o.clock.now(),
          level: 'warn',
          message: `The program of ${service} ended by itself: it is started again in ${wait / 1000} seconds.`,
        })
        setTimeout(start, wait).unref()
      },
      // A program that could not be started, as one that is not there, holds no folder and is no child: it is said once.
      (error: unknown) => {
        left()
        if (child !== made) return
        child = undefined
        from = undefined
        o.log.write('lines', {
          at: o.clock.now(),
          level: 'error',
          message: `The program of ${service} cannot be started: ${error instanceof Error ? error.message : String(error)}`,
        })
      },
    )
  }
  start()
  return {
    channel: {
      send: (message) => void child?.stdin.write(`${JSON.stringify(message)}\n`),
      each: (fn) => void heard.add(fn),
      close: () => undefined,
    },
    stop() {
      stopped = true
      child?.end()
    },
    follow() {
      if (!child || moving || from === placedFolder(o.bundle, '')) return
      moving = true
      child.end()
    },
  }
}

/** Whether a service is a program that is started for each user who needs it, rather than once for the app. */
const perUser = (stored: Record<string, unknown> | undefined): boolean =>
  isStored(stored?.mcp) && stored.mcp.per === 'user'

/**
 * Starts the program of each outside server of an app that is one, once for the app, and answers what ends them
 * all, those that were started for a user among them.
 */
export function startPrograms(o: Opened): { close(): void } {
  const programs = new Map<string, Program>()
  for (const [service, stored] of Object.entries(o.description.services))
    if (isStored(stored.mcp) && Array.isArray(stored.mcp.command) && !perUser(stored))
      programs.set(service, programOf(o, service, stored))
  held.set(o, programs)
  return {
    close() {
      for (const one of programs.values()) one.stop()
      programs.clear()
    },
  }
}

/**
 * The program of a service for one user, started when that user first needs it: it is ended once it was not used
 * for `limits.pythonStopAfter`, and started anew when the user needs it again.
 */
function userProgram(o: Opened, programs: Map<string, Program>, service: string, user: string): Program {
  const key = `${service}\u0000${user}`
  const found = programs.get(key)
  const program = found ?? programOf(o, service, o.description.services[service])
  if (!found) programs.set(key, program)
  const was = idle.get(program)
  was?.()
  const stopAfter = storedLimit(o.description, 'pythonStopAfter')
  idle.set(
    program,
    o.clock.setTimer(o.clock.now() + stopAfter, () => {
      if (programs.get(key) !== program) return
      programs.delete(key)
      program.stop()
    }),
  )
  return program
}

// What cancels the end of a program for a user that was not used, set anew at each use.
const idle = new WeakMap<Program, () => void>()

/**
 * Tells the programs of the outside servers of an app that a switch made another version the running one: each
 * that runs from a folder of another set of files is started again from the folder of the version that runs now.
 */
export function programsSwitched(o: Opened): void {
  for (const one of held.get(o)?.values() ?? []) one.follow()
}

/** The channel to the program of a service, where the app started one: for a service `per: 'user'`, that user's. */
export function programChannel(o: Opened, service: string, user?: string): Channel | undefined {
  const programs = held.get(o)
  if (!programs) return undefined
  if (!perUser(o.description.services[service])) return programs.get(service)?.channel
  return user === undefined ? undefined : userProgram(o, programs, service, user).channel
}
