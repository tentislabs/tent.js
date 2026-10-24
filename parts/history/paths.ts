import { lstatSync } from 'node:fs'
import { join } from 'node:path'
import { filePathFault } from '../core/internal.ts'

/** Whether a name is that of the folder of a git repository, in any case: a disk may hold the two as one. */
export const isGitName = (name: string): boolean => name.toLowerCase() === '.git'

/** Whether a name is that of the engine's own folder, in any case: a disk may hold the two as one. */
export const isEngineName = (name: string): boolean => name.toLowerCase() === '.tent'

/**
 * Whether a text is a path that a point may hold a file under: names with `/` between them, none of them empty,
 * `.` or `..`, that a disk of every system takes inside a folder (`filePathFault` of `core`), not
 * inside the engine's own folder and not inside a git repository. So a point that came from another history writes
 * no file outside the folder it is written into, none that git or the engine reads as its own, and every point can
 * be written back on every system.
 */
export function isHeldPath(path: string): boolean {
  if (filePathFault(path) !== undefined) return false
  const names = path.split('/')
  return names.every((name) => !isGitName(name)) && !isEngineName(names[0])
}

/**
 * Takes a folder and a path under it. Answers what stands in the way of a file there being a file of that folder:
 * `link` where a name on the way or the file itself is a link, which may lead out of the folder, `file` where a
 * name on the way is a file, `folder` where a folder stands under the name of the file, and nothing where the
 * way is made of real folders alone.
 */
export function inTheWay(folder: string, path: string): 'link' | 'file' | 'folder' | undefined {
  const names = path.split('/')
  let at = folder
  for (const [k, name] of names.entries()) {
    at = join(at, name)
    const last = k === names.length - 1
    let found: ReturnType<typeof lstatSync>
    try {
      found = lstatSync(at)
    } catch {
      // Nothing stands here, so nothing stands below it.
      return undefined
    }
    if (found.isSymbolicLink()) return 'link'
    if (last && found.isDirectory()) return 'folder'
    if (!last && !found.isDirectory()) return 'file'
  }
  return undefined
}
