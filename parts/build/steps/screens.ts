import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Finding } from '../../core/index.ts'
import type { Loaded } from '../../core/internal.ts'
import { describe, describing, fingerprintOf } from '../../core/internal.ts'
import { loadTsx } from '../borrowed/vite.ts'
import { isDefinition, loadedOf, looseFound } from '../defined.ts'
import { knownOf, reachOf } from '../read/files.ts'
import type { Known } from '../read/reach.ts'
import type { Declared } from '../read/scan.ts'
import { readViews } from '../read/views.ts'
import { keeping, wholeKept } from '../lookups.ts'
import { keeps, reachPrint } from '../reach.ts'
import { packageModules } from '../packageModules.ts'
import { cacheFolder, moduleName } from '../run.ts'
import { ViewsRefused, viewModules } from '../viewModules.ts'
import type { SourceFile, Step, Work } from '../work.ts'
import { threw } from '../work.ts'

// A module that the builder made of a screen file names the screen side by its import. While such a file is run to
// collect its definitions, that import is answered with the very entry file this part uses, so that the words of
// a screen file and the description hold one framework. What such a module asks of React is found from there too.
const entry = new URL('../../screens/index.ts', import.meta.url).href
// The address each module of a package that was run was first found at, by its file.
const packagesRun = new Map<string, string>()
const ofReact = ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom', 'react-dom/client']
registerHooks({
  resolve: (name, context, next) => {
    if (!context.parentURL?.includes('/run-screens/')) return next(name, context)
    if (name === 'tentjs/ui') return { url: entry, shortCircuit: true }
    // A package built apart lies beside the modules that are run, and is run once for every build that holds the
    // same file, which is named by what was built.
    if (name.startsWith('tent-package:')) {
      const file = name.slice('tent-package:'.length)
      const url = packagesRun.get(file) ?? new URL(file, context.parentURL).href
      packagesRun.set(file, url)
      return { url, shortCircuit: true }
    }
    return next(name, ofReact.includes(name) ? { ...context, parentURL: entry } : context)
  },
})

/** One screen or component as `describe` is handed it, with what was read of its arrows. */
const viewLoaded = (file: SourceFile, declared: Declared, made: object): Loaded =>
  loadedOf(file, declared, made, file.views?.get(declared.exportName))

/** Reads the arrows of every screen and every component, and reports what a screen file may not hold. */
function readArrows(work: Work, file: SourceFile, known: Map<string, Map<string, Known>>): void {
  if (!file.tree || !file.seen) return
  const reach = reachOf(work, file, known)
  file.views = new Map()
  for (const declared of file.seen.declared) {
    if (declared.word !== 'screen' && declared.word !== 'component') continue
    file.views.set(declared.exportName, readViews(declared, reach, file.text, file.tree))
  }
  looseFound(work, file)
}

/**
 * What was read of a screen file: the arrows of its views with what they made the build find. Kept by the
 * fingerprint of the file with everything it reaches: a save reads anew the files that reach the saved one.
 */
interface Read {
  print: string
  views: SourceFile['views']
  findings: Finding[]
}

const reads = keeping<Read>()

/**
 * What running a screen file gave, kept by the fingerprint of the file with everything it reaches: a file that a
 * save did not reach is not run again, and gives the very definitions it gave before.
 */
const given = keeping<{ print: string; given: Record<string, unknown> }>()

/** Has the builder make a module of each screen file that is run, and runs each once, to collect its definitions. */
async function runFiles(
  work: Work,
  files: SourceFile[],
): Promise<Map<string, { given: Record<string, unknown> } | { error: unknown }> | undefined> {
  const ran = new Map<string, { given: Record<string, unknown> } | { error: unknown }>()
  // The entry of the screen side gives its tags, each of which is a `.tsx` file.
  loadTsx()
  try {
    // The backend files are loaded: what a screen file is handed of them is known from their own description.
    const { description } = describe({ definitions: work.loaded })
    // A module that runs a screen file is named apart from the one that draws its views, and holds the same files.
    const entries = Object.fromEntries(
      files.map((file) => [`run.${moduleName(file.path)}`, `export * from ${JSON.stringify(file.file)};\n`]),
    )
    // The packages of the screens, built apart in development: the modules that are run name them.
    const apart = await packageModules(work, description, 'server')
    const made = await viewModules(
      work,
      description,
      entries,
      'server',
      undefined,
      apart ? { packaged: apart.packaged } : {},
    )
    const packaged = [...(apart?.named.values() ?? [])].map((one) => ({
      name: one.name.slice('server/'.length),
      bytes: one.bytes,
    }))
    // A module is run from a folder that is named by its content, since the runtime runs a file once for its address,
    // and by what every file reaches: where that changed, nothing that was run before is taken.
    const print = fingerprintOf(
      new TextEncoder().encode(
        JSON.stringify([wholeKept(), ...[...made, ...packaged].map((one) => [one.name, fingerprintOf(one.bytes)])]),
      ),
    )
    const folder = join(cacheFolder(work), 'run-screens', print.slice(0, 12))
    if (!existsSync(folder)) {
      mkdirSync(folder, { recursive: true })
      for (const one of [...made, ...packaged]) writeFileSync(join(folder, one.name), one.bytes)
    }
    for (const file of files) {
      const lies = pathToFileURL(join(folder, `run.${moduleName(file.path)}.js`)).href
      try {
        const given: Record<string, unknown> = await describing(() => import(lies))
        ran.set(file.path, { given: { ...given } })
      } catch (error) {
        ran.set(file.path, { error })
      }
    }
  } catch (error) {
    // A build that is refused has said why, on the line that asks: no file of it is run, and none is blamed again.
    if (error instanceof ViewsRefused) return undefined
    for (const file of files) if (!ran.has(file.path)) ran.set(file.path, { error })
  }
  return ran
}

/** Loads every screen file, after the backend files that it names: each is run once, to collect its definitions. */
export const step: Step = {
  order: 3.5,
  run: async (work) => {
    const screens = [...work.files.values()]
      .filter((file) => file.sort === 'screen')
      .sort((a, b) => (a.path < b.path ? -1 : 1))
    if (!screens.length) return
    keeps(work)
    const known = new Map(
      [...work.files.values()]
        .filter((file) => file.sort === 'backend' || file.sort === 'screen')
        .map((file) => [file.path, knownOf(file)] as const),
    )
    for (const file of screens) {
      const print = reachPrint(work, file)
      const held = reads.get(file.path)
      if (held?.print === print) {
        file.views = held.views
        work.findings.push(...held.findings)
        continue
      }
      const before = work.findings.length
      readArrows(work, file, known)
      reads.set(file.path, { print, views: file.views, findings: work.findings.slice(before) })
    }
    const runs = screens.filter((file) => file.tree && file.seen)
    for (const file of runs) file.taken = 'run'
    if (!runs.length) return
    const fresh = runs.filter((file) => given.get(file.path)?.print !== reachPrint(work, file))
    const ran = fresh.length ? await runFiles(work, fresh) : new Map()
    if (!ran) return
    for (const file of runs) {
      const held = given.get(file.path)
      const exports = held?.print === reachPrint(work, file) ? held : ran.get(file.path)
      if (!exports || 'error' in exports) {
        threw(work, file, undefined, exports?.error ?? new Error('the builder made no module of the file'))
        continue
      }
      given.set(file.path, { print: reachPrint(work, file), given: exports.given })
      for (const declared of file.seen?.declared ?? []) {
        const made = exports.given[declared.exportName]
        if (isDefinition(made)) work.loaded.push(viewLoaded(file, declared, made))
      }
    }
  },
}
