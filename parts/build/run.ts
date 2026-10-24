import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describing, fingerprintOf } from '../core/internal.ts'
import type { Made } from './borrowed/vite.ts'
import { builderVersion, bundle } from './borrowed/vite.ts'
import { makerPrint } from './maker.ts'
import { wayOf } from './packageOf.ts'
import { reached } from './reach.ts'
import { ownSettings } from './ownSettings.ts'
import { namedFile, textOf } from './source.ts'
import type { SourceFile, Work } from './work.ts'

// A module that the builder made names the framework by its import, `tentjs`. While a file is run to collect its
// definitions, that import is answered with the very entry file this part uses, so that both hold one framework.
const entry = new URL('../core/index.ts', import.meta.url).href

registerHooks({
  // A command file names its entry: run to collect its definitions, it is handed the words of the same entry file.
  resolve: (name, context, next) =>
    name === 'tentjs' || name === 'tentjs/cli' ? { url: entry, shortCircuit: true } : next(name, context),
})

const print = (text: string): string => fingerprintOf(new TextEncoder().encode(text))

/** The name of the module of a source file: its path, with a dot for each folder and without its ending. */
export const moduleName = (path: string): string => path.replace(/\.tsx?$/, '').replaceAll('/', '.')

/** The folder in which the build keeps what it made, which is safe to delete. */
export function cacheFolder(work: Work): string {
  const inProject = join(work.folder, '.tent', 'cache')
  try {
    mkdirSync(inProject, { recursive: true })
    return inProject
  } catch {
    // A project that cannot be written is still built: what is kept lies with the system's temporary files.
    const elsewhere = join(tmpdir(), 'tent-cache', print(work.folder).slice(0, 12))
    mkdirSync(elsewhere, { recursive: true })
    return elsewhere
  }
}

/**
 * What the modules of the builder are kept under: the versions of the tools, the options, and the files that are
 * run, each where it lies, so that a copy of the project with its folder of what was kept builds its own. Beside it,
 * what was kept is held to each file that the builder read for it, so that a save of a file that none of these
 * modules reads keeps them.
 */
function keyOf(work: Work, files: SourceFile[]): object {
  return {
    builder: builderVersion(),
    maker: makerPrint(),
    runtime: process.version,
    for: work.options.for,
    run: files.map((file) => file.file),
  }
}

/** The fingerprint of each file that the builder read, as it stands now, with every text file that one names. */
function printsOf(work: Work, read: string[]): Record<string, string> {
  const byFile = new Map([...work.files.values()].map((file) => [file.file, file] as const))
  const prints: Record<string, string> = {}
  for (const lies of read) {
    const file = byFile.get(lies)
    prints[lies] = file ? print(file.text) : existsSync(lies) ? print(textOf(lies)) : ''
    // A file that is no code but is named by one, as a text file, is a source of the module too.
    for (const named of file?.seen?.named ?? []) {
      const target = named.from.startsWith('.') ? namedFile(file?.file ?? '', named.from) : undefined
      if (target && !/\.tsx?$/.test(target)) prints[target] = print(textOf(target))
    }
  }
  return prints
}

