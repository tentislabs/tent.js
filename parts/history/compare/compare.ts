import type { SqliteFile } from '../../data/index.ts'
import { blobOf } from '../blobs.ts'
import { keptChanges } from '../changed.ts'
import { found } from '../find.ts'
import { filesOf } from '../lay.ts'
import type { Point } from '../point.ts'
import type { Change } from './change.ts'
import type { Described } from './definitions.ts'
import { definitionChanges, linesApart } from './definitions.ts'
import { isStored } from '../../core/internal.ts'

/** The bytes of a file as text with one line ending, or nothing for bytes that are no text. */
function asText(bytes: Uint8Array | undefined): string | undefined {
  if (!bytes || bytes.includes(0)) return undefined
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/\r\n/g, '\n')
  } catch {
    return undefined
  }
}

/** The description that was kept with a point, or nothing for a point that did not build. */
export function describedBy(file: SqliteFile, point: Point): Described | undefined {
  const text = point.description === undefined ? undefined : asText(blobOf(file, point.description))
  const read: unknown = text === undefined ? undefined : JSON.parse(text)
  return isStored(read) ? read : undefined
}

/** The files of two points, one by one: added, removed, and changed, with how many lines differ where both are text. */
function fileChanges(
  file: SqliteFile,
  a: Record<string, string>,
  b: Record<string, string>,
  skip: Set<string>,
): Change[] {
  const changes: Change[] = []
  const paths = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort((x, y) => (x < y ? -1 : 1))
  for (const path of paths) {
    if (skip.has(path) || a[path] === b[path]) continue
    if (a[path] === undefined || b[path] === undefined) {
      changes.push({ change: a[path] === undefined ? 'added' : 'removed', what: 'file', name: path })
      continue
    }
    const [textA, textB] = [asText(blobOf(file, a[path])), asText(blobOf(file, b[path]))]
    const lines = textA !== undefined && textB !== undefined ? { lines: linesApart(textA, textB) } : {}
    changes.push({ change: 'changed', what: 'file', name: path, ...lines })
  }
  return changes
}

/** The files that the places of a description name: those that hold a definition. */
const filesNamed = (description: Described): string[] =>
  Object.values(isStored(description.places) ? description.places : {}).flatMap((place) =>
    isStored(place) && typeof place.file === 'string' ? [place.file] : [],
  )

/**
 * Takes two words that each name a point. Answers the changes from the first to the second, in the terms of the
 * app: the two descriptions that were kept with the points are compared, definition by definition, and the files
 * that hold no definition file by file. A point that did not build has no description, and the two are then
 * compared file by file, as text. What a point changed against its first parent is read as it was kept when the
 * point was recorded. Throws T9107 for a point that is not there, and for one that was dropped.
 */
export function compare(file: SqliteFile, a: string, b: string): Change[] {
  const [from, to] = [found(file, a), found(file, b)]
  if (to.parents[0] === from.id && from.files && to.files) {
    const kept = keptChanges(file, to.id, from.id)
    if (kept) return kept
  }
  return comparedAnew(file, from.id, to.id)
}

/** The changes from one point to another, worked out from their descriptions and their files. */
export function comparedAnew(file: SqliteFile, a: string, b: string): Change[] {
  const [from, to] = [found(file, a), found(file, b)]
  const [filesA, filesB] = [filesOf(file, from), filesOf(file, to)]
  const [before, after] = [describedBy(file, from), describedBy(file, to)]
  if (!before || !after) return fileChanges(file, filesA, filesB, new Set())
  const textAt = (side: 'a' | 'b', name: string): string | undefined => {
    const [description, files] = side === 'a' ? [before, filesA] : [after, filesB]
    const place = isStored(description.places) ? description.places[name] : undefined
    if (!isStored(place) || typeof place.file !== 'string') return undefined
    const text = asText(blobOf(file, files[place.file] ?? ''))
    return text?.slice(Number(place.from), Number(place.to) + 1)
  }
  return [
    ...definitionChanges(before, after, textAt),
    ...fileChanges(file, filesA, filesB, new Set([...filesNamed(before), ...filesNamed(after)])),
  ]
}
