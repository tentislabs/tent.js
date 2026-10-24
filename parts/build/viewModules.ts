import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import type { Description } from '../core/internal.ts'
import type { AskedIn } from './asked.ts'
import { asksForBytes, cleaned, isStyle, namesIt, parted } from './asked.ts'
import { insertedMap } from './insertMap.ts'
import { makerPrint } from './maker.ts'
import { placeOf } from './place.ts'
import { tagTable } from './tagPlaces.ts'
import { fingerprintOf } from '../core/internal.ts'
import type { MadeView } from './borrowed/vite.ts'
import { builderVersion, bundleViews, madeMark } from './borrowed/vite.ts'
import { keeping } from './lookups.ts'
import { lockPrint } from './reach.ts'
import { kid } from './tree.ts'
import { cacheFolder } from './run.ts'
import { ownSettings } from './ownSettings.ts'
import { namedFile } from './source.ts'
import { refreshEnd } from './refreshed.ts'
import type { ServedOut } from './servedOut.ts'
import { servedOut } from './servedOut.ts'
import { declaredStub, stubText } from './stub.ts'
import type { SourceFile, Work } from './work.ts'
import { found } from './work.ts'

/** The names by which a module finds the page code. */
const pageNames = ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom', 'react-dom/client', 'tentjs/ui']

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)
const print = (text: string): string => fingerprintOf(encode(text))

/**
 * What the builder is handed of a screen file on one side: its text, which a browser is handed without what only a
 * component drawn on the server alone holds, and what is written into it. Each definition is marked as free of
 * effects, so that a screen which another module does not use is left out of that module.
 */
function handedText(
  work: Work,
  description: Description,
  file: SourceFile,
  side: 'browser' | 'server',
): { text: string; inserts: { at: number; text: string }[] } {
  const out = side === 'browser' ? servedOut(work, description, file) : undefined
  const text = out?.text ?? file.text
  // The mark of a definition is written after its record, so it stands in front of it.
  const inserts = [
    ...(out?.inserts ?? []),
    ...(file.seen?.declared ?? [])
      .map((one) => kid(one.node, 'init')?.start)
      .filter((one) => one !== undefined)
      .map((at) => ({ at, text: '/* @__PURE__ */ ' })),
  ]
  // A development build tells the page code where each tag of the file stands.
  if (work.options.for !== 'dev') return { text, inserts }
  return { text, inserts: [...inserts, ...tagTable({ ...file, text }, inserts, out?.gone)] }
}

/** The text of a screen file as the builder is handed it on one side. */
function marked(work: Work, description: Description, file: SourceFile, side: 'browser' | 'server'): string {
  const handed = handedText(work, description, file, side)
  return insertedMap(file.path, handed.text, handed.inserts).code
}

/** What the builder is handed in place of the files of a project, for the modules of its screens. */
function handedOf(
  work: Work,
  description: Description,
  side: 'browser' | 'server',
): {
  made: Map<string, string>
  instead(file: string, importer: string | undefined): string | undefined
  read(file: string): string | { code: string; map: string } | undefined
} {
  const files = new Map([...work.files.values()].map((file) => [file.file, file] as const))
  const made = new Map<string, string>()
  for (const file of files.values()) {
    const declared = file.seen?.declared ?? []
    // Whoever asks for a backend file is answered with the stubs of its definitions, under the same names.
    if (file.sort === 'backend')
      made.set(`stub:${file.path}`, stubText(declared.map((one) => [one.exportName, declaredStub(description, one)])))
    // Another screen reaches a module as its name, its address and its state: its view is loaded when it is shown.
    const screens = declared.filter((one) => one.word === 'screen')
    if (file.sort === 'screen' && screens.length) {
      // What the file gives beside its screens is handed on as it is: a component, and a helper of its own.
      const others = [
        ...declared.filter((one) => one.word !== 'screen').map((one) => one.exportName),
        ...(file.seen?.helpers ?? []).map((one) => one.name).filter((name) => /^[A-Za-z_$][\w$]*$/.test(name)),
      ]
      made.set(
        `names:${file.path}`,
        stubText(
          screens.map((one) => [one.exportName, declaredStub(description, one)]),
          others.length ? `export { ${others.join(', ')} } from ${JSON.stringify(file.file)};\n` : '',
        ),
      )
    }
  }
  return {
    made,
    instead(lies, importer) {
      const file = files.get(lies)
      if (file?.sort === 'backend') return `stub:${file.path}`
      // The module of a screen itself, and the made-up file that hands its names on, read the file as it is.
      const own = importer === undefined || !files.has(importer)
      return file && !own && made.has(`names:${file.path}`) ? `names:${file.path}` : undefined
    },
    read(lies) {
      const file = files.get(lies)
      if (!file) return undefined
      if (file.sort !== 'screen') return file.text
      // A development build makes source maps: what was written into the file is led back to the file as it is.
      if (work.options.for !== 'dev') return marked(work, description, file, side)
      const handed = handedText(work, description, file, side)
      return insertedMap(file.path, handed.text, handed.inserts)
    },
  }
}

