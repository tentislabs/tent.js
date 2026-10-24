import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TentError } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import { filePathFault, write } from '../../core/internal.ts'
import type { App } from '../../engine/index.ts'
import type { History, Point } from '../../history/index.ts'
import { idOf } from '../../history/index.ts'
import { refusedPush } from './merged.ts'
import { notAsNamed } from './named.ts'

/** The pointer that keeps the files of the bundle of a version, as a point of its own that is never dropped. */
const bundleAt = (version: string): string => `bundle:${version}`

/** Whether a text is a path that a file of a bundle may lie under: one that a disk of every system takes inside a folder. */
export const isBundlePath = (path: string): boolean => filePathFault(path) === undefined

/** The failure of a publish that names what the server does not hold, or what does not fit: T9107. */
export const notHeld = (words: string, fields: Record<string, string>): TentError =>
  new TentError('T9107', words, {
    fields,
    fix: 'Publish with `tent publish`, which sends what the server lacks first.',
  })

/**
 * Keeps the files of the bundle of a version in the history of the server: a point of its own that holds them by
 * their paths. Answers its id: the pointer `bundle:<version>` is moved to it by `bundleTaken`, once the version
 * was published, so that a refused publish or a `try` changes nothing that the server takes as that version.
 * Throws T9107 for a path that leaves the bundle and for bytes it lacks.
 */
export function keepBundle(history: History, version: string, files: Record<string, string>): string {
  for (const [path, print] of Object.entries(files)) {
    if (!isBundlePath(path)) throw notHeld(`\`${path}\` is no path inside a bundle.`, { path })
    if (!history.have({ points: [], blobs: [print] }).blobs.length)
      throw notHeld(`The server holds no bytes of ${path} of the version ${version}: it was never sent.`, {
        blob: print,
      })
  }
  const held: Omit<Point, 'id'> = {
    parents: [],
    at: 0,
    by: { kind: 'server' },
    kind: 'command',
    name: bundleAt(version),
    files,
  }
  const point = { id: idOf(held), ...held }
  if (!history.read(point.id)) history.take({ points: [point] })
  return point.id
}

/** The point of the files of a version that the server published, or nothing where it published none. */
export const bundlePoint = (history: History, version: string): string | undefined => history.pointer(bundleAt(version))

/** Moves `bundle:<version>` to the point of the files that were published as that version. */
export const bundleTaken = (history: History, version: string, point: string): void =>
  history.move(bundleAt(version), point)

/** The files of the bundle of a version that the server keeps, by their paths, or nothing where it keeps none. */
export function bundleOf(history: History, version: string): Record<string, string> | undefined {
  const at = history.pointer(bundleAt(version))
  return at === undefined ? undefined : history.read(at)?.files
}

/**
 * Writes the files of a point of a bundle into a folder of its own, reads its description, which must give that
 * version id, holds every module and asset to the fingerprint its name gives, and has the app add it. Answers the
 * description. The folder is removed afterwards. Throws T9107 for a bundle the server does not keep, and for
 * files that give another version than the one named.
 */
export async function addedFrom(
  app: App,
  version: string,
  held: { history: History; at?: string },
): Promise<Description> {
  const { history, at } = held
  if (at === undefined) throw notHeld(`The server keeps no bundle of the version ${version}.`, { version })
  const folder = mkdtempSync(join(tmpdir(), 'tent-bundle-'))
  try {
    history.write(at, folder)
    const description: Description = JSON.parse(readFileSync(join(folder, 'description.json'), 'utf8'))
    if (write(description).versionId !== version)
      throw notHeld(`The files that were named give another version than ${version}.`, { version })
    const other = notAsNamed(folder, description)
    if (other) throw notHeld(`The files that were named give another version than ${version}: ${other}.`, { version })
    try {
      await app.add(folder)
    } catch (error) {
      // A module that does not load, and a browser file that holds a secret of this server, fail the version.
      throw refusedPush(
        `The version ${version} cannot be added beside the running one: ${error instanceof Error ? error.message : String(error)}`,
        { reason: 'health', code: error instanceof TentError ? error.code : 'T0009' },
        'Mend what is named, and publish again.',
      )
    }
    return description
  } finally {
    rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
  }
}
