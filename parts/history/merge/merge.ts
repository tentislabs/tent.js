import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { TentError } from '../../core/index.ts'
import type { SqliteFile } from '../../data/index.ts'
import { recordedFirst } from '../branches.ts'
import type { Change } from '../compare/change.ts'
import { compare } from '../compare/compare.ts'
import { found } from '../find.ts'
import { heldFiles, placeOf, rulesOf } from '../held.ts'
import { filesOf, holdBack, lay } from '../lay.ts'
import { isHeldPath } from '../paths.ts'
import type { Clash, Point, Writer } from '../point.ts'
import { follow, pointerOf } from '../pointers.ts'
import { lastBuilt, record } from '../record.ts'
import { readPoint } from '../rows.ts'
import { ancestors, parentsOf, shared } from '../tidy.ts'
import { clashData, clashText } from './clashFile.ts'
import { planFiles } from './files.ts'

/** What a merge answers: its point, where it made one, its changes in the terms of compare, and its clashes. */
export interface Merged {
  point?: Point
  changes: Change[]
  clashes: Clash[]
}

/** The failure for a side of a merge that is unsettled: T9101. */
const unsettled = (point: Point): TentError =>
  new TentError('T9101', `The point ${point.id} is a merge with clashes that are not settled, and is not merged.`, {
    fields: { point: point.id },
    fix: 'Settle its clashes first: `tent history merge --settle`.',
  })

/** The newest point that two points both come from, or nothing where they share none. */
function baseOf(file: SqliteFile, a: string, b: string): Point | undefined {
  const parents = parentsOf(file)
  const heads = shared(parents, ancestors(parents, a), ancestors(parents, b))
  return heads
    .map((id) => readPoint(file, id))
    .filter((one): one is Point => one !== undefined)
    .sort((x, y) => y.at - x.at)[0]
}

/** The changes from the shared point to theirs that the merge takes: all but those of a thing that clashed. */
function takenChanges(file: SqliteFile, base: Point, theirs: Point, clashes: Clash[]): Change[] {
  const clashed = new Set(clashes.map((one) => one.name.split('.')[0]))
  return compare(file, base.id, theirs.id).filter(
    (change) => !clashed.has(change.name.split('.')[0]) && !clashed.has(change.name),
  )
}

/**
 * Takes the folder of a project, a word that names the point or the branch to merge from, and who merges. Merges
 * it into the files by the newest point the two share: what only one side changed is taken from it, plain
 * definitions merge field by field, code and other text line by line. Writes the files, theirs beside a file of
 * bytes that both changed, and `tent.clash.ts` where something clashed, and records a point of the kind `merge`
 * with both as its parents, marked unsettled where something clashed. Where ours is the shared point, the merge
 * is their point itself. With `dry` it answers what it would do, and changes nothing. Throws T9107 for a point
 * that is not there, T9101 for a side that is unsettled, and T0013 where it would write over a file that no point
 * holds.
 */
export function merge(file: SqliteFile, project: string, from: string, by: Writer, o: { dry?: boolean } = {}): Merged {
  const theirs = found(file, from)
  if (theirs.unsettled) throw unsettled(theirs)
  const now = pointerOf(file, 'now')
  const head = now === undefined ? undefined : readPoint(file, now)
  if (head?.unsettled) throw unsettled(head)
  const ours = o.dry ? head : recordedFirst(file, project, by)
  if (!ours) throw new TentError('T9107', 'The history holds no point to merge into.', { fix: 'Record a point first.' })
  const base = baseOf(file, ours.id, theirs.id)
  if (base?.id === theirs.id) return { changes: [], clashes: [] }
  const rules = rulesOf(lastBuilt(file))
  if (base?.id === ours.id) {
    const changes = compare(file, ours.id, theirs.id)
    if (o.dry) return { changes, clashes: [] }
    const files = filesOf(file, theirs)
    holdBack(project, rules.roots, heldFiles(project, rules).files, files)
    lay(file, project, rules.roots, ours.files ?? {}, files)
    file.write(() => follow(file, theirs.id))
    return { point: theirs, changes, clashes: [] }
  }
  const shared = base ?? { ...ours, id: '', files: {}, parents: [] }
  const planned = planFiles(file, shared, ours, theirs)
  const clashes = clashData(planned.clashes)
  const changes = base ? takenChanges(file, base, theirs, clashes) : []
  if (o.dry) return { changes, clashes }
  const touched = Object.fromEntries([...planned.writes.keys(), ...planned.beside.keys()].map((path) => [path, '']))
  holdBack(project, rules.roots, heldFiles(project, rules).files, touched)
  const place = (path: string): string | undefined => {
    const at = isHeldPath(path) ? placeOf(project, rules.roots, path) : undefined
    return at && join(resolve(at.folder), at.path)
  }
  for (const [path, bytes] of [...planned.writes, ...planned.beside]) {
    const lies = place(path)
    if (!lies) continue
    if (bytes === undefined) rmSync(lies, { force: true })
    else {
      mkdirSync(dirname(lies), { recursive: true })
      writeFileSync(lies, bytes)
    }
  }
  if (planned.clashes.length)
    writeFileSync(join(project, 'tent.clash.ts'), clashText(planned.clashes, planned.described))
  const point = record(file, project, { by, kind: 'merge' }, undefined, { parents: [ours.id, theirs.id], clashes })
  return { point, changes, clashes }
}
