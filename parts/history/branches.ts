import { readFileSync } from 'node:fs'
import { TentError } from '../core/index.ts'
import { fingerprintOf } from '../core/internal.ts'
import type { SqliteFile } from '../data/index.ts'
import { found } from './find.ts'
import { heldFiles, rulesOf } from './held.ts'
import type { Point, Writer } from './point.ts'
import { pointerOf, setPointer } from './pointers.ts'
import { lastBuilt, record } from './record.ts'
import { readPoint } from './rows.ts'

/** The branch that a project starts on. */
const firstBranch = 'main'

/** The pointer that keeps the point a branch was made at, which is never dropped: a merge compares with it. */
const madeAt = (name: string): string => `made:${name}`

/** Whether a text may name a branch: any text with no colon and no white space that is not `now`, `on` or `live`. */
export const isBranchName = (name: string): boolean =>
  name !== '' && !/[:\s]/.test(name) && !['now', 'on', 'live'].includes(name)

/** Sets `on` to the first branch where a history names none, with that branch standing where `now` stands. */
export function startOnMain(file: SqliteFile): void {
  if (pointerOf(file, 'on') !== undefined) return
  file.write(() => {
    setPointer(file, 'on', firstBranch)
    const now = pointerOf(file, 'now')
    if (now !== undefined && pointerOf(file, firstBranch) === undefined) setPointer(file, firstBranch, now)
  })
}

/**
 * Makes a branch at the point that `from` names, or at `now`, and keeps where it was made. Throws T0002 for a
 * name that may not name a branch or that names one already, and T9107 where the point is not there.
 */
export function branch(file: SqliteFile, name: string, from = 'now'): void {
  if (!isBranchName(name))
    throw new TentError(
      'T0002',
      `\`${name}\` cannot name a branch: a name holds no colon and no white space, and is not now, on or live.`,
      {
        fields: { name: 'type' },
      },
    )
  if (pointerOf(file, name) !== undefined)
    throw new TentError('T0002', `A branch named \`${name}\` is there already.`, { fields: { name: 'unique' } })
  const at = found(file, from).id
  file.write(() => {
    setPointer(file, name, at)
    setPointer(file, madeAt(name), at)
  })
}

/**
 * Records the files of a project as a point of the kind `command` where they are not those of `now`: what no point
 * holds yet is kept before a switch, a merge or a pull writes over it. Answers the point that `now` stands on.
 */
export function recordedFirst(file: SqliteFile, project: string, by: Writer): Point | undefined {
  const now = pointerOf(file, 'now')
  const present = now === undefined ? undefined : readPoint(file, now)
  const { files } = heldFiles(project, rulesOf(lastBuilt(file)))
  const held = present?.files ?? {}
  let same = present !== undefined && Object.keys(held).length === files.size
  for (const [path, lies] of files) {
    if (!same) break
    try {
      same = held[path] === fingerprintOf(readFileSync(lies))
    } catch {
      same = false
    }
  }
  return same ? present : record(file, project, { by, kind: 'command' })
}
