import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { isMainThread } from 'node:worker_threads'

// The folders of the calls under way in this program, over every app: a version that is loaded meanwhile keeps them.
const underWay = new Set<string>()

/** The folder of the calls of a data folder, under which each call of a `python` lays a folder of its own. */
export const callsFolder = (dataFolder: string): string => join(dataFolder, 'cache', 'python')

/** Marks the folder of a call as under way, until `done` is called. */
export function callUnderWay(folder: string): { done(): void } {
  underWay.add(folder)
  return { done: () => void underWay.delete(folder) }
}

/**
 * Takes a data folder. Removes each folder of a call under it that no call of this program holds: what a call
 * that was killed left, in the main thread alone. Answers the error of each that the disk would not let go, which
 * the caller logs.
 */
export function clearLeft(dataFolder: string): string[] {
  const calls = callsFolder(dataFolder)
  // A thread knows nothing of the calls of the program it runs in: the program's own thread clears.
  if (!isMainThread || !existsSync(calls)) return []
  const refused: string[] = []
  for (const name of readdirSync(calls)) {
    const folder = join(calls, name)
    if (underWay.has(folder)) continue
    try {
      rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    } catch (error) {
      refused.push(`${name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return refused
}
