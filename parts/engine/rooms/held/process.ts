import type { ChildProcess } from 'node:child_process'
import { fork } from 'node:child_process'
import { readdirSync, realpathSync } from 'node:fs'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TentError } from '../../../core/index.ts'
import { listAt } from '../../files.ts'
import { placedFolder } from '../../placedFolders.ts'
import type { Channel } from './channel.ts'
import { channelOf } from './channel.ts'

/** How the held program was started, read from the program itself. */
export interface HeldStatus {
  execArgv: string[]
  shut: { sqlite: boolean; debugProcess: boolean; v8Flags: boolean; kill: boolean }
}

/** The held program of one version: a process of its own, which asks the engine for all else over its channel. */
export interface HeldProgram {
  channel: Channel
  // The folder of the code it reads, by which the version's modules are loaded there.
  code: string
  status(): Promise<HeldStatus>
  // Whether the program still runs: one that ended is started anew at the next action.
  alive(): boolean
  close(): void
}

// The file of the program's own code, and the folders of the framework that it reads.
const hostFile = fileURLToPath(new URL('./host.ts', import.meta.url))
// The framework's own code that the held program runs: in a release it is built into the one file of the program.
const engineFolder = fileURLToPath(new URL('../../', import.meta.url))
const coreFolder = fileURLToPath(new URL('../../../core/', import.meta.url))
const dataFolder = fileURLToPath(new URL('../../../data/', import.meta.url))

/** The real path of a folder, by which the permission model grants it: a link that leads out is refused at the start. */
const real = (path: string): string => {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

/**
 * Whether a link inside `root` leads outside it. The permission model grants a folder by its path and follows a
 * link under it to wherever it leads, so the program refuses to start where one escapes the code it is granted.
 */
function linkEscapes(root: string): boolean {
  const realRoot = real(root)
  const inside = (path: string): boolean => path === realRoot || path.startsWith(realRoot + sep)
  const entriesOf = (folder: string): { name: string; isSymbolicLink(): boolean; isDirectory(): boolean }[] => {
    try {
      return readdirSync(folder, { withFileTypes: true })
    } catch {
      return []
    }
  }
  const walk = (folder: string): boolean => {
    for (const entry of entriesOf(folder)) {
      const full = join(folder, entry.name)
      if (entry.isSymbolicLink()) {
        if (!inside(real(full))) return true
      } else if (entry.isDirectory() && walk(full)) return true
    }
    return false
  }
  return walk(realRoot)
}

/**
 * Takes the place of a version, the native packages the hold names, the folders they lie in, and what serves a
 * question of the program. Starts the held program of the version under the permission model with read of the
 * version's built code, of the framework's own code that it runs, and nothing else, unless `native` names packages,
 * which lifts the loading of native code for the whole program and grants read of each named package's folder.
 */
export function startHeld(o: {
  place: string
  native: readonly string[]
  nativeFolders: string[]
  serve: (what: string, body: unknown) => unknown
}): HeldProgram {
  // The program reads the version's built code; a link inside it that leads outside would read what is not
  // granted, so it does not start on one. A version of development is the list of its files: the program is
  // handed it as a folder of links to them, as Python is, and is granted that folder and never the store of every
  // version.
  const listed = listAt(o.place) !== undefined
  if (!listed && linkEscapes(o.place))
    throw new TentError('T0035', 'The built code holds a link that leads outside it: the held app was not started.', {
      fix: 'Build the project again, so its code holds no link that leaves the bundle.',
    })
  const code = listed ? placedFolder(o.place, '') : o.place
  const reads = [real(code), real(engineFolder), real(coreFolder), real(dataFolder)]
  const execArgv = ['--permission', ...[...reads, ...o.nativeFolders.map(real)].map((one) => `--allow-fs-read=${one}`)]
  // A `native` names packages whose code runs outside the model, so loading native code is lifted for the whole program.
  if (o.native.length) execArgv.push('--allow-addons')
  const child: ChildProcess = fork(hostFile, [code], {
    execArgv,
    // An empty environment: the version is named by an argument, not a variable, so it holds no secret of the engine.
    env: {},
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    serialization: 'advanced',
  })
  // The program writes nothing to its output in the ordinary course; what it does write is let go, so a full pipe
  // never holds it up.
  child.stdout?.resume()
  child.stderr?.resume()
  const channel = channelOf((message) => void child.send?.(message), o.serve)
  child.on('message', (message) => channel.take(message))
  let gone = false
  const ended = (why: string): void => {
    gone = true
    channel.fail(new TentError('T0037', `The held program of the app ended: ${why}.`))
  }
  child.on('exit', (code) => ended(`it exited with ${code}`))
  child.on('error', (error) => ended(String(error)))
  return {
    channel,
    code,
    status: async () => Object(await channel.ask('status', {})),
    alive: () => !gone,
    close() {
      child.removeAllListeners('message')
      if (child.exitCode === null && child.signalCode === null) child.kill()
    },
  }
}
