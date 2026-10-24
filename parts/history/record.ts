import { readFileSync } from 'node:fs'
import type { Description } from '../core/internal.ts'
import { write } from '../core/internal.ts'
import type { SqliteFile } from '../data/index.ts'
import { blobOf, hasBlob, keepBlob } from './blobs.ts'
import { forgetChanges, keepChanges } from './changed.ts'
import { comparedAnew } from './compare/compare.ts'
import { heldFiles, rulesOf } from './held.ts'
import { idOf } from './idOf.ts'
import type { Clash, Kind, Point, Writer } from './point.ts'
import { follow, pointerOf, standingOn } from './pointers.ts'
import { keepPoint, readPoint } from './rows.ts'

/** What a point is recorded with: who made it and what for, and what this computer found of it. */
export interface Recording {
  by: Writer
  kind: Kind
  name?: string
  checked?: boolean
  description?: Description
  note?: string
  // The fingerprint of the bytes of each file that a build just read, by its path: a file whose bytes the history
  // holds under it is recorded by it, and not read again.
  known?: Record<string, string>
}

/** The description of the last build that worked: that of the newest point that holds one whose bytes are here. */
export function lastBuilt(file: SqliteFile): Pick<Description, 'project'> | undefined {
  const [row] = file.all('SELECT description FROM points WHERE description IS NOT NULL ORDER BY at DESC LIMIT 1', [])
  const bytes = row ? blobOf(file, String(Reflect.get(row, 'description'))) : undefined
  if (!bytes) return undefined
  const read: unknown = JSON.parse(new TextDecoder().decode(bytes))
  const project: unknown = typeof read === 'object' && read !== null ? Reflect.get(read, 'project') : undefined
  return typeof project === 'object' && project !== null ? { project: { ...project } } : undefined
}

/** Keeps a description as bytes of the history, and answers their fingerprint. */
export const keepDescription = (file: SqliteFile, description: Description): string =>
  keepBlob(file, write(description).bytes)

/** The bytes of a file, or nothing for one that went away since it was listed. */
function bytesOf(lies: string): Uint8Array | undefined {
  try {
    return readFileSync(lies)
  } catch {
    return undefined
  }
}

/**
 * Takes the folder of a project and what the point is recorded with. Records the files as they are as one point,
 * whose parent is the point that `now` stands on, and moves `now` to it. A save that is made within the time of
 * `historyJoin` of the save that is its parent takes that point's place, where no other pointer names the older
 * one. `built` is the fingerprint of a description that the history holds, for a point whose files are those of an
 * older point. `merged` gives the point of a merge its two parents, and what the merge left unsettled. Answers
 * the point.
 */
export function record(
  file: SqliteFile,
  project: string,
  o: Recording,
  built?: string,
  merged?: { parents: string[]; clashes: Clash[] },
): Point {
  const rules = rulesOf(o.description ?? lastBuilt(file))
  const { files, large, unwritable } = heldFiles(project, rules)
  // Each file in its order, by its bytes, or by the fingerprint of bytes that the history holds already.
  const read: [string, Uint8Array | string][] = []
  for (const [path, lies] of files) {
    const known = o.known?.[path]
    if (known !== undefined && hasBlob(file, known)) read.push([path, known])
    else {
      const bytes = bytesOf(lies)
      if (bytes) read.push([path, bytes])
    }
  }
  return file.write(() => {
    const prints: Record<string, string> = {}
    for (const [path, held] of read) prints[path] = typeof held === 'string' ? held : keepBlob(file, held)
    const description = o.description ? keepDescription(file, o.description) : built
    const at = Date.now()
    const now = pointerOf(file, 'now')
    const parent = now === undefined ? undefined : readPoint(file, now)
    const joined =
      o.kind === 'save' &&
      parent?.kind === 'save' &&
      at - parent.at <= rules.join &&
      !standingOn(file, parent.id).length
        ? parent
        : undefined
    const left = large.length ? `Left out, larger than ${rules.fileSize} bytes: ${large.join(', ')}` : undefined
    const unkept = unwritable.length
      ? `Not kept, a name that not every system holds: ${unwritable.join(', ')}`
      : undefined
    const note = [o.note, left, unkept].filter((one) => one !== undefined).join('\n')
    const held: Omit<Point, 'id'> = {
      parents: merged ? merged.parents : joined ? joined.parents : now === undefined ? [] : [now],
      at,
      by: { kind: o.by.kind, ...(o.by.id !== undefined ? { id: o.by.id } : {}) },
      kind: o.kind,
      ...(o.name !== undefined ? { name: o.name } : {}),
      ...(o.checked !== undefined ? { checked: o.checked } : {}),
      ...(description !== undefined ? { description } : {}),
      files: prints,
      ...(note !== '' ? { note } : {}),
      ...(merged?.clashes.length ? { unsettled: true as const, clashes: merged.clashes } : {}),
    }
    if (joined) file.run('DELETE FROM points WHERE id = ?', [joined.id])
    const point = stand(file, held)
    // What the new point gave back its bytes names the point that changed it before the one whose place it took.
    if (joined && joined.id !== point.id) forgetChanges(file, joined.id)
    return point
  })
}

/** Keeps what a point holds as a point with its id, moves `now` to it, and answers it. */
export function stand(file: SqliteFile, held: Omit<Point, 'id'>): Point {
  const point = { id: idOf(held), ...held }
  keepPoint(file, point)
  follow(file, point.id)
  keepChanges(file, point.id, (a, b) => comparedAnew(file, a, b))
  return point
}
