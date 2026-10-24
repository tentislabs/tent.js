import { fingerprintOf } from '../core/internal.ts'
import type { SqliteFile } from '../data/index.ts'
import { hasBlob, keepBlob } from './blobs.ts'
import { keepChanges } from './changed.ts'
import { comparedAnew } from './compare/compare.ts'
import { idOf } from './idOf.ts'
import { missing } from './missing.ts'
import { isHeldPath } from './paths.ts'
import type { Point } from './point.ts'
import { hasPoint, keepPoint, kinds } from './rows.ts'

/** Answers which of the named points and blobs the history holds. */
export const have = (
  file: SqliteFile,
  o: { points: string[]; blobs: string[] },
): { points: string[]; blobs: string[] } => ({
  points: o.points.filter((id) => hasPoint(file, id)),
  blobs: o.blobs.filter((print) => hasBlob(file, print)),
})

const writers = ['person', 'ai', 'tool', 'server']
const isText = (value: unknown): value is string => typeof value === 'string'

/**
 * A point of another history as this one stores it: what the point itself holds, and nothing that the other
 * computer found of it but its description and its note. Throws T9107 where it has not the form of a point, where
 * its id does not fit what it holds, where a path of it is none, and where the bytes of a file are not here. A
 * point that was dropped holds no files, and is taken as it is.
 */
function taken(file: SqliteFile, sent: Point): Point {
  const refuse = (words: string) => missing('point', String(sent?.id), `A point was not taken: ${words}.`)
  if (typeof sent !== 'object' || sent === null || !isText(sent.id)) throw refuse('it has not the form of a point')
  const { id, parents, at, by, kind, name, files } = sent
  const formed =
    Array.isArray(parents) &&
    parents.every(isText) &&
    typeof at === 'number' &&
    typeof by === 'object' &&
    by !== null &&
    writers.includes(by.kind) &&
    (by.id === undefined || isText(by.id)) &&
    kinds.includes(kind) &&
    (name === undefined || isText(name)) &&
    (files === undefined || (typeof files === 'object' && files !== null && Object.values(files).every(isText)))
  if (!formed) throw refuse('it has not the form of a point')
  const held: Omit<Point, 'id'> = {
    parents: [...parents],
    at,
    by: { kind: by.kind, ...(by.id !== undefined ? { id: by.id } : {}) },
    kind,
    ...(name !== undefined ? { name } : {}),
    ...(files ? { files: { ...files } } : {}),
  }
  if (files) {
    if (idOf(held) !== id) throw refuse(`its id ${id} does not fit what it holds`)
    for (const [path, print] of Object.entries(files)) {
      if (!isHeldPath(path)) throw refuse(`\`${path}\` is no path of a file`)
      if (!hasBlob(file, print))
        throw missing('blob', print, `A point was not taken: the bytes of ${path} of the point ${id} are not here.`)
    }
  }
  // The description of a point is a blob too: one that is not here makes a point that nothing can describe.
  if (isText(sent.description) && !hasBlob(file, sent.description))
    throw missing('blob', sent.description, `A point was not taken: the description of the point ${id} is not here.`)
  return {
    id,
    ...held,
    ...(sent.unsettled === true ? { unsettled: true } : {}),
    ...(isText(sent.description) ? { description: sent.description } : {}),
    ...(isText(sent.note) ? { note: sent.note } : {}),
    ...(Array.isArray(sent.clashes) ? { clashes: sent.clashes } : {}),
  }
}

/**
 * Takes blobs and points of another history, and stores them in one write: all of them, or none. Every
 * fingerprint and every id is checked, and a point is taken once its parents are here, in whatever order they were
 * sent. A point that is here already is left as it is. Throws T9107 for bytes that do not fit their fingerprint,
 * for a point that `taken` refuses, and for a point whose parent is neither here nor among what was sent.
 */
export function take(file: SqliteFile, o: { blobs?: Record<string, Uint8Array>; points?: Point[] }): void {
  file.write(() => {
    for (const [print, bytes] of Object.entries(o.blobs ?? {})) {
      if (!(bytes instanceof Uint8Array) || fingerprintOf(bytes) !== print)
        throw missing('blob', print, `A blob was not taken: its bytes do not fit the fingerprint ${print}.`)
      keepBlob(file, bytes, print)
    }
    let waiting = [...(o.points ?? [])].filter((one) => !hasPoint(file, String(one?.id)))
    while (waiting.length) {
      const next: Point[] = []
      for (const sent of waiting) {
        const point = taken(file, sent)
        if (hasPoint(file, point.id)) continue
        if (point.parents.every((parent) => hasPoint(file, parent))) {
          keepPoint(file, point)
          keepChanges(file, point.id, (a, b) => comparedAnew(file, a, b))
        } else next.push(sent)
      }
      if (next.length === waiting.length) {
        const [stuck] = next
        throw missing('point', stuck.id, `A point was not taken: a parent of the point ${stuck.id} is not here.`)
      }
      waiting = next
    }
  })
}
