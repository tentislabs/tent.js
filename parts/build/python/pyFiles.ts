import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { keptPath } from '../source.ts'
import type { Work } from '../work.ts'

// Folders whose `.py` files are no code of the project, wherever they stand: packages, an environment, what Python
// wrote for itself. A folder whose name starts with a dot is left out too.
const leftOut = new Set(['node_modules', 'venv', '__pycache__'])
// Folders left out in the root alone: the engine's own, and the tests of the app.
const leftInRoot = new Set(['tests'])

/** Every file under a folder that is no link and lies in no folder that is left out, by its path, written with `/`. */
function filesUnder(folder: string, path = ''): string[] {
  const found: string[] = []
  for (const entry of readdirSync(join(folder, path), { withFileTypes: true })) {
    const below = path ? `${path}/${entry.name}` : entry.name
    // A link is no file of the project: what it leads to may lie anywhere, and is never followed.
    if (entry.isSymbolicLink() || entry.name.startsWith('.')) continue
    if (entry.isDirectory()) {
      if (!leftOut.has(entry.name) && !(path === '' && leftInRoot.has(entry.name)))
        found.push(...filesUnder(folder, below))
    } else if (entry.isFile()) found.push(below)
  }
  return found
}

/** Every file under a folder but the engine's own, links among them, by its path: what a pattern of `files` may name. */
function everyFileUnder(folder: string, path = ''): string[] {
  const found: string[] = []
  for (const entry of readdirSync(join(folder, path), { withFileTypes: true })) {
    const below = path ? `${path}/${entry.name}` : entry.name
    if (path === '' && entry.name === '.tent') continue
    if (entry.isDirectory() && !entry.isSymbolicLink()) found.push(...everyFileUnder(folder, below))
    else found.push(below)
  }
  return found
}

/** A pattern of `files` as a test of a path: `*` stands for any part of one name, and `**` for any folders. */
function patternOf(pattern: string): RegExp {
  const pieces = pattern.split('/')
  const written = pieces.map((piece, at) => {
    const last = at === pieces.length - 1
    if (piece === '**') return last ? '.*' : '(?:[^/]+/)*'
    const name = piece
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]')
    return last ? name : `${name}/`
  })
  return new RegExp(`^${written.join('')}$`)
}

/**
 * Takes the work of a build and the patterns of `files` of each `python`, by its name. Answers each file that goes
 * under `python/` of the bundle, by its path there, with where it lies: every `.py` file of the project and of its
 * roots that lies in no folder that is left out and is no link, a root's under `roots/<its place>/`, and every file
 * that a pattern names. Answers apart each file that a pattern names and that lies outside the project and its
 * roots once every link is followed, with the definition that named it.
 */
export function pythonFiles(
  work: Work,
  patterns: Record<string, string[]>,
): { files: Map<string, string>; outside: { definition: string; path: string }[] } {
  const files = new Map<string, string>()
  const folders = [work.folder, ...work.roots]
  for (const [at, folder] of folders.entries()) {
    if (!existsSync(folder)) continue
    for (const path of filesUnder(folder).filter((one) => one.endsWith('.py')))
      files.set(at === 0 ? path : `roots/${at - 1}/${path}`, join(folder, path))
  }
  const outside: { definition: string; path: string }[] = []
  const all = everyFileUnder(work.folder)
  for (const [definition, written] of Object.entries(patterns))
    for (const pattern of written) {
      const test = patternOf(pattern.replace(/^\.\//, ''))
      for (const path of all.filter((one) => test.test(one))) {
        const lies = join(work.folder, path)
        // A file that a pattern names may be a link: it is taken where what it leads to lies inside.
        if (keptPath(work, lies) === undefined) outside.push({ definition, path })
        else if (existsSync(lies) && statSync(lies).isFile()) files.set(path, lies)
      }
    }
  return { files, outside }
}
