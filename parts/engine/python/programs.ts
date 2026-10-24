import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { storedLimit } from '../limits.ts'
import type { CallContext } from '../context.ts'
import type { Opened } from '../opened.ts'
import type { Environment } from './environment.ts'
import { touched } from './environment.ts'
import type { Pool } from './pool.ts'
import { pythonPool } from './pool.ts'
import { startProgram } from './program.ts'
import { placedFolder, runFrom } from '../placedFolders.ts'

/** What the engine holds of the Python programs of one app, over all its versions. */
interface Programs {
  pool: Pool
  // The environment of each lock, by its name, once it stood whole.
  environments: Map<string, Environment>
  // The folder of the bundle of each version that a call of a `python` named.
  bundles: Map<string, string>
  // What writes a line of the log of each call that is in a program now, or ended a moment ago, by the call.
  lines: Map<string, Line>
  // The files of the definitions that stay loaded, which no idle time ends: those that a worker was told to load.
  kept: Set<string>
}

/** What writes a line of the log of one call, at its level. */
type Line = (level: 'info' | 'error', message: string) => void

/**
 * Takes an app, the call context of a call of a `python` and the name of its definition. Answers what writes a line
 * of the log under that name: on a worker by the `log` of its task, which the worker sends to its writer.
 */
export function lineOf(o: Opened, cx: CallContext, name: string): Line {
  const remote = cx.remote?.handle('log')
  return (level, message) => {
    if (remote) Reflect.apply(Reflect.get(remote, level), remote, [message])
    else o.log.write('lines', { at: o.clock.now(), level, message, name })
  }
}

// What is held of each app, under its handles: every record that the engine holds of one app shares those.
const held = new WeakMap<object, Programs>()

// An environment in use is marked as used once a day, so that a clean of old environments leaves it.
const day = 86_400_000

/** The folders of a bundle that a Python program has on its path: `python/`, and each root under it. */
function pathsOf(bundle: string): string[] {
  // A Python program reads the files of the version by their places: a list of development is laid out for it.
  const python = placedFolder(bundle, 'python')
  const roots = join(python, 'roots')
  const own = existsSync(roots)
    ? readdirSync(roots)
        .sort()
        .map((one) => join(roots, one))
    : []
  return [python, ...own]
}

/** Tells the pool of an app, where it has one, the version that runs now: the programs of the others end. */
export function switchedTo(o: Opened): void {
  held.get(o.handles)?.pool.switched(o.version)
}

/**
 * Answers what the engine holds of the Python programs of an app: its pool, made at the first asking, whose close
 * stands among what is closed before the data of the app, so that an app that is closed or falls asleep gives its
 * Python programs back.
 */
export function programsOf(o: Opened): Programs {
  const there = held.get(o.handles)
  if (there) return there
  let last: Line = (level, message) => o.log.write('lines', { at: o.clock.now(), level, message, name: '' })
  const made: Programs = {
    environments: new Map(),
    bundles: new Map(),
    lines: new Map(),
    kept: new Set(),
    pool: pythonPool({
      count: storedLimit(o.description, 'pythonPrograms'),
      stopAfter: storedLimit(o.description, 'pythonStopAfter'),
      keep: (file) => made.kept.has(file),
      start: async (kind) => {
        const env = made.environments.get(kind.lock)
        if (!env) throw new Error(`no environment stands for the lock ${kind.lock}`)
        touched(env.folder)
        const paths = pathsOf(made.bundles.get(kind.version) ?? o.bundle)
        // No tidying takes the folder of the version away while the program runs from it.
        const left = runFrom(paths[0])
        const program = await startProgram({
          python: env.python,
          paths,
          gpu: kind.gpu,
          frameSize: storedLimit(o.description, 'pythonFrameSize'),
          start: (start) => o.room.program(start),
          line: (text, error, call) => {
            last = (call ? made.lines.get(call) : undefined) ?? last
            last(error ? 'error' : 'info', text)
          },
        }).catch((error: unknown) => {
          left()
          throw error
        })
        const daily = setInterval(() => touched(env.folder), day)
        daily.unref()
        void program.ended.then(() => {
          clearInterval(daily)
          left()
        })
        return program
      },
    }),
  }
  held.set(o.handles, made)
  o.before.push({ close: () => made.pool.close() })
  return made
}

/** The pool of the Python programs of an app, with the bundle of the version of the call that asks for it named. */
export function poolOf(o: Opened): Pool {
  const programs = programsOf(o)
  programs.bundles.set(o.version, o.bundle)
  return programs.pool
}
