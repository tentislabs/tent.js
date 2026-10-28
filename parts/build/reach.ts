import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fingerprintOf } from '../core/internal.ts'
import { keptWhole, scanned } from './lookups.ts'
import { namedFile, sourceFile, textOf } from './source.ts'
import type { SourceFile, Work } from './work.ts'

// The one graph of the project: what each file imports of the others, by the names its text writes. What a step
// keeps of a file is kept by the fingerprint of the file with everything it reaches, so that a save makes anew
// what reaches the saved file, and nothing else.

const print = (text: string): string => fingerprintOf(new TextEncoder().encode(text))

/** The files that a file of the project names by a path that starts with a dot, each where it lies. */
function namedBy(file: SourceFile): string[] {
  return (file.seen?.named ?? [])
    .map((named) => (named.from.startsWith('.') ? namedFile(file.file, named.from) : undefined))
    .filter((one) => one !== undefined)
}

/** What a build knows of its graph, worked out once: each file by where it lies, and the fingerprint of each reach. */
interface Graph {
  byFile: Map<string, SourceFile>
  prints: Map<string, string>
}

const graphs = new WeakMap<Work, Graph>()

/** The graph of a build. The files of the project are all found when a step first asks for it. */
function graphOf(work: Work): Graph {
  const held = graphs.get(work)
  if (held && held.byFile.size === work.files.size) return held
  const made = {
    byFile: new Map([...work.files.values()].map((file) => [file.file, file] as const)),
    prints: new Map(),
  }
  graphs.set(work, made)
  return made
}

/**
 * The files of the project that the files reach by their imports, however deep, they among them, each where it
 * lies: whatever the builder was handed or read itself, what is kept is held to each of these.
 */
export function reached(work: Work, files: SourceFile[]): string[] {
  const { byFile } = graphOf(work)
  const found = new Set<string>()
  const left = files.map((file) => file.file)
  for (let lies = left.pop(); lies !== undefined; lies = left.pop()) {
    if (found.has(lies)) continue
    found.add(lies)
    const file = byFile.get(lies)
    if (file) left.push(...namedBy(file).filter((target) => byFile.has(target)))
  }
  return [...found]
}

/**
 * Takes a file of the project. Answers the fingerprint of its text with the text of every file it reaches by its
 * imports, however deep, and of every file that is no code which one of them names, each by its path: one
 * fingerprint for one reach, whatever else changed.
 */
export function reachPrint(work: Work, file: SourceFile): string {
  const { byFile, prints } = graphOf(work)
  const held = prints.get(file.path)
  if (held !== undefined) return held
  // Each file stands for the fingerprint of its own text, worked out once in the build.
  const own = (one: SourceFile): string => {
    const known = prints.get(`\0${one.path}`) ?? print(`${one.path}\n${one.text}`)
    prints.set(`\0${one.path}`, known)
    return known
  }
  const texts: string[] = []
  for (const lies of reached(work, [file]).sort()) {
    const one = byFile.get(lies)
    if (!one) continue
    texts.push(own(one))
    for (const target of namedBy(one))
      if (!byFile.has(target)) texts.push(`${target}\n${existsSync(target) ? textOf(target) : ''}`)
  }
  const made = print(texts.join('\0'))
  prints.set(file.path, made)
  return made
}

/** A file of the folder of a project that the build did not read, as a test file, read with what it imports. */
function readOutside(work: Work, lies: string): SourceFile {
  const file = sourceFile(relative(work.folder, lies).split(sep).join('/'), lies)
  if (file.tree) file.seen = scanned(file.tree)
  return file
}

/**
 * Takes a path from the folder of a project, of a file that the build may not have read, as a test file or
 * `engine.ts`. Answers the fingerprint of its text with every file it reaches by its imports, however deep, each by
 * its path from the folder: a file that the build read stands for its whole reach, as `reachPrint` gives it. A file
 * that is not there has a fingerprint of its own.
 */
export function pathPrint(work: Work, path: string): string {
  const read = work.files.get(path)
  if (read) return reachPrint(work, read)
  const lies = join(work.folder, path)
  if (!existsSync(lies)) return print(`${path}\nnone`)
  const { byFile } = graphOf(work)
  const texts: string[] = []
  const seen = new Set<string>()
  const left = [readOutside(work, lies)]
  for (let one = left.pop(); one !== undefined; one = left.pop()) {
    if (seen.has(one.file)) continue
    seen.add(one.file)
    texts.push(print(`${one.path}\n${one.text}`))
    for (const target of namedBy(one)) {
      const built = byFile.get(target)
      if (built) texts.push(`${built.path}\n${reachPrint(work, built)}`)
      else if (/\.[mc]?[jt]sx?$/.test(target)) left.push(readOutside(work, target))
      else texts.push(`${relative(work.folder, target).split(sep).join('/')}\n${textOf(target)}`)
    }
  }
  return print(texts.sort().join('\0'))
}

/** The files beside a project that say which packages are installed: its lists of packages and their locks. */
const lockFiles = [
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
  'node_modules/.package-lock.json',
  'node_modules/.modules.yaml',
  'node_modules/.yarn-state.yml',
]

/** The names of the packages that lie installed in a folder of packages, a scope's among them. */
function installed(folder: string): string[] {
  if (!existsSync(folder)) return []
  return readdirSync(folder).flatMap((name) =>
    name.startsWith('@') ? readdirSync(join(folder, name)).map((inner) => `${name}/${inner}`) : [name],
  )
}

// The fingerprint of what says which packages are installed, by the build: read once for each build.
const locks = new WeakMap<Work, string>()

/** The bytes of a file of a project as text, by its path in the project, and nothing for one that is not there. */
const bytesAt = (work: Work, path: string): string => {
  try {
    return readFileSync(join(work.folder, path)).toString('base64')
  } catch {
    return ''
  }
}

/**
 * The fingerprint of what says which packages a project has installed: its lists of packages, their locks, and the
 * names of the packages that lie in its folder of packages. A development build holds what it made of a package to
 * it, as Vite holds its prebundled packages to the lock, and reads no file of a package for it.
 */
export function lockPrint(work: Work): string {
  const held = locks.get(work)
  if (held !== undefined) return held
  const made = print(
    [...lockFiles.map((path) => bytesAt(work, path)), installed(join(work.folder, 'node_modules')).join('\n')].join(
      '\0',
    ),
  )
  locks.set(work, made)
  return made
}

const seenWhole = new WeakSet<Work>()

/**
 * Holds what a session kept to what every file of the project reaches: the project's own file with what it
 * imports, the makers of the adapters, the packages that are installed and the files that lock
 * them. Where one of these changed since the last build of the session,
 * nothing is kept, and the build makes everything anew. Is asked by each step before it takes what it kept.
 */
export function keeps(work: Work): void {
  if (seenWhole.has(work)) return
  seenWhole.add(work)
  const project = [...work.files.values()].find((file) => file.seen?.declared.some((one) => one.word === 'project'))
  const whole = [
    project ? `${project.path}\n${reachPrint(work, project)}` : '',
    bytesAt(work, 'engine.ts'),
    lockPrint(work),
  ]
  keptWhole(print(whole.join('\0')))
}