/** One asking for a held file that is refused: the file, by its real place, who asked, and the words it asked with. */
interface Asking {
  file: string
  by: string | undefined
  words: string
}

/** Thrown where the modules of the views are refused: what was found says why, and nothing was made. */
export class ViewsRefused extends Error {}

const isMadeUp = (file: string): boolean => /^(entry|names|stub):/.test(file)

const linesOf = (text: string): string[] => text.replace(/\r\n?/g, '\n').split('\n')

/**
 * Takes the lines of a text and the place of a file. Answers the place, from 0, of the first line on which an
 * import while running names a file by a value, where what is written before and after the value fits the file:
 * such an import names no file by its name. Answers nothing where there is none.
 */
function byValue(lines: string[], file: string): number | undefined {
  const at = lines.findIndex((written) =>
    [...written.matchAll(/\bimport\s*\(\s*`([^`]*\$\{[^`]*)`/g)].some(([, name = '']) => {
      const parts = name.split(/\$\{[^}]*\}/)
      const before = (parts[0] ?? '').replace(/^(\.{1,2}\/)+/, '')
      const after = (parts.at(-1) ?? '').replace(/[?#].*$/, '')
      return file.includes(before) && file.endsWith(after)
    }),
  )
  return at < 0 ? undefined : at
}

/**
 * Reports one asking for a held file as its text or its bytes (T1005), on the line that asks. Where the builder
 * told only which file it took in, the one that asked is looked for among the texts it read.
 */
function asked(work: Work, root: string, one: Asking, texts: Map<string, string>, around: Omit<AskedIn, 'file'>): void {
  const path = (lies: string): string => relative(root, lies).replaceAll('\\', '/')
  let by = one.by !== undefined && !isMadeUp(one.by) ? parted(one.by)[0] : undefined
  let words = [one.words]
  if (by === undefined)
    for (const [lies, written] of texts) {
      const name = namesIt(written, { ...around, file: lies }, one.file)
      if (name === undefined) continue
      by = lies
      words = [name]
      break
    }
  const last = one.file.slice(one.file.lastIndexOf('/') + 1)
  // Whoever names the file by a way that is not read here still writes its name: the first text that holds it.
  by ??= [...texts].find(([, written]) => written.toLowerCase().includes(last.toLowerCase()))?.[0]
  by ??= [...texts].find(([, written]) => byValue(linesOf(written), one.file) !== undefined)?.[0]
  by ??= [...texts.keys()][0] ?? one.file
  const lines = linesOf(texts.get(by) ?? read(by))
  // A pattern of files asks with no name of a file: the line of the pattern is then the one that asks. So does an
  // import while running whose name holds a value.
  const at =
    [...words, parted(words[0])[0], last, 'import.meta.glob']
      .map((sought) => lines.findIndex((written) => written.includes(sought)))
      .find((place) => place >= 0) ?? byValue(lines, one.file)
  const line = at === undefined ? 1 : at + 1
  // The words of a finding are the same for one file however often and by whomever it was asked for.
  const where = path(by)
  if (work.findings.some((held) => held.code === 'T1005' && held.where?.file === where && held.where.line === line))
    return
  found(
    work,
    'T1005',
    where,
    line,
    `The file ${path(one.file)} is asked for as its text or as an address. A backend file, the starter data, the makers of the adapters and a test reach a browser as the names of their definitions alone, and never as text or as bytes.`,
    'Import the definitions of the file by their names. What a screen needs of the data, it reads through a query.',
  )
}

/** The text of a file that is no file of the project, or an empty one where it cannot be read. */
function read(file: string): string {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

/** Every file under a folder, each by its real place, or none where the folder is not there. */
function under(folder: string, place: (path: string) => string): string[] {
  if (!existsSync(folder)) return []
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? under(join(folder, entry.name), place) : [place(join(folder, entry.name))],
  )
}

/**
 * The files of a project that reach no browser as text or as bytes, each by its real place: the backend files, the
 * file of the project, the starter data, the makers of the adapters and every file under `tests/`.
 */
function heldOf(work: Work, place: (path: string) => string): Set<string> {
  const held = new Set<string>()
  for (const file of work.files.values())
    if (file.sort === 'backend' || file.seen?.declared.some((one) => one.word === 'project')) held.add(file.file)
  for (const name of ['seed.ts', 'engine.ts']) held.add(place(join(work.folder, name)))
  for (const lies of under(join(work.folder, 'tests'), place)) held.add(lies)
  return held
}

/**
 * Takes the files that the builder took in as modules. Answers them with every style file that one of their style
 * files imports, however deep: the builder reads those itself, and names them nowhere.
 */
function withImported(files: string[], place: (path: string) => string): string[] {
  const all = new Set(files)
  const look = (lies: string): void => {
    if (!isStyle(lies)) return
    for (const found of read(lies).matchAll(/@import\s+(?:url\(\s*)?['"]?([^'")\s;]+)/g)) {
      const [name] = parted(found[1])
      const imported = place(join(dirname(lies), name))
      if (all.has(imported) || !existsSync(imported)) continue
      all.add(imported)
      look(imported)
    }
  }
  for (const lies of files) look(lies)
  return [...all].sort()
}

/**
 * The fingerprint of each file a build was made from. In development a file of a package is held by the lock of
 * the packages, as Vite holds its prebundled ones, and is not read; a release reads every file.
 */
function printsOf(work: Work, files: string[]): Record<string, string> {
  const lock = work.options.for === 'dev' ? `lock ${lockPrint(work)}` : undefined
  return Object.fromEntries(
    files.map((lies) => [
      lies,
      lock !== undefined && /[\\/]node_modules[\\/]/.test(lies)
        ? lock
        : existsSync(lies)
          ? fingerprintOf(readFileSync(lies))
          : '',
    ]),
  )
}

/**
 * What a build of the session made of the modules of the views, in memory beside the file that keeps it: the
 * text of each file of the project it was built from, the fingerprint of each other file, and the fingerprint of
 * the text the builder was handed of each screen file. So a save holds it to the files as they are read, and
 * reads no file of the project twice.
 */
interface Held {
  key: string
  files: MadeView[]
  texts: Record<string, string>
  prints: Record<string, string>
  marks: Record<string, string>
}

const heldViews = keeping<Held>()

// The fingerprint of the text the builder is handed of each screen file, by the text and what is written into it.
const heldMarks = keeping<{ text: string; dev: boolean; out: ServedOut | undefined; print: string }>()

const isKept = (
  value: unknown,
): value is { name: string; bytes: string; imports: string[]; entry?: string; styles?: string[]; map?: string }[] =>
  Array.isArray(value) &&
  value.every((one) => typeof Object(one).name === 'string' && typeof Object(one).bytes === 'string')

const isPrints = (value: unknown): value is Record<string, string> =>
  typeof value === 'object' && value !== null && Object.values(value).every((one) => typeof one === 'string')

/**
 * Takes the work of a build, the description that the stubs are written from, the modules to build, each by its
 * name with the text it starts at, the side, and the address that each name of the page code is written as in the
 * browser. Has the builder make them, or takes them as they were kept: what was made is kept by the sources of the
 * project and by every file that the builder took in, a style file, a package and a text file among them, and is
 * made again when one of them changed. Answers every file that was made. Where a held file was asked for as text
 * or as bytes, each asking is reported and `ViewsRefused` is thrown. `packages` are modules of packages to build,
 * each by its name with what it imports, and `packaged` the packages that were built apart, each by the name its
 * module is imported by.
 */
export async function viewModules(
  work: Work,
  description: Description,
  entries: Record<string, string>,
  side: 'browser' | 'server',
  paths?: Record<string, string>,
  apart: { packages?: Record<string, string>; sheets?: Record<string, string>; packaged?: Record<string, string> } = {},
): Promise<MadeView[]> {
  const handed = handedOf(work, description, side)
  const made = new Map(handed.made)
  const inputs: Record<string, string> = { ...apart.packages }
  // A stylesheet of a package is a module of its own, which brings the stylesheet and gives its name.
  for (const [name, sheet] of Object.entries(apart.sheets ?? {})) {
    made.set(`sheet:${name}`, `import ${JSON.stringify(sheet)}\nexport const sheet = ${JSON.stringify(sheet)}\n`)
    inputs[name] = `sheet:${name}`
  }
  for (const [name, text] of Object.entries(entries)) {
    made.set(`entry:${name}`, text)
    inputs[name] = `entry:${name}`
  }
  // A screen file is kept by the text that the builder is handed. What is kept is held to the files that the
  // builder took in alone, so a save of another file keeps it.
  const byPlace = new Map([...work.files.values()].map((file) => [file.file, file] as const))
  const markedOf = (lies: string): string | undefined => {
    const file = byPlace.get(lies)
    if (file?.sort !== 'screen') return undefined
    const dev = work.options.for === 'dev'
    // A browser's text of a file that holds a component drawn on the server alone follows that component's record.
    const out = side === 'browser' ? servedOut(work, description, file) : undefined
    const was = heldMarks.get(`${side} ${file.path}`)
    if (was && was.text === file.text && was.dev === dev && was.out === out) return was.print
    const made = print(marked(work, description, file, side))
    heldMarks.set(`${side} ${file.path}`, { text: file.text, dev, out, print: made })
    return made
  }
  /** What is held in memory of what was built from these files, as they stand now. */
  const heldOn = (files: MadeView[], from: Record<string, string>, marks: Record<string, string>): Held => {
    const texts: Record<string, string> = {}
    const prints: Record<string, string> = {}
    for (const [lies, was] of Object.entries(from)) {
      const file = byPlace.get(lies)
      if (file) texts[lies] = file.text
      else prints[lies] = was
    }
    return { key, files, texts, prints, marks }
  }
  // A development build keeps the source of every module it writes: each comes with its source map.
  const maps = work.options.for === 'dev'
  const held = heldOf(work, placeOf)
  const keyed = {
    builder: builderVersion(),
    maker: makerPrint(),
    for: work.options.for,
    side,
    maps,
    paths,
    held: [...held].sort(),
    apart,
  }
  const key = JSON.stringify({
    builder: builderVersion(),
    maker: makerPrint(),
    for: work.options.for,
    side,
    maps,
    paths,
    // The modules of packages import nothing of the project: what stands in place of its files is no part of them.
    made: Object.keys(entries).length ? [...made].map(([id, text]) => [id, print(text)]) : [],
    held: [...held].sort(),
    apart,
  })
  // Kept by each module's name and the first line of its text, which names the file it starts from: the modules
  // that run the screen files and those that draw them start from the same files in two ways, and keep apart.
  const starts = [
    ...Object.entries(entries).map(([name, text]) => [name, text.slice(0, text.indexOf('\n'))]),
    ...Object.entries(apart.packages ?? {}),
    ...Object.entries(apart.sheets ?? {}),
  ]
  const kept = join(
    cacheFolder(work),
    `views.${side}.${work.options.for}.${print(JSON.stringify(starts)).slice(0, 8)}.json`,
  )
  const inMemory = heldViews.get(kept)
  if (inMemory?.key === key) {
    const now = printsOf(work, Object.keys(inMemory.prints))
    if (
      Object.entries(inMemory.texts).every(([lies, text]) => byPlace.get(lies)?.text === text) &&
      Object.entries(inMemory.prints).every(([lies, was]) => now[lies] === was) &&
      Object.entries(inMemory.marks).every(([lies, was]) => markedOf(lies) === was)
    )
      return inMemory.files
  }
  if (existsSync(kept)) {
    try {
      const was: unknown = JSON.parse(readFileSync(kept, 'utf8'))
      const files: unknown = Object(was).made
      const from: unknown = Object(was).from
      const marks: unknown = Object(was).marks
      // What was kept holds only while every file it was built from lies there as it did, and is handed so.
      if (Object(was).key === key && isKept(files) && isPrints(from) && isPrints(marks)) {
        const now = printsOf(work, Object.keys(from))
        if (
          Object.entries(from).every(([lies, was]) => now[lies] === was) &&
          Object.entries(marks).every(([lies, was]) => markedOf(lies) === was)
        ) {
          const read = files.map((one) => ({ ...one, bytes: new Uint8Array(Buffer.from(one.bytes, 'base64')) }))
          heldViews.set(kept, heldOn(read, from, marks))
          return read
        }
      }
    } catch {
      // What was kept cannot be read: it is made anew.
    }
  }
  // Each asking for a held file as its text or its bytes, once.
  const refused = new Map<string, Asking>()
  const refuse = (file: string, by: string | undefined, words: string): void =>
    void refused.set(`${file} ${by} ${words}`, { file, by, words })
  const root = work.folder.replaceAll('\\', '/')
  const around = { root, held, place: placeOf }
  /** Has the builder make the modules of these inputs, and reports each held file that was asked for. */
  const builtOf = async (
    from: Record<string, string>,
    unbundled?: Parameters<typeof bundleViews>[0]['unbundled'],
  ): Promise<{ made: MadeView[]; from: string[] }> => {
    // Each text that the builder read, by the place of its file: where an asking is found later, its line is here.
    const texts = new Map<string, string>()
    let built: { made: MadeView[]; from: string[] } | undefined
    let failed: unknown
    try {
      built = await bundleViews({
        folder: work.folder,
        tsconfig: ownSettings(work.folder, cacheFolder(work)),
        inputs: from,
        made,
        instead: handed.instead,
        read: handed.read,
        parted,
        asksForBytes,
        place: placeOf,
        backend: (file) => held.has(file),
        refused: refuse,
        cleaned: (text, file) => {
          const [lies] = parted(file)
          texts.set(lies, text)
          return cleaned(text, { ...around, file: lies }, (one, words) => refuse(one, lies, words))
        },
        side,
        names: pageNames,
        ...(paths ? { paths } : {}),
        ...(apart.packaged ? { packaged: apart.packaged } : {}),
        small: work.options.for === 'release',
        maps,
        ...(unbundled ? { unbundled } : {}),
        // A module of development of a file of the project is made for Fast Refresh in a browser, and nowhere else.
        ...(unbundled && side === 'browser'
          ? {
              refresh: (lies: string) => {
                const file = byPlace.get(lies)
                return file && refreshEnd(file, devAddressOf(work, lies))
              },
            }
          : {}),
      })
    } catch (error) {
      failed = error
    }
    if (refused.size) {
      // A refusal that names who asked says more than one that does not: the second is told where the first is not.
      const named = [...refused.values()].filter((one) => one.by !== undefined && !isMadeUp(one.by))
      for (const one of named.length ? named : refused.values()) asked(work, root, one, texts, around)
      // What was made is kept for no later build, and handed to nobody: it is the build of a project that is refused.
      throw new ViewsRefused('a file that reaches no browser was asked for as its text or as an address')
    }
    // The builder may hold what it was handed for longer than the build: what was read of the texts is let go.
    texts.clear()
    if (!built) throw failed
    return built
  }
  // In development the views are served unbundled, as Vite serves them: each module is a file of its own, made
  // alone and kept by its text, and a save makes again the modules whose texts changed.
  if (work.options.for === 'dev' && Object.keys(entries).length && !apart.packages && !apart.sheets)
    return unbundledViews(work, { side, inputs, made, byPlace, markedOf, read: handed.read, held, builtOf, keyed })
  const built = await builtOf(inputs)
  const stored = built.made.map((one) => ({ ...one, bytes: Buffer.from(one.bytes).toString('base64') }))
  const from = withImported(built.from, placeOf)
  const marks = Object.fromEntries(
    from.flatMap((lies) => {
      const one = markedOf(lies)
      return one === undefined ? [] : [[lies, one]]
    }),
  )
  const prints = printsOf(work, from)
  writeFileSync(kept, JSON.stringify({ key, made: stored, from: prints, marks }))
  heldViews.set(kept, heldOn(built.made, prints, marks))
  return built.made
}

/** One file of the screens as the bundle holds it, and the source map that lies beside it. */
export interface NamedView {
  name: string
  bytes: Uint8Array
  map?: { name: string; bytes: Uint8Array }
  // Of a style file: the files of the bundle beside it that it names by `url()`, as a font, which a page loads with it.
  names?: string[]
}

/**
 * Takes the files that the builder made, the folder of the bundle they go to, and the file in the bundle of each
 * asset of the project, by its real place. Answers each under the name it has in the bundle, which holds the first
 * twelve characters of its fingerprint, with what it imports named so too, and with its source map where the
 * builder made one, which lies beside it. A style file names each file it names by `url()` under that name, and an
 * asset of the project as the asset itself, which is then no file of its own. With `steady`, of the modules of
 * development, a module and a style file keep the name the builder gave them, which holds no fingerprint: every
 * module that imports one names it the same way through every save, as Vite serves a page.
 */
export function namedViews(
  made: MadeView[],
  folder: 'browser' | 'server',
  own: ReadonlyMap<string, string> = new Map(),
  steady = false,
): Map<string, NamedView> {
  const key = `${folder} ${steady} ${JSON.stringify([...own])}`
  const held = namedOf.get(made)?.get(key)
  if (held) return held
  const answer = namesOf(made, folder, own, steady)
  namedOf.set(made, (namedOf.get(made) ?? new Map()).set(key, answer))
  return answer
}

// The names of what the builder made, worked out once for the files it made: a kept build hands the same files again.
const namedOf = new WeakMap<MadeView[], Map<string, Map<string, NamedView>>>()

// What each file that the builder made was named, with what it was named by: a module of development that a save
// kept is the same file in the next build, and is named again only where a file it imports got another name.
const namedEach = new WeakMap<MadeView, { key: string; named: NamedView }>()

/** A text written so that a pattern matches it as it stands. */
const literally = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Names the files that the builder made, as `namedViews` answers them. */
function namesOf(
  made: MadeView[],
  folder: 'browser' | 'server',
  own: ReadonlyMap<string, string>,
  steady: boolean,
): Map<string, NamedView> {
  const all = new Map(made.map((one) => [one.name, one] as const))
  const done = new Map<string, NamedView>()
  const ownOf = (one: MadeView): string | undefined => (one.source === undefined ? undefined : own.get(one.source))
  const name = (file: string, seen: string[]): string | undefined => {
    const one = all.get(file)
    if (!one) return undefined
    const held = done.get(file)
    if (held) return held.name
    const dot = file.lastIndexOf('.')
    const [stem, ending] = dot > 0 ? [file.slice(0, dot), file.slice(dot)] : [file, '']
    // A module names what it imports by its file, so those files are named first. Two modules that import each
    // other cannot both come first: the second is then named by its own text alone.
    const imports = ending === '.js' ? [...new Set(one.imports)] : []
    const tos = imports.map((imported) => (seen.includes(imported) ? undefined : name(imported, [...seen, file])))
    // A file that is no style file is named by its bytes and the names of what it imports alone: one that a build
    // before made, and that imports what it imported then, keeps the name and the bytes it was given.
    const asNamed = ending === '.css' ? undefined : `${folder}\n${tos.join('\n')}`
    const before = asNamed === undefined ? undefined : namedEach.get(one)
    if (before && before.key === asNamed) {
      done.set(file, before.named)
      return before.named.name
    }
    let bytes = one.bytes
    const names: string[] = []
    if (ending === '.css') {
      // The builder writes a file that a style file names at the root of the site, by the name it made it under:
      // it is named here beside the style file, by the name it has in the bundle, so it is found under any base.
      let text = new TextDecoder().decode(bytes)
      for (const other of all.values()) {
        if (/\.(?:js|css|map)$/.test(other.name) || seen.includes(other.name)) continue
        const written = new RegExp(`(url\\(\\s*['"]?)/${literally(other.name)}(?=[?#'")\\s])`, 'g')
        if (!written.test(text)) continue
        const asset = ownOf(other)
        const to = asset === undefined ? name(other.name, [...seen, file]) : undefined
        if (asset !== undefined) text = text.replace(written, `$1../${asset}`)
        else if (to !== undefined) {
          text = text.replace(written, `$1./${to.slice(folder.length + 1)}`)
          names.push(to)
        }
      }
      bytes = encode(text)
    }
    if (ending === '.js') {
      let text = new TextDecoder().decode(bytes)
      for (const [k, imported] of imports.entries()) {
        const to = tos[k]
        if (to !== undefined) text = text.replaceAll(`"./${imported}"`, `"./${to.slice(folder.length + 1)}"`)
      }
      bytes = encode(text)
    }
    const final =
      steady && (ending === '.js' || ending === '.css')
        ? `${folder}/${file}`
        : `${folder}/${stem}.${fingerprintOf(bytes).slice(0, 12)}${ending}`
    let named: NamedView
    if (one.map === undefined) named = { name: final, bytes, ...(names.length ? { names } : {}) }
    else {
      // A module is named by its code alone, and names its map in its last line, by the name of the two.
      const map = `${final}.map`
      const text = `${new TextDecoder().decode(bytes)}\n//# sourceMappingURL=${map.slice(map.lastIndexOf('/') + 1)}\n`
      named = { name: final, bytes: encode(text), map: { name: map, bytes: encode(one.map) } }
    }
    done.set(file, named)
    if (asNamed !== undefined) namedEach.set(one, { key: asNamed, named })
    return final
  }
  // An asset of the project that a style file names is the asset's own file of the bundle, and no second one.
  for (const [file, one] of [...all].sort(([a], [b]) => (a < b ? -1 : 1)))
    if (/\.(?:js|css|map)$/.test(file) || ownOf(one) === undefined) name(file, [])
  return done
}

/** One module of development, made alone: what it was made from, the files it was made into, and what it imports. */
interface Item {
  key: string
  made: MadeView[]
  imports: string[]
  // The names that the files of the project it imports gave when it was made: `export *` is written out by them.
  takes: string
}

// The modules of development of each side, by the build they belong to, by the module and by what it was made
// from, through a session: a screen file is handed one text as it is run and another as it draws, and keeps both.
// The stores used last are kept, the newest first, one for each side and each way of making, and an older one is
// let go: a session that adds files keeps no store of the files it had before.
const heldStores = keeping<{ key: string; store: Map<string, Map<string, Item>> }[]>()
const storesKept = 4

/** What the views of development are made with, as `viewModules` worked it out. */
interface Unbundling {
  side: 'browser' | 'server'
  inputs: Record<string, string>
  made: Map<string, string>
  byPlace: Map<string, SourceFile>
  markedOf(lies: string): string | undefined
  read(file: string): string | { code: string; map: string } | undefined
  held: Set<string>
  builtOf(
    from: Record<string, string>,
    unbundled: { named(module: string): string; kept(module: string): string | undefined },
  ): Promise<{ made: MadeView[]; from: string[] }>
  keyed: object
}

/**
 * A path written with no character that a file name or an address may not hold, in a form that no other path is
 * written in: `/` is `.`, the last `.` of the last part stays, `_` is `__`, any other `.` is `_.`, any other
 * character is `_<its code>_`, and a last part with no `.` ends in `_`. So `a/b.ts` and `a.b.ts` stay two names.
 */
function pathName(path: string): string {
  const written = (text: string): string =>
    text.replace(/[^A-Za-z0-9-]/g, (one) =>
      one === '_' ? '__' : one === '.' ? '_.' : `_${one.charCodeAt(0).toString(16)}_`,
    )
  const parts = path.split('/')
  const last = parts.pop() ?? ''
  const dot = last.lastIndexOf('.')
  const end = dot < 0 ? `${written(last)}_` : `${written(last.slice(0, dot))}.${written(last.slice(dot + 1))}`
  return [...parts.map(written), end].join('.')
}

/** The name of the file of a module of development: by its path in the project, or by what made it up. */
function fileNameOf(work: Work, module: string): string {
  const made = module.startsWith(madeMark) ? module.slice(madeMark.length) : undefined
  const [lies] = parted(module.replaceAll('\\', '/'))
  const root = work.folder.replaceAll('\\', '/')
  if (made !== undefined) return `made.${pathName(made)}`
  return lies.startsWith(`${root}/`)
    ? `src.${pathName(lies.slice(root.length + 1))}`
    : `made.${pathName(lies.replace(/^\0/, ''))}`
}

/** Takes the work of a development build and where a file of the project lies. Answers the address of its module for a browser. */
export const devAddressOf = (work: Work, lies: string): string => `browser/${fileNameOf(work, lies)}.js`

/**
 * Takes the work of a development build and what its views are made with. Makes each module that a view reaches
 * into a file of its own, as Vite serves it, or takes it as it was kept: a module is kept by its own text, the kind
 * and the names of each file of the project it imports, and the lock of the packages, so a save makes again the
 * modules whose texts changed and no other, not even the modules that import them, which name each module by its
 * address with no fingerprint. A style file of the project is made again at each build where the project has
 * plugins of its own, whose work may read any file. Answers every file of every module that the views reach.
 */
async function unbundledViews(work: Work, o: Unbundling): Promise<MadeView[]> {
  const norm = (module: string): string => module.replaceAll('\\', '/')
  const storeKey = `${o.side} ${JSON.stringify(o.keyed)}`
  const stores = heldStores.get('stores') ?? []
  const store = stores.find((one) => one.key === storeKey)?.store ?? new Map<string, Map<string, Item>>()
  heldStores.set(
    'stores',
    [{ key: storeKey, store }, ...stores.filter((one) => one.key !== storeKey)].slice(0, storesKept),
  )
  const plugins = ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs'].some((one) =>
    existsSync(join(work.folder, one)),
  )
  // What a module of the project imports of the project, by kind and by name: a stub or a module of names follows it.
  const signature = (file: SourceFile): string =>
    (file.seen?.named ?? [])
      .map((one) => {
        const target = one.from.startsWith('.') ? namedFile(file.file, one.from) : undefined
        const to = target === undefined ? undefined : o.byPlace.get(target)
        return to
          ? `${to.path} ${to.sort} ${(to.seen?.declared ?? []).map((d) => `${d.word}:${d.exportName}`).join(',')}`
          : ''
      })
      .join('\n')
  const keyOf = (module: string): string | undefined => {
    if (module.startsWith(madeMark)) {
      const text = o.made.get(module.slice(madeMark.length))
      return text === undefined ? undefined : print(text)
    }
    const [lies, after] = parted(module.replaceAll('\\', '/'))
    const file = o.byPlace.get(lies)
    if (file) return print(`${o.markedOf(lies) ?? print(file.text)}\n${signature(file)}\n${after}`)
    if (/\/node_modules\//.test(lies)) return `lock ${lockPrint(work)} ${after}`
    if (isStyle(lies)) {
      if (plugins) return undefined
      return print(
        withImported([lies], (one) => one)
          .map((one) => `${one}\n${read(one)}`)
          .join('\0') + after,
      )
    }
    return existsSync(lies) ? `${fingerprintOf(readFileSync(lies))} ${after}` : undefined
  }
  const takenOf = (imports: string[]): string =>
    imports
      .map((module) => {
        const file = o.byPlace.get(parted(module)[0])
        return file ? `${file.path} ${(file.seen?.declared ?? []).map((one) => one.exportName).join(',')}` : ''
      })
      .join('\n')
  const inputModule = (name: string): string => `${madeMark}${o.inputs[name]}`
  const views = new Set(Object.keys(o.inputs).map(inputModule))
  /** The modules that the views reach, each fresh one with its item, and those that are to be made. */
  const walked = (): { fresh: Map<string, Item>; stale: Set<string> } => {
    const fresh = new Map<string, Item>()
    const stale = new Set<string>()
    const left = Object.keys(o.inputs).map(inputModule)
    for (let module = left.pop(); module !== undefined; module = left.pop()) {
      if (fresh.has(module) || stale.has(module)) continue
      const key = keyOf(norm(module))
      const item = key === undefined ? undefined : store?.get(norm(module))?.get(key)
      if (!item || key === undefined || item.takes !== takenOf(item.imports)) {
        stale.add(module)
        continue
      }
      fresh.set(module, item)
      left.push(...item.imports)
    }
    return { fresh, stale }
  }
  let { fresh, stale } = walked()
  if (stale.size) {
    const names = new Map<string, string>()
    const named = (module: string): string => {
      const name = fileNameOf(work, module)
      names.set(name, norm(module))
      return name
    }
    for (const module of fresh.keys()) named(module)
    const byInput = new Map(Object.keys(o.inputs).map((name) => [inputModule(name), name] as const))
    // Each module that is to be made is an input of the build: a view's own by its name, any other by its file.
    const from = Object.fromEntries(
      [...stale].map((module) => {
        const name = byInput.get(module)
        if (name !== undefined) return [name, o.inputs[name]]
        return [named(module), module.startsWith(madeMark) ? module.slice(madeMark.length) : module]
      }),
    )
    const built = await o.builtOf(from, {
      named,
      kept: (module) => (fresh.has(norm(module)) ? `${named(module)}.js` : undefined),
    })
    const assets = new Map(
      built.made
        .filter((one) => one.module === undefined && !one.name.endsWith('.js'))
        .map((one) => [one.name, one] as const),
    )
    for (const one of built.made) {
      if (one.module === undefined) continue
      const module = norm(one.module)
      const key = keyOf(module)
      const brought = (one.styles ?? []).flatMap((style) => {
        const asset = assets.get(style)
        return asset ? [asset] : []
      })
      // Every other file the module made, as a picture it names or a font that a style file of it names, goes with it.
      const texts = [one, ...brought].map((made) => new TextDecoder().decode(made.bytes))
      const named = [...assets.values()].filter(
        (asset) => !brought.includes(asset) && texts.some((text) => text.includes(asset.name)),
      )
      const imports = one.imports.flatMap((name) => {
        const to = names.get(name.replace(/\.js$/, ''))
        return to === undefined ? [] : [to]
      })
      // Only a module of a view is the entry of one: any other was an input of this build alone.
      const { entry: _entry, ...plain } = one
      const own = views.has(module) ? one : plain
      if (key === undefined) continue
      const kinds = store.get(module) ?? new Map<string, Item>()
      kinds.set(key, { key, made: [own, ...brought, ...named], imports, takes: takenOf(imports) })
      // Two texts of one module are kept, the one it is run with and the one it draws with, and no older one.
      for (const old of [...kinds.keys()].slice(0, -2)) kinds.delete(old)
      store.set(module, kinds)
    }
    ;({ fresh, stale } = walked())
    if (stale.size) {
      // What could not be kept, as a style file that the project's plugins make, is answered as it was made now.
      const files = new Map([...fresh.values()].flatMap((item) => item.made).map((one) => [one.name, one] as const))
      for (const one of built.made) files.set(one.name, one)
      return [...files.values()].sort((a, b) => (a.name < b.name ? -1 : 1))
    }
  }
  const files = new Map([...fresh.values()].flatMap((item) => item.made).map((one) => [one.name, one] as const))
  return [...files.values()].sort((a, b) => (a.name < b.name ? -1 : 1))
}
