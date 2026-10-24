import type { Finding } from '../core/index.ts'
import { TentError } from '../core/index.ts'
import type { Description, Loaded } from '../core/internal.ts'
import { finding } from '../core/internal.ts'
import type { Made } from './borrowed/vite.ts'
import type { Source } from './projectSource.ts'
import type { ArrowsRead } from './read/arrows.ts'
import type { Scan } from './read/scan.ts'
import type { ViewsRead } from './read/views.ts'
import type { Node } from './tree.ts'
import { lineOf } from './tree.ts'
import { resolve } from 'node:path'
import { placeOf } from './place.ts'

/** The options of a build. */
export interface BuildOptions {
  for: 'dev' | 'release'
  out?: string
  secrets?: string[]
  // The secrets files of this computer that it cannot open: the guard searched for none of their values.
  unsearched?: string[]
  // Is handed the source and the description as the check reads them, once they are whole: the rules of a session
  // hold them while the build writes the bundle.
  checkable?(o: { source: Source; description: Description }): void
}

/** One source file of a project. */
export interface SourceFile {
  // Its path from the folder of the project, written with `/`. A file of a root is `roots/<its place>/<its path there>`.
  path: string
  // Where it lies on this computer, written with `/`.
  file: string
  // Its text, with one line ending.
  text: string
  // The fingerprint of its bytes as they were read.
  print?: string
  // The tree that the builder's reader gave, where it could read the file.
  tree?: Node
  seen?: Scan
  // A language file is a screen file that exports `messages(...)` as its default.
  sort?: 'backend' | 'screen' | 'command' | 'helper' | 'seed' | 'messages' | 'refused'
  // What the reader of source said of a file that it cannot read.
  unread?: { line: number; words: string }
  // What was read of the arrows of each definition, by the name of its `const`.
  arrows: Map<string, ArrowsRead>
  // What was read of the arrows of each screen and each component, by the name of its `const`.
  views?: Map<string, ViewsRead>
  // Whether its definitions were made from its text, or the file must be run for them.
  taken?: 'read' | 'run'
}

/** What the steps of one build hand each other. */
export interface Work {
  folder: string
  options: BuildOptions
  // Whether a bundle is written. A build that only describes writes none.
  writes: boolean
  findings: Finding[]
  files: Map<string, SourceFile>
  // The folders that `roots` of the project names, each where it lies on this computer.
  roots: string[]
  // The files under `assets/`, each by its name there, with where it lies.
  assetFiles: Map<string, string>
  // The fingerprint of the bytes of each file that is no source file and that the build read, by its path.
  prints: Map<string, string>
  loaded: Loaded[]
  // The definitions, by their names, that the reader made with nothing in the place of a value it did not take.
  holed: Set<string>
  // What the builder made of the files that are run, and the folder it was written to for running.
  made: Made[]
  // The ways out of the computer that the code of each package takes, as the modules of the runtime it imports say.
  outs?: Record<string, string[]>
  // Of each screen and component: the components of packages it draws, with their packages.
  drawn?: Record<string, { packages?: Record<string, string> }>
  description?: Description
  // The description as `describe` gave it, before what was built was written into it.
  described?: Description
  why: Record<string, string>
  // The files of the bundle that were made so far, each by its path in the bundle.
  bundle: Map<string, Uint8Array>
  // The built module of each source file that holds code.
  modules: Record<string, string>
  // The style files that the code of each package brings, by the name a file of the project imports it by, each by
  // its real place, as the server's side followed it: the browser's side loads them, and never that code.
  packageLooks?: Record<string, string[]>
  // What the build made for a browser and for the drawing of the screens, as the description names it.
  browser?: Record<string, unknown>
  screens?: { screens?: string; views?: Record<string, string> }
  // Every file under `server/` that draws screens: the modules of the views, and the code they share.
  drawing?: Set<string>
  // The module that `engine.ts` of the project was built into, where it has one.
  makers?: string
  // The two files of the description of the API, by their paths in the bundle, where something is offered to it.
  api?: { openapi: string; docs: string }
  // The modules of the commands written in code, by their paths in the bundle.
  cli?: { files: string[] }
  // The file of each screen that is offered to MCP, in each language, by its path in the bundle.
  mcp?: { screens: Record<string, Record<string, string>>; frame?: string[] }
  bundleFolder?: string
  // Of a build of a session of development: the list of the files of its version, which stands for a folder, and
  // the fingerprint of each file that it lists, by its path.
  bundleList?: string
  listed?: Record<string, string>
  versionId?: string
}

/** Adds a finding of the build, with its file, its line and its fix. */
export function found(
  work: Work,
  code: string,
  file: SourceFile | string,
  at: Node | number | undefined,
  message: string,
  fix: string,
  definition?: string,
): void {
  const path = typeof file === 'string' ? file : file.path
  const text = typeof file === 'string' ? '' : file.text
  const line = typeof at === 'number' ? at : at ? lineOf(text, at.start) : 1
  work.findings.push(
    finding(code, plainWords(message), {
      fix,
      where: { file: path, line, ...(definition !== undefined ? { definition } : {}) },
    }),
  )
}

// What starts a color and a move of a terminal: the sign of an escape, a bracket, numbers, and a letter.
const colors = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, 'g')

/** A text with the colors of a terminal taken out: a finding is read by a person and by a program, in any place. */
const plainWords = (text: string): string => text.replace(colors, '')

/** Reports what a word threw while a file was loaded, at the line it is known for. */
export function threw(work: Work, file: SourceFile, node: Node | undefined, error: unknown): void {
  const words = error instanceof Error ? error.message : String(error)
  if (error instanceof TentError)
    found(work, error.code, file, node, words, error.fix ?? 'Mend what the message names.')
  else
    found(work, 'T1014', file, node, `The file ${file.path} cannot be loaded: ${words}`, 'Mend what the message names.')
}

/** Takes the folder of a project, the options of a build, and whether a bundle is written. Answers the work of that build, with nothing done yet. */
export const newWork = (folder: string, options: BuildOptions, writes: boolean): Work => ({
  // The folder is known by its real place, however its path is written: so is every file that is found under it.
  folder: resolve(placeOf(folder)),
  options,
  writes,
  findings: [],
  files: new Map(),
  roots: [],
  assetFiles: new Map(),
  prints: new Map(),
  loaded: [],
  holed: new Set(),
  made: [],
  why: {},
  bundle: new Map(),
  modules: {},
})

/** The form of one step of the build: its place among the nine steps, and its work. */
export interface Step {
  order: number
  run(work: Work): Promise<void>
}
