import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { TentError } from '../../core/index.ts'
import type { Loaded } from '../../core/internal.ts'
import { describing } from '../../core/internal.ts'
import { isDefinition, loadedOf, looseFound } from '../defined.ts'
import { keeping } from '../lookups.ts'
import { readSeed } from '../read/arrows.ts'
import { readFiles, reachOf, textFile } from '../read/files.ts'
import type { Around, PlainFile } from '../read/plain.ts'
import { readPlain } from '../read/plain.ts'
import { NotPlain } from '../read/reach.ts'
import type { Declared } from '../read/scan.ts'
import { scanOf } from '../read/scan.ts'
import { keeps, reachPrint } from '../reach.ts'
import { runFiles } from '../run.ts'
import { keptPath, namedFile, sourceFile, textOf } from '../source.ts'
import type { Node } from '../tree.ts'
import { kid, kids, propertyOf, unwrap } from '../tree.ts'
import type { SourceFile, Step, Work } from '../work.ts'
import { found, threw } from '../work.ts'

/** Reports what a backend file holds that is no top-level definition: a definition made elsewhere, and a helper that is exported. */
function shapeOf(work: Work, file: SourceFile): void {
  looseFound(work, file)
  const helpers = [...(file.seen?.helpers ?? [])]
  if (file.seen?.byDefault) helpers.push({ name: 'default', node: file.seen.byDefault })
  for (const one of helpers)
    found(
      work,
      'T1006',
      file,
      one.node,
      `The backend file ${file.path} exports \`${one.name}\`, which is no definition.`,
      `Take \`export\` away where only this file uses \`${one.name}\`. A helper that other files use lives in a file of its own, which imports neither \`tentjs\` nor \`tentjs/ui\`.`,
    )
}

/** What the plain reader is told of one arrow. */
function arrowOf(file: SourceFile, node: Node): ReturnType<Around['arrow']> {
  for (const read of file.arrows.values()) {
    const tried = read.arrows.get(node)
    if (tried) return tried.thing !== undefined && tried.at ? { thing: tried.thing, node: tried.at } : undefined
  }
  return 'unknown'
}

/** One backend definition as `describe` is handed it, with what was read of its arrows. */
const backendLoaded = (file: SourceFile, declared: Declared, made: object): Loaded =>
  loadedOf(file, declared, made, file.arrows.get(declared.exportName))

/**
 * What running a backend file gave, kept by the fingerprint of the file with everything it reaches: a file that a
 * save did not reach is not run again, and gives the very definitions it gave before.
 */
const given = keeping<{ print: string; given: Record<string, unknown> }>()

