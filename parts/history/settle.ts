import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { TentError } from '../core/index.ts'
import type { SqliteFile } from '../data/index.ts'
import { isEngineName, isGitName } from './paths.ts'
import type { Point, Writer } from './point.ts'
import { pointerOf } from './pointers.ts'
import { record } from './record.ts'
import { readPoint } from './rows.ts'

/** The clash file, and every file that ends in `.theirs`, that lie in a folder, by their paths. */
function leftOfClash(project: string): string[] {
  const left: string[] = existsSync(join(project, 'tent.clash.ts')) ? ['tent.clash.ts'] : []
  const walk = (at: string): void => {
    for (const entry of readdirSync(join(project, at), { withFileTypes: true })) {
      const path = at ? `${at}/${entry.name}` : entry.name
      if (isGitName(entry.name) || (at === '' && (isEngineName(entry.name) || entry.name === 'node_modules'))) continue
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile() && entry.name.endsWith('.theirs')) left.push(path)
    }
  }
  walk('')
  return left
}

/**
 * Records the settled point of a merge with clashes: the files as a person or an AI left them, as a point of the
 * kind `merge` after the unsettled one. Throws T9102 while the clash file or a `.theirs` file is still there, and
 * T0013 where `now` stands on no unsettled point.
 */
export function settle(file: SqliteFile, project: string, by: Writer): Point {
  const left = leftOfClash(project)
  if (left.length)
    throw new TentError(
      'T9102',
      `The clashes of the merge are not settled: ${left.join(', ')} ${left.length === 1 ? 'is' : 'are'} still there.`,
      {
        fix: 'Put the definition you want into its own file, then remove `tent.clash.ts` and every `.theirs` file.',
      },
    )
  const now = pointerOf(file, 'now')
  const point = now === undefined ? undefined : readPoint(file, now)
  if (!point?.unsettled)
    throw new TentError(
      'T0013',
      'There is nothing to settle: the point that `now` stands on is no merge with clashes.',
      {
        fix: 'Settle after `tent history merge` left clashes.',
      },
    )
  return record(file, project, { by, kind: 'merge' })
}
