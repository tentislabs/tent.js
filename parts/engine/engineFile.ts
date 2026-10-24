import type { Stats } from 'node:fs'
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { TentError } from '../core/index.ts'
import { beginOwnerOnly, programRuns } from '../core/internal.ts'
import type { Mode } from '../data/index.ts'
import { keptAlone } from './ownerOnly.ts'
import { provedAt } from './proof.ts'

const fileIn = (dataFolder: string): string => join(dataFolder, 'engine.json')

/** What `engine.json` of a data folder says: where its engine is reached, its program, and its mode. */
export interface EngineFile {
  port: number
  token: string
  pid: number
  mode?: string
}

/** The `engine.json` of a data folder while its engine opens: written once the engine is reached, or dropped. */
export interface EngineFileBegun {
  write(o: { port: number; token: string; mode: Mode }): Promise<void>
  drop(): void
}

/**
 * Takes a data folder. Begins its `engine.json`, readable only by the current user, whose rights are closed beside
 * the opening of the engine. Answers what writes where the engine is reached, the port, the admin token and the
 * mode, with the number of this program, so that a command of this computer finds the engine; and what takes the
 * file away where the opening fails before it.
 */
export function beginEngineFile(dataFolder: string): EngineFileBegun {
  const begun = beginOwnerOnly(fileIn(dataFolder))
  return {
    write: (o) => {
      const held = { port: o.port, token: o.token, pid: process.pid, mode: o.mode }
      return begun.write(`${JSON.stringify(held, undefined, 2)}\n`)
    },
    drop: () => begun.drop(),
  }
}

/** The record of a text of `engine.json`, or nothing for a text that is not of its form. */
function engineFileIn(text: string): EngineFile | undefined {
  let held: unknown
  try {
    held = JSON.parse(text)
  } catch {
    return undefined
  }
  const [port, token, pid, mode]: unknown[] = ['port', 'token', 'pid', 'mode'].map((name) =>
    Reflect.get(Object(held), name),
  )
  if (typeof port !== 'number' || typeof token !== 'string' || typeof pid !== 'number' || !Number.isInteger(pid))
    return undefined
  return { port, token, pid, ...(typeof mode === 'string' ? { mode } : {}) }
}

/**
 * Takes the place of an `engine.json` that is an ordinary file. Opens it once, looks at what it opened, and reads
 * through it, so that nothing put in its place between the look and the read is read. Answers its text, or
 * nothing where what was opened is no ordinary file of the current user. Where the system gives a number of the
 * user, the owner is held by it; where it gives none, the owner and the rights are asked of the system's own
 * program, as for the key file of a reader.
 */
function ownText(file: string): string | undefined {
  // A link is not followed where the system can be told so: on a system that cannot, the look before stands alone.
  const opened = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const about = fstatSync(opened)
    if (!about.isFile()) return undefined
    if (typeof process.getuid === 'function') {
      if (about.uid !== process.getuid()) return undefined
    } else if (keptAlone(file).why !== undefined) return undefined
    return readFileSync(opened, 'utf8')
  } finally {
    closeSync(opened)
  }
}

/**
 * Takes a data folder. Answers what its `engine.json` says, read only when it is an ordinary file that the current
 * user owns: a link in its place, a file of another user, and a file of another form say nothing. Throws T0013
 * where a folder lies in its place.
 */
export function engineFileOf(dataFolder: string): EngineFile | undefined {
  const file = fileIn(dataFolder)
  let about: Stats
  try {
    about = lstatSync(file)
  } catch {
    return undefined
  }
  if (about.isDirectory())
    throw new TentError('T0013', `A folder lies in the place of ${file}, where an engine writes how it is reached.`, {
      fix: 'Remove that folder: no engine can start on the data folder while it lies there.',
    })
  try {
    if (!about.isFile() || about.isSymbolicLink()) return undefined
    const text = ownText(file)
    return text === undefined ? undefined : engineFileIn(text)
  } catch {
    // The engine removed its file as it ended, between the look and the read.
    return undefined
  }
}

/** What `engine.json` of a data folder says, read as it lies, with no look at who made it. */
function writtenIn(dataFolder: string): EngineFile | undefined {
  try {
    return engineFileIn(readFileSync(fileIn(dataFolder), 'utf8'))
  } catch {
    return undefined
  }
}

/**
 * Takes a data folder that an engine of this program was opened on. Answers what that engine wrote into its
 * `engine.json`, which needs no look at who made it: nothing where it wrote none, or where another program did.
 */
export function ownEngineFile(dataFolder: string): EngineFile | undefined {
  const held = writtenIn(dataFolder)
  return held?.pid === process.pid ? held : undefined
}

/** The port that the engine of a data folder answers this computer on, as it wrote it for the commands of this computer. */
export const enginePort = (dataFolder: string): number => Number(ownEngineFile(dataFolder)?.port)

/** Takes `engine.json` away from a data folder, as an engine does when it closes the app. */
export function removeEngineFile(dataFolder: string): void {
  rmSync(fileIn(dataFolder), { force: true })
}

/**
 * Takes a data folder. Answers the number of another program that runs an engine on it, or nothing. A file whose
 * program no longer runs was left behind, and so was one that names this program, which holds no such app. The
 * number alone is not trusted: it may be another program's since, so what listens where the file says is asked to
 * prove that it holds the token, and a file that nothing proves was left behind too. An engine that refuses the
 * proof to this computer, behind a proxy named by its address, runs there all the same.
 */
export async function runningElsewhere(dataFolder: string): Promise<number | undefined> {
  // The file needs no look at who made it: only what answers as its engine stands against the opening.
  const held = writtenIn(dataFolder)
  if (!held || held.pid === process.pid || !programRuns(held.pid)) return undefined
  return (await provedAt(held.port, held.token)) === 'none' ? undefined : held.pid
}
