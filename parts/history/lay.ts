import { existsSync, mkdirSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { TentError } from '../core/index.ts'
import type { SqliteFile } from '../data/index.ts'
import { blobOf, hasBlob } from './blobs.ts'
import { placeOf } from './held.ts'
import { missing } from './missing.ts'
import { inTheWay, isHeldPath } from './paths.ts'
import type { Point } from './point.ts'

/**
 * The files of a point, each with its fingerprint. Throws T9107 for a point that was dropped, for a path that no
 * point may hold, and for a file whose bytes the history does not hold: so nothing is written of a point that
 * cannot be written whole.
 */
export function filesOf(file: SqliteFile, point: Point): Record<string, string> {
  if (!point.files)
    throw missing('point', point.id, `The point ${point.id} was dropped: it keeps its place and holds no files.`)
  for (const [path, print] of Object.entries(point.files)) {
    if (!isHeldPath(path))
      throw missing('point', point.id, `The point ${point.id} holds a file under \`${path}\`, which is no path.`)
    if (!hasBlob(file, print))
      throw missing('blob', print, `The history does not hold the bytes of ${path} of the point ${point.id}.`)
  }
  return point.files
}

/** Writes the bytes of a fingerprint to a place, with the folders above it. */
function put(file: SqliteFile, print: string, lies: string): void {
  const bytes = blobOf(file, print)
  if (!bytes) throw missing('blob', print, `The history does not hold the bytes of ${lies}.`)
  mkdirSync(dirname(lies), { recursive: true })
  writeFileSync(lies, bytes)
}

/** The failure for files that cannot be written without touching what is no file of a point: T0013, which names each. */
const refused = (words: string, paths: string[]): TentError =>
  new TentError('T0013', `${words}: ${paths.join(', ')}.`, {
    fix: 'Move these files away, or take the link away, and ask again. Nothing was changed.',
  })

/**
 * Writes every file of a point into a folder, each under its path. Throws T0013, before anything is written, where
 * a link stands on the way of a file: it may lead out of the folder.
 */
export function writeInto(file: SqliteFile, point: Point, folder: string): void {
  const files = Object.entries(filesOf(file, point))
  const linked = files.map(([path]) => path).filter((path) => inTheWay(folder, path) !== undefined)
  if (linked.length)
    throw refused(`The files of the point ${point.id} are not written, since a link stands in their place`, linked)
  for (const [path, print] of files) put(file, print, join(folder, path))
}

/**
 * Takes the folder of a project with its roots, the files that a point of the present would hold, by their paths,
 * and the files of the point to go to. Throws T0013 where going there would write over what no point holds and so
 * could not be brought back: a file that is left out or too large for a point, and whatever lies behind a link.
 * It names each such file, and nothing was changed.
 */
export function holdBack(
  project: string,
  roots: string[],
  held: ReadonlyMap<string, string>,
  to: Record<string, string>,
): void {
  const lost: string[] = []
  for (const path of Object.keys(to)) {
    const place = isHeldPath(path) ? placeOf(project, roots, path) : undefined
    if (!place) continue
    const folder = resolve(place.folder)
    if (inTheWay(folder, place.path) !== undefined || (!held.has(path) && existsSync(join(folder, place.path))))
      lost.push(path)
  }
  if (lost.length)
    throw refused('Going back would write over files that no point holds, which could not be brought back', lost)
}

/**
 * Takes the folder of a project with its roots, the files that the present point holds and those of the point to
 * go to. Writes each file that differs, and removes each file that the present holds and the other does not, with
 * the folders that this emptied. A file that neither holds is not touched.
 */
export function lay(
  file: SqliteFile,
  project: string,
  roots: string[],
  present: Record<string, string>,
  to: Record<string, string>,
): void {
  const lies = (path: string): { folder: string; file: string } | undefined => {
    const place = isHeldPath(path) ? placeOf(project, roots, path) : undefined
    return place && { folder: resolve(place.folder), file: join(resolve(place.folder), place.path) }
  }
  for (const [path, print] of Object.entries(to)) {
    const place = lies(path)
    if (place && present[path] !== print) put(file, print, place.file)
  }
  for (const path of Object.keys(present)) {
    const place = lies(path)
    if (!place || Object.hasOwn(to, path)) continue
    rmSync(place.file, { force: true })
    for (let at = dirname(place.file); at.length > place.folder.length; at = dirname(at)) {
      try {
        rmdirSync(at)
      } catch {
        // A folder that still holds something stays, and so does all above it.
        break
      }
    }
  }
}
