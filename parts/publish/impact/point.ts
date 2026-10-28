import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { TentError } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import { touchedOf } from '../../core/internal.ts'
import type { History } from '../../history/index.ts'
import type { ImpactFacts } from './face.ts'

/**
 * Takes a history, a folder to work in, a word that names a point, and whether only a kept description is read.
 * Answers the description of the point: the one kept with it, or the one its files give, read in a folder of their
 * own under the one it was handed. Throws T9107 for a word that names no point, and with `kept` for a point that
 * keeps no description: its files are then never read by this program, as those of a workspace in a box.
 */
export async function describedAt(
  history: History,
  work: string,
  word: string,
  o: { kept?: boolean } = {},
): Promise<Description> {
  const point = history.find(word)
  if (!point)
    throw new TentError('T9107', `The history holds no point that \`${word.slice(0, 80)}\` names.`, {
      fields: { point: word.slice(0, 80) },
      fix: 'Name a point by its name, by `now`, or by the first 8 or more characters of its id: `tent history` lists them.',
    })
  const kept = point.description === undefined ? undefined : history.blob(point.description)
  if (kept) return JSON.parse(new TextDecoder().decode(kept))
  if (o.kept)
    throw new TentError(
      'T9107',
      `The point \`${word.slice(0, 80)}\` keeps no description to hold the change against.`,
      {
        fields: { point: word.slice(0, 80) },
        fix: 'Name a point that a tool or a build recorded: `history` lists them.',
      },
    )
  const there = join(work, 'impact', point.id)
  rmSync(there, { recursive: true, force: true })
  history.write(point.id, there)
  try {
    // The build is loaded where a point is described from its files: `tent start` loads none of it.
    const { describeProject } = await import('../../build/index.ts')
    return (await describeProject(there)).description
  } finally {
    rmSync(there, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
  }
}

/** What each test of the app touched in its last run, as `tent test` kept it in the data folder, or nothing. */
export function touchedIn(data: string): ImpactFacts['touched'] {
  const file = join(data, 'tests.json')
  if (!existsSync(file)) return undefined
  try {
    return touchedOf(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    return undefined
  }
}