/** Has the builder make the modules of the files that are run, or takes them as they were kept for the same sources. */
async function modulesOf(work: Work, files: SourceFile[]): Promise<Made[]> {
  const kept = join(cacheFolder(work), `modules.${work.options.for}.json`)
  const key = JSON.stringify(keyOf(work, files))
  if (existsSync(kept)) {
    try {
      const held: unknown = JSON.parse(readFileSync(kept, 'utf8'))
      const made: unknown = typeof held === 'object' && held !== null ? Reflect.get(held, 'made') : undefined
      const outs: unknown = typeof held === 'object' && held !== null ? Reflect.get(held, 'outs') : undefined
      const from: unknown = typeof held === 'object' && held !== null ? Reflect.get(held, 'from') : undefined
      const now = isPrints(from) ? printsOf(work, Object.keys(from)) : undefined
      if (
        typeof held === 'object' &&
        held !== null &&
        Reflect.get(held, 'key') === key &&
        isMade(made) &&
        isPrints(from) &&
        Object.entries(from).every(([lies, was]) => now?.[lies] === was)
      ) {
        if (isOuts(outs)) work.outs = outs
        return made
      }
    } catch {
      // What was kept cannot be read: it is made anew.
    }
  }
  const outs: Record<string, string[]> = {}
  const texts = new Map([...work.files.values()].map((file) => [file.file, file.text]))
  // Each file of the project that the builder read, which what is kept is held to.
  const read = new Set<string>()
  const made = await bundle({
    folder: work.folder,
    tsconfig: ownSettings(work.folder, cacheFolder(work)),
    inputs: Object.fromEntries(files.map((file) => [moduleName(file.path), file.file])),
    external: ['tentjs', 'tentjs/ui', 'tentjs/cli'],
    read: (file) => {
      const text = texts.get(file)
      if (text !== undefined) read.add(file)
      return text
    },
    small: work.options.for === 'release',
    // A file of a package is taken in by the builder from the disk itself: what is kept is held to it too.
    took: (file) => void read.add(file),
    outOf: (name, imported) => {
      const way = wayOf(imported)
      if (way !== undefined && !outs[name]?.includes(way)) outs[name] = [...(outs[name] ?? []), way].sort()
    },
  })
  work.outs = outs
  const from = new Set([...read, ...reached(work, files)])
  writeFileSync(kept, JSON.stringify({ key, made, outs, from: printsOf(work, [...from].sort()) }))
  return made
}

const isPrints = (value: unknown): value is Record<string, string> =>
  typeof value === 'object' && value !== null && Object.values(value).every((one) => typeof one === 'string')

const isOuts = (value: unknown): value is Record<string, string[]> =>
  typeof value === 'object' &&
  value !== null &&
  Object.values(value).every((one) => Array.isArray(one) && one.every((way) => typeof way === 'string'))

const isMade = (value: unknown): value is Made[] =>
  Array.isArray(value) &&
  value.every(
    (one) =>
      typeof one === 'object' &&
      one !== null &&
      typeof Reflect.get(one, 'name') === 'string' &&
      typeof Reflect.get(one, 'text') === 'string' &&
      Array.isArray(Reflect.get(one, 'imports')),
  )

/**
 * Takes the files that must be run for their definitions, and of them those to run now. Has the builder make the
 * modules of all of them, runs each of the second once, on the server side, with every word that asks the engine
 * answering its record, and answers what each exports, or what it threw. What the builder made is kept in the work,
 * for the modules of the bundle.
 */
export async function runFiles(
  work: Work,
  files: SourceFile[],
  run: SourceFile[] = files,
): Promise<Map<string, { given: Record<string, unknown> } | { error: unknown }>> {
  const ran = new Map<string, { given: Record<string, unknown> } | { error: unknown }>()
  try {
    work.made = await modulesOf(work, files)
  } catch (error) {
    for (const file of run) ran.set(file.path, { error })
    return ran
  }
  if (!run.length) return ran
  // A module is run from a folder that is named by its content, since the runtime runs a file once for its address.
  const folder = join(cacheFolder(work), 'run', print(JSON.stringify(work.made)).slice(0, 12))
  if (!existsSync(folder)) {
    mkdirSync(folder, { recursive: true })
    for (const one of work.made) writeFileSync(join(folder, one.name), one.text)
  }
  // A file run for its definitions may import a package that replaces `fetch` of the runtime as it loads. The
  // build leaves the runtime as it found it, so collecting the definitions changes nothing the engine then holds.
  const fetchBefore = globalThis.fetch
  try {
    for (const file of run) {
      const name = `${moduleName(file.path)}.js`
      try {
        const given: Record<string, unknown> = await describing(() => import(pathToFileURL(join(folder, name)).href))
        ran.set(file.path, { given: { ...given } })
      } catch (error) {
        ran.set(file.path, { error })
      }
    }
  } finally {
    globalThis.fetch = fetchBefore
  }
  return ran
}
