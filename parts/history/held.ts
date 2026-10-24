import type { Dirent } from 'node:fs'
import { readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Description } from '../core/internal.ts'
import { limitDefaults } from '../core/internal.ts'
import { isEngineName, isGitName, isHeldPath } from './paths.ts'

/** What a project says of its history: what no point holds, its roots, and its limits. */
export interface Rules {
  leave: string[]
  roots: string[]
  fileSize: number
  join: number
}

const textsOf = (value: unknown): string[] | undefined =>
  Array.isArray(value) ? value.filter((one) => typeof one === 'string') : undefined

/** The rules of a description, or those that hold where a project states none. */
export function rulesOf(description: Pick<Description, 'project'> | undefined): Rules {
  const project = description?.project ?? {}
  const limits = Object(project.limits)
  const limit = (name: string): number => {
    const stated: unknown = limits[name]
    return typeof stated === 'number' ? stated : (limitDefaults.project[name] ?? 0)
  }
  return {
    leave: textsOf(Object(project.history).leave) ?? ['node_modules/'],
    roots: textsOf(project.roots) ?? [],
    fileSize: limit('historyFileSize'),
    join: limit('historyJoin'),
  }
}

/** A written pattern as what it tests: `*` stands for any run of characters inside one name. */
const tested = (pattern: string): RegExp =>
  new RegExp(
    `^${pattern
      .split('*')
      .map((piece) => piece.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('[^/]*')}$`,
  )

/**
 * Whether a pattern of `leave` names a path. A pattern that ends with `/` names a folder and all that lies in it,
 * and any other a file. One that holds no other `/` is a name, and fits at any depth; one that does is a path from
 * the folder of the project.
 */
function names(pattern: string, path: string): boolean {
  const folder = pattern.endsWith('/')
  const written = folder ? pattern.slice(0, -1) : pattern
  if (written === '') return false
  const test = tested(written)
  const parts = path.split('/')
  // Of a file its folders are tried for a folder, and its whole path or its own name for a file.
  const tries = folder ? parts.slice(0, -1) : parts
  if (written.includes('/'))
    return folder ? tries.some((_, k) => test.test(tries.slice(0, k + 1).join('/'))) : test.test(path)
  return folder ? tries.some((name) => test.test(name)) : test.test(parts[parts.length - 1])
}

/** The folder that a path of a point lies in, and its path there: the folder of the project, or one of its roots. */
export function placeOf(project: string, roots: string[], path: string): { folder: string; path: string } | undefined {
  const found = /^roots\/(\d+)\/(.+)$/.exec(path)
  if (!found) return { folder: project, path }
  const root = roots[Number(found[1])]
  return root === undefined ? undefined : { folder: resolve(project, root), path: found[2] }
}

/**
 * Takes the folder of a project and its rules. Answers every file that a point holds, by its path with forward
 * slashes, with where it lies: all that lies in the folder and in its roots, but for the engine's own folder, a
 * git repository at any depth, the clash file, a file that ends in `.theirs`, what `leave` names, a file larger
 * than the limit, which `large` names, and a file whose name not every system holds, which `unwritable` names. A
 * link is no file of the folder, and is passed over, as is a file that went away since its folder was read.
 */
export function heldFiles(
  project: string,
  rules: Rules,
): { files: Map<string, string>; large: string[]; unwritable: string[] } {
  const files = new Map<string, string>()
  const large: string[] = []
  const unwritable: string[] = []
  const walk = (folder: string, at: string, prefix: string): void => {
    let entries: Dirent[]
    try {
      entries = readdirSync(join(folder, at), { withFileTypes: true })
    } catch {
      // A root that is not there holds no file.
      return
    }
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const path = at ? `${at}/${entry.name}` : entry.name
      if (prefix === '' && (isEngineName(path) || path === 'tent.clash.ts')) continue
      // The history and a git repository of the same folder know nothing of each other, whatever `leave` names.
      if (isGitName(entry.name)) continue
      if (entry.isDirectory()) {
        if (!rules.leave.some((pattern) => names(pattern, `${path}/-`))) walk(folder, path, prefix)
      } else if (entry.isFile()) {
        if (path.endsWith('.theirs') || rules.leave.some((pattern) => names(pattern, path))) continue
        // A point that held it could be written back on no system that refuses its name.
        if (!isHeldPath(`${prefix}${path}`)) {
          unwritable.push(`${prefix}${path}`)
          continue
        }
        const lies = join(folder, path)
        const size = sizeOf(lies)
        if (size === undefined) continue
        if (size > rules.fileSize) large.push(`${prefix}${path}`)
        else files.set(`${prefix}${path}`, lies)
      }
    }
  }
  walk(resolve(project), '', '')
  for (const [k, root] of rules.roots.entries()) walk(resolve(project, root), '', `roots/${k}/`)
  return { files: new Map([...files].sort(([a], [b]) => (a < b ? -1 : 1))), large, unwritable }
}

/** The size of a file, or nothing for one that went away, as an editor's save takes a file away for a moment. */
function sizeOf(lies: string): number | undefined {
  try {
    return statSync(lies).size
  } catch {
    return undefined
  }
}
