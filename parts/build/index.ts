import './ownPackages.ts'
import type { Finding } from '../core/index.ts'
import type { Description } from '../core/internal.ts'
import type { PythonInstaller } from './python/lock.ts'
import { lockPython } from './python/lock.ts'
import { readsSettled } from './steps/find.ts'
import { list } from './steps/list.ts'
import type { Source } from './projectSource.ts'
import { sourceOf } from './projectSource.ts'
import type { BuildOptions, Work } from './work.ts'
import { newWork } from './work.ts'
import { lookupsFor } from './lookups.ts'

// What reads the tree of a source file, for the rules of the check, which read the same tree.
export type { Declared, Scan } from './read/scan.ts'
export { scanned as scan } from './lookups.ts'
export type { Node } from './tree.ts'
export { below, child, keyOf, kid, kids, lineOf, nameOf, propertyOf, unwrap, walk, word } from './tree.ts'
// What a build keeps, for one build or through a session of development: the check keeps what it found there too.
export type { Keeping } from './lookups.ts'
export { keeping } from './lookups.ts'

export type { Source } from './projectSource.ts'

/** Carries the steps of the build out on a folder, in their order, and answers what they made. */
async function build(
  folder: string,
  options: BuildOptions,
  writes: boolean,
  // A build of a session of development keeps what it asked the disk for the next one.
  ofSession = false,
): Promise<Work & { description: Description }> {
  lookupsFor(ofSession)
  const work = newWork(folder, options, writes)
  const steps = await Promise.all(list.map((one) => one.load()))
  for (const { step } of steps.sort((a, b) => a.step.order - b.step.order)) await step.run(work)
  if (ofSession) readsSettled()
  const description = work.description
  if (!description) throw new Error('the steps of the build described nothing')
  return { ...work, description }
}

/**
 * Takes the folder of a project, and the options of the build: `for`, which is `'dev'` or `'release'`, and `out`,
 * the folder of the bundle. Finds, sorts, loads and
 * describes the files of the project, writes its type list, builds a module for each backend file that holds
 * code, and writes the bundle with its description last. Answers the description, the folder of the bundle, the
 * version id and what was found. With an error among the findings no bundle is written, and the folder and the
 * version id are empty text.
 */
export async function buildProject(
  folder: string,
  options: BuildOptions,
): Promise<{
  description: Description
  bundleFolder: string
  versionId: string
  findings: Finding[]
  drawn: Record<string, { packages?: Record<string, string>; calls?: string[] }>
}> {
  const work = await build(folder, options, true)
  return {
    description: work.description,
    bundleFolder: work.bundleFolder ?? '',
    versionId: work.versionId ?? '',
    findings: work.findings,
    drawn: work.drawn ?? {},
  }
}

/**
 * Takes the folder of a project. Finds, sorts, loads and describes the files of the project, and writes no
 * bundle. Answers the description, the one it was before the build added what it made, which a point of the
 * history keeps, what was found, the source of the project, and for each code definition what made it code.
 */
export async function describeProject(folder: string): Promise<{
  description: Description
  described: Description
  findings: Finding[]
  source: Source
  why: Record<string, string>
}> {
  const work = await build(folder, { for: 'dev' }, false)
  return {
    description: work.description,
    described: work.described ?? work.description,
    findings: work.findings,
    source: sourceOf(work),
    why: work.why,
  }
}

/**
 * Takes the folder of a project. Builds it for development, as `buildProject` does, but for a session: the version
 * is the list of its files, each kept once by its fingerprint. Answers with the list what `buildProject` answers,
 * the source the build read and the folders that `roots` of the project names, so that the rules of the
 * check are held against the same reading and a save
 * is read once. `o` holds what the guard of the build is handed: the secret values to look for, and the secrets
 * files that could not be opened; and `checkable`, which is handed the source and the description as the check
 * reads them as soon as they are whole, while the build goes on to write the bundle. Where the save changed the look
 * alone against the version that `running` names, it answers in `swap` the modules that a page takes in place by Fast
 * Refresh, each by its path in the bundle; for every other save, and for a version the session does not keep, none.
 */
export async function buildSaved(
  folder: string,
  o: Pick<BuildOptions, 'secrets' | 'unsearched' | 'checkable'> & { running?: string } = {},
): Promise<{
  description: Description
  // The list of the files of the version, each kept once by its fingerprint in the store beside it.
  bundleList: string
  versionId: string
  findings: Finding[]
  source: Source
  roots: string[]
  described: Description
  prints: Record<string, string>
  swap?: string[]
}> {
  const { running, ...options } = o
  const work = await build(folder, { for: 'dev', ...options }, true, true)
  const prints: Record<string, string> = Object.fromEntries(work.prints)
  for (const file of work.files.values()) if (file.print !== undefined) prints[file.path] = file.print
  // The sorting is loaded with the build, as its steps are: what it reads of the views loads the builder's hooks.
  const swap = (await import('./swap.ts')).swapOf(work, prints, running)
  return {
    ...(swap ? { swap } : {}),
    description: work.description,
    // What a point of the history keeps: the same for a development build and a release.
    described: work.described ?? work.description,
    bundleList: work.bundleList ?? '',
    versionId: work.versionId ?? '',
    findings: work.findings,
    source: sourceOf(work),
    roots: work.roots,
    // The fingerprint of the bytes of each file that the build read, by its path: what a point of the history keeps.
    prints,
  }
}

/**
 * Takes the folder of a project, and what is told each file of it that was saved, added or removed, by where it
 * lies. Watches the folder with the builder's own watcher: what lies in the engine's own folder, among the
 * packages of the project, and the type list that a build writes, is no save. Answers what ends the watching.
 */
export async function watchProject(folder: string, saved: (file: string) => void): Promise<{ close(): Promise<void> }> {
  return (await import('./borrowed/vite.ts')).watching(folder, saved)
}

// The npm that the runtime came with, found where it lies on every system: what installs the packages of a project.
export { npm, npmProgram } from './borrowed/npm.ts'

export { readBody } from './read/sequence.ts'
// The tree of a text as a build reads it, for the rules where they run on a thread of their own.
export { treeOfText } from './source.ts'
// What a session of development has the build remove of the files of the versions it no longer loads.
export { storeTidied } from './steps/write.ts'

/**
 * Takes the folder of a project, and what makes the installer of packages, as the engine hands it, from `python` of
 * `project`. Describes the project, and resolves the `packages` of its `python` definitions into each of its locks,
 * written into its root, as `tent python lock` does: a lock that is out of date is what it makes anew. Answers the
 * Python the locks were made for, the files written, and what was found: what the description finds wrong stops
 * it, and a lock that could not be made is T7020.
 */
export async function lockProject(
  folder: string,
  installerFor: (python: Record<string, unknown>) => PythonInstaller,
): Promise<{ python: string; written: string[]; findings: Finding[] }> {
  const { description, findings } = await describeProject(folder)
  // A lock that does not fit what the project names is what the command is for.
  const stops = findings.filter((one) => one.level === 'error' && one.code !== 'T7020')
  if (stops.length) return { python: '', written: [], findings: stops }
  const python: unknown = description.project.python
  const stated = typeof python === 'object' && python !== null ? { ...python } : {}
  return lockPython(folder, description, installerFor(stated))
}
