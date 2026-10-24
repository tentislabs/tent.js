import type { SqliteFile } from '../data/index.ts'
import { isBranchName, recordedFirst } from './branches.ts'
import { heldFiles, rulesOf } from './held.ts'
import { filesOf, holdBack, lay } from './lay.ts'
import { missing } from './missing.ts'
import type { Point, Writer } from './point.ts'
import { pointerOf, setPointer } from './pointers.ts'
import { lastBuilt } from './record.ts'
import { readPoint } from './rows.ts'

/**
 * Goes to a branch: records the present where no point holds it yet, writes the files of the branch's point as
 * going back does, and sets `on` to the branch, with `now` on its point. Answers that point. Throws T9107 for a
 * branch that is not there, and T0013, before anything is recorded or written, where a file of the branch would
 * be written over one that no point holds.
 */
export function switchTo(file: SqliteFile, project: string, name: string, by: Writer): Point {
  const at = isBranchName(name) ? pointerOf(file, name) : undefined
  const point = at === undefined ? undefined : readPoint(file, at)
  if (!point) throw missing('point', name, `The history holds no branch named \`${name}\`.`)
  const files = filesOf(file, point)
  const rules = rulesOf(lastBuilt(file))
  holdBack(project, rules.roots, heldFiles(project, rules).files, files)
  const present = recordedFirst(file, project, by)
  lay(file, project, rules.roots, present?.files ?? {}, files)
  file.write(() => {
    setPointer(file, 'now', point.id)
    setPointer(file, 'on', name)
  })
  return point
}
