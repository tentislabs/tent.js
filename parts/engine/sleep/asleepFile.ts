import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { keptAlone } from '../ownerOnly.ts'
import { writeOwnerOnly } from '../../core/internal.ts'

/** What `asleep.json` holds of an app that sleeps: its names, its running version, and when something of it is due. */
export interface Asleep {
  names: string[]
  version: string
  dueAt?: number
}

const fileIn = (dataFolder: string): string => join(dataFolder, 'asleep.json')

/** Writes `asleep.json` into a data folder, readable only by the current user. */
export function writeAsleep(dataFolder: string, held: Asleep): void {
  writeOwnerOnly(fileIn(dataFolder), `${JSON.stringify(held)}\n`)
}

/** Takes `asleep.json` away: the first act of a waking, before the store is opened. */
export function removeAsleep(dataFolder: string): void {
  rmSync(fileIn(dataFolder), { force: true })
}

/**
 * Reads `asleep.json` of a data folder. Answers nothing where there is none, where it is a link or a file that
 * another user may read or did not make, as `engine.json` is held, and where it holds anything else than it should.
 */
export function readAsleep(dataFolder: string): Asleep | undefined {
  const path = fileIn(dataFolder)
  if (!existsSync(path) || keptAlone(path).why !== undefined) return undefined
  try {
    const held: Record<string, unknown> = Object(JSON.parse(readFileSync(path, 'utf8')))
    const { names, version, dueAt } = held
    if (!Array.isArray(names) || !names.every((one) => typeof one === 'string') || typeof version !== 'string')
      return undefined
    if (dueAt !== undefined && typeof dueAt !== 'number') return undefined
    return { names: names.map(String), version, ...(typeof dueAt === 'number' ? { dueAt } : {}) }
  } catch {
    return undefined
  }
}