/** Loads every backend file: read where the plain reader takes it, and run once where it does not. */
export const step: Step = {
  order: 3,
  run: async (work) => {
    const all = [...work.files.values()].sort((a, b) => (a.path < b.path ? -1 : 1))
    const backend = all.filter((file) => file.sort === 'backend')
    const known = readFiles(work)

    // The starter data is a file of the project that is read by its default.
    const lies = join(work.folder, 'seed.ts')
    const seed = existsSync(lies) ? sourceFile('seed.ts', lies) : undefined
    if (seed) {
      work.files.set('seed.ts', seed)
      seed.sort = 'seed'
      if (seed.tree) seed.seen = scanOf(seed.tree)
      else
        found(
          work,
          'T1014',
          seed,
          seed.unread?.line,
          `The file cannot be read: ${seed.unread?.words}`,
          'Mend the text of the file.',
        )
    }
    let seedBody: object[] | undefined
    let seedWhy: { thing: string; node: Node } | undefined
    const seedCall = seed?.seen?.byDefault ? unwrap(seed.seen.byDefault) : undefined
    const [seedArrow] = seedCall?.type === 'CallExpression' ? kids(seedCall, 'arguments').map(unwrap) : []
    if (seed && seedArrow && /^(?:Arrow)?FunctionExpression$/.test(seedArrow.type)) {
      try {
        seedBody = readSeed(seedArrow, reachOf(work, seed, known))
      } catch (failure) {
        if (!(failure instanceof NotPlain)) throw failure
        seedWhy = { thing: failure.thing, node: { type: '', start: failure.at, end: failure.at } }
      }
    }

    for (const file of backend) {
      for (const declared of file.seen?.declared ?? []) {
        const read = file.arrows.get(declared.exportName)
        if (!read) continue
        for (const one of read.refused)
          found(
            work,
            one.code,
            file,
            one.line,
            `${declared.name ?? declared.exportName}: ${one.message}`,
            'Take it out of the arrow.',
            declared.name,
          )
        // A definition that states `plain: true` must stay plain: what makes it code is an error on its line.
        const plain = kid(propertyOf(declared.options, 'plain'), 'value')
        if (read.why && plain && unwrap(plain).value === true)
          found(
            work,
            'T1010',
            file,
            read.why.line,
            `${declared.name ?? declared.exportName} states \`plain: true\`, and its \`${read.why.option}\` holds ${read.why.thing}.`,
            'Write it with our words alone, or take `plain: true` away.',
            declared.name,
          )
      }
      shapeOf(work, file)
    }
    const reading = new Map<string, PlainFile | 'reading'>()
    const readFile = (file: SourceFile): PlainFile | undefined => {
      const held = reading.get(file.path)
      if (held) return held === 'reading' ? undefined : held
      const { tree, seen } = file
      if (!tree || !seen) return undefined
      reading.set(file.path, 'reading')
      const around: Around = {
        imported: (from, name) => {
          const target = namedFile(file.file, from)
          const path = target ? keptPath(work, target) : undefined
          const other = path !== undefined ? work.files.get(path) : undefined
          // What a helper file or a file that is no code gives is no definition: its use is what is not taken.
          if (other?.sort !== 'backend') return undefined
          const read = readFile(other)
          if (!read) return { thing: `an import from ${other.path}, which imports this file in a ring` }
          if (read.made.has(name) && !read.notTaken.length) return { value: read.made.get(name) }
          return { thing: `an import from ${other.path}, which is run` }
        },
        textFile: (from) => {
          const target = namedFile(file.file, from)
          return target && textFile.test(target) && keptPath(work, target) !== undefined ? textOf(target) : undefined
        },
        arrow: (node) => (file === seed ? (node === seedArrow ? seedWhy : 'unknown') : arrowOf(file, node)),
      }
      const read = describing(() => readPlain(tree, seen, around))
      // What is no failure of a word may be a limit of the reader: the file is then run, as code is.
      for (const one of read.failed)
        if (!(one.error instanceof TentError))
          read.notTaken.push({
            thing: `a definition that cannot be made from what was read (${one.error instanceof Error ? one.error.message : String(one.error)})`,
            node: one.node,
          })
      reading.set(file.path, read)
      return read
    }

    const runs: SourceFile[] = []
    const take = (file: SourceFile, loaded: (read: PlainFile) => void): void => {
      const read = readFile(file)
      if (!read) return
      if (read.notTaken.length) {
        file.taken = 'run'
        runs.push(file)
        return
      }
      file.taken = 'read'
      for (const one of read.failed) if (one.error instanceof TentError) threw(work, file, one.node, one.error)
      loaded(read)
    }
    for (const file of backend)
      take(file, (read) => {
        for (const declared of file.seen?.declared ?? []) {
          const made = read.made.get(declared.exportName)
          if (!isDefinition(made)) continue
          work.loaded.push(backendLoaded(file, declared, made))
          if (read.holed.has(declared.exportName)) work.holed.add(String(Reflect.get(made, 'definition')))
        }
      })
    const seedLoaded = (made: unknown, body: object[] | undefined): void => {
      if (seed && typeof made === 'object' && made !== null)
        work.loaded.push({ value: made, file: 'seed.ts', line: 1, ...(body ? { bodies: { run: body } } : {}) })
    }
    if (seed?.tree) take(seed, (read) => seedLoaded(read.byDefault, seedBody))

    if (!runs.length) return
    keeps(work)
    // The builder makes the modules of every file that is run, for the bundle; a file the save did not reach is
    // not run again.
    const fresh = runs.filter((file) => given.get(file.path)?.print !== reachPrint(work, file))
    const ran = await runFiles(work, runs, fresh)
    for (const file of runs) {
      const held = given.get(file.path)
      const exports = held?.print === reachPrint(work, file) ? held : ran.get(file.path)
      if (!exports || 'error' in exports) {
        threw(work, file, undefined, exports?.error ?? new Error('the builder made no module of the file'))
        continue
      }
      given.set(file.path, { print: reachPrint(work, file), given: exports.given })
      if (file === seed) seedLoaded(exports.given.default, undefined)
      for (const declared of file.seen?.declared ?? []) {
        const made = exports.given[declared.exportName]
        if (isDefinition(made)) work.loaded.push(backendLoaded(file, declared, made))
      }
    }
  },
}
