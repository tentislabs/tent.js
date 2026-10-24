import { existsSync, readFileSync } from 'node:fs'
import { builtinModules, registerHooks } from 'node:module'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseAst } from 'rolldown/parseAst'
import { transformSync } from 'rolldown/utils'
import type { Plugin } from 'vite'
import { keeping, lookupsForgotten } from '../lookups.ts'
import { packageAt, packageOf } from '../packageOf.ts'
import type { Node } from '../tree.ts'

/**
 * Takes the text of a source map that the builder made, and the folder of the project. Answers it with each source
 * named by its path from the folder of the project: the builder names it from the folder it would write to.
 */
function fromProject(text: string, folder: string): string {
  const map: unknown = JSON.parse(text)
  const sources: unknown = Reflect.get(Object(map), 'sources')
  if (!Array.isArray(sources)) return text
  // The builder writes into `dist/` of the folder it is given, and names each source from there.
  // A module that the build made up is named so that it lies in no folder: it stays as it is.
  const named = sources.map((one) =>
    typeof one === 'string' && !one.startsWith('\0')
      ? relative(folder, resolve(folder, 'dist', one)).replaceAll('\\', '/')
      : one,
  )
  return JSON.stringify({ ...Object(map), sources: named })
}

/** The version of the builder, which is a part of what the build keeps a module under. It is read from the package, so that asking for it loads no builder. */
export function builderVersion(): string {
  const held: unknown = JSON.parse(readFileSync(fileURLToPath(import.meta.resolve('vite/package.json')), 'utf8'))
  return String(Object(held).version)
}

// The reader types its tree by the kind of each node. Ours is read by the names of its members, checked where read.
const read = (text: string, lang: 'ts' | 'tsx' | 'js'): Node => parseAst(text, { lang }) as unknown as Node

/**
 * Takes the text of a `.ts` or `.tsx` file. Answers its tree, as the builder's own reader of source gives it.
 * Throws what the reader throws for a text that it cannot read.
 */
export function parse(text: string, tsx: boolean): Node {
  return read(text, tsx ? 'tsx' : 'ts')
}

/**
 * Takes the text of a module that the builder made. Answers its tree, as the builder's own reader of source gives
 * it. Throws what the reader throws for a text that it cannot read.
 */
export function parseModule(text: string): Node {
  return read(text, 'js')
}

/**
 * Takes what `parse` threw. Answers what the reader said of the first thing it could not read, and the place in
 * the text where it stopped, where it told one.
 */
export function unreadOf(thrown: unknown): { words: string; at?: number } {
  // The reader's message is the number of its errors, then for each what it is, and the lines around it.
  const [first, second] = thrown instanceof Error ? thrown.message.split('\n') : [String(thrown)]
  const at: unknown = Object(thrown).pos
  return { words: second ?? first, ...(typeof at === 'number' ? { at } : {}) }
}

/**
 * Takes the text of a `.tsx` file. Answers the JavaScript that the builder's own step makes of it, with JSX as the
 * settings of the repository state it. Throws what the builder throws for a text that it cannot read.
 */
export function transform(text: string): string {
  return transformSync('file.tsx', text, { jsx: { runtime: 'automatic' } }).code
}

let loadsTsx = false

/**
 * Lets the runtime load a `.tsx` file of the framework as it is written, by the builder's own step for one text. A
 * tag is such a file, and a screen file that is run takes the words of the screen side from the entry that gives
 * the tags.
 */
export function loadTsx(): void {
  if (loadsTsx) return
  loadsTsx = true
  registerHooks({
    load: (url, context, next) => {
      if (!url.startsWith('file:') || !url.split('?')[0].endsWith('.tsx')) return next(url, context)
      const file = fileURLToPath(url)
      const made = transformSync(file, readFileSync(file, 'utf8'), { jsx: { runtime: 'automatic' } })
      return { format: 'module', source: made.code, shortCircuit: true }
    },
  })
}

/**
 * Takes the text of a file of the page code as the builder wrote it, before it is made small. Answers it with each
 * load that the builder wrapped in its helper of preloading left bare: `__vitePreload(() => import(x), marker)`
 * becomes `import(x)`, so that nothing uses the helper and it is left out.
 */
export function bareLoads(code: string): string {
  const opened = '__vitePreload(() => '
  let out = ''
  let from = 0
  for (let at = code.indexOf(opened); at >= 0; at = code.indexOf(opened, from)) {
    const load = at + opened.length
    if (!code.startsWith('import(', load)) break
    // The end of the load: the parenthesis that closes `import(`, past every one inside it.
    let depth = 0
    let end = load + 'import'.length
    for (; end < code.length; end++) {
      if (code[end] === '(') depth++
      else if (code[end] === ')') {
        depth--
        if (depth === 0) break
      }
    }
    const rest = /^\),\s*__VITE_PRELOAD__\s*\)/.exec(code.slice(end, end + 40))
    if (!rest) break
    out += code.slice(from, at) + code.slice(load, end + 1)
    from = end + rest[0].length
  }
  return out + code.slice(from)
}

// The builder takes what the program is marked for, `NODE_ENV`, while it reads its settings, and builds otherwise
// by it: so that one source makes one text in every shell, these builds hold the mark of a release for that moment.
let releaseMarks = 0
let markBefore: string | undefined

/** A plugin that holds the program marked for a release from the reading of the settings until they are read. */
function markedForRelease(): { plugin: Plugin; release(): void } {
  let holding = false
  const release = (): void => {
    if (!holding) return
    holding = false
    releaseMarks--
    if (releaseMarks > 0) return
    if (markBefore === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = markBefore
  }
  const plugin: Plugin = {
    name: 'tent:marked-for-release',
    config() {
      if (releaseMarks === 0) markBefore = process.env.NODE_ENV
      releaseMarks++
      holding = true
      process.env.NODE_ENV = 'production'
    },
    configResolved: release,
  }
  return { plugin, release }
}

/**
 * Takes the file that one file of the page code starts at, or a made-up name for it with its text as `made`, the
 * side it is built for, whether it is made small, and a function that says which files hold no effect of their
 * own, so that what nothing uses of them is left out. `instead` is asked of each file and each package that the
 * file reaches: it answers nothing for one that is taken in, `outside` for one that is left as an import of that
 * address, and `text` for one whose place a made text takes. Answers the text of the one file that the builder
 * made of it, with everything it took in inside. With `classic` it is a plain script, not a module: what it
 * gives is held under `name` of the page, and each outside address is read from the name `globals` gives it.
 * Throws what the builder throws.
 */
export async function bundlePage(o: {
  entry: string
  made?: string
  side: 'browser' | 'server'
  small: boolean
  classic?: { name?: string; globals: Record<string, string> }
  pure(file: string): boolean
  instead?(file: string, by: string | undefined): { outside: string } | { text: string } | undefined
  // Is told the source map of the file, where the file of a development build is made.
  map?(text: string): void
  // The settings of TypeScript that a file of a project is read with, where the file is one.
  tsconfig?: string
}): Promise<string> {
  const { build } = await import('vite')
  const server = o.side === 'server'
  const mark = '\0tent-page:'
  const texts = new Map<string, string>()
  const marked = markedForRelease()
  const built = await build({
    configFile: false,
    envFile: false,
    publicDir: false,
    logLevel: 'silent',
    mode: o.small ? 'production' : 'development',
    ...(o.tsconfig === undefined ? {} : { tsconfig: o.tsconfig }),
    define: { 'process.env.NODE_ENV': JSON.stringify(o.small ? 'production' : 'development') },
    // Which runtime makes a tag is said here, and not left to what the program was marked for by a build before:
    // the React that is built in beside it gives the development one only where the code is not made small.
    oxc: { jsx: { runtime: 'automatic' as const, development: !o.small } },
    ...(server ? { ssr: { noExternal: true as const } } : {}),
    plugins: [
      marked.plugin,
      {
        name: 'tent:page',
        enforce: 'pre',
        async resolveId(source, importer, options) {
          if (o.made !== undefined && source === o.entry) return source
          if (source.startsWith(mark)) return source
          // A file is known by where it lies, and a package by its name.
          const local = source.startsWith('.') || isAbsolute(source)
          const found = local ? await this.resolve(source, importer, { ...options, skipSelf: true }) : null
          const file = (found?.id ?? source).replaceAll('\\', '/')
          const put = o.instead?.(file, importer?.replaceAll('\\', '/'))
          if (!put) return found
          if ('outside' in put) return { id: put.outside, external: true }
          texts.set(`${mark}${file}`, put.text)
          return `${mark}${file}`
        },
        load: (id) => (o.made !== undefined && id === o.entry ? o.made : (texts.get(id) ?? null)),
      },
      {
        // The files of the page code load one another and nothing else, so the builder's helper that preloads what
        // a loaded file needs does nothing for them: it is weight that every page would carry. Each load is left bare.
        name: 'tent:bare-loads',
        renderChunk: server || !o.small ? undefined : (code) => ({ code: bareLoads(code), map: null }),
      },
    ],
    build: {
      ssr: server,
      write: false,
      minify: o.small && !server,
      sourcemap: o.map ? 'hidden' : false,
      modulePreload: false,
      ...(server ? { target: 'esnext' } : {}),
      rolldownOptions: {
        input: { page: o.entry },
        preserveEntrySignatures: 'strict',
        treeshake: { moduleSideEffects: (id) => !o.pure(id.replaceAll('\\', '/')) },
        experimental: { attachDebugInfo: 'none' },
        output: {
          format: o.classic ? 'iife' : 'es',
          entryFileNames: '[name].js',
          codeSplitting: false,
          ...(o.classic ? { globals: o.classic.globals, ...(o.classic.name ? { name: o.classic.name } : {}) } : {}),
        },
      },
    },
  }).finally(marked.release)
  for (const one of Array.isArray(built) ? built : [built])
    if ('output' in one)
      for (const file of one.output)
        if (file.type === 'chunk' && file.isEntry) {
          if (o.map && file.map) o.map(file.map.toString())
          return file.code
        }
  throw new Error('the builder made no file of the page code')
}

/** One file that the builder made: its name, its text, and for a module the files it imports and its source. */
export interface Made {
  name: string
  text: string
  imports: string[]
  source?: string
}

/**
 * Takes the folder of a project, the files to build as modules of the server, each under the name of its module,
 * the imports that are left as they are written, a function that answers the text of a source file, and whether
 * the code is made small. Answers every file the builder made, in the order of their names: each module with its
 * source map, and the code that several of them share. It writes no file. Throws what the builder throws.
 */
export async function bundle(o: {
  folder: string
  inputs: Record<string, string>
  external: (string | RegExp)[]
  read(file: string): string | undefined
  small: boolean
  // Is told each module of the runtime that a file of a package imports, by the package.
  outOf?(name: string, imported: string): void
  // Is told each file that the builder took in, a file of a package among them, by where it lies.
  took?(file: string): void
  // The settings of TypeScript that the files of the project are read with.
  tsconfig: string
}): Promise<Made[]> {
  // The builder is loaded when it is first needed: a project of plain definitions never asks for it.
  const { build } = await import('vite')
  const built = await build({
    configFile: false,
    envFile: false,
    publicDir: false,
    root: o.folder,
    tsconfig: o.tsconfig,
    logLevel: 'silent',
    // A package that a backend file imports is built into its module, as the page's server file builds its own:
    // a bundle runs in a folder of its own, where no `node_modules/` of the project lies.
    ssr: { noExternal: true },
    plugins: [
      {
        name: 'tent:source',
        // A source file is handed over with one line ending, so that every system builds the same bytes.
        load: (id) => o.read(id.replaceAll('\\', '/')) ?? null,
      },
      {
        name: 'tent:outside',
        // What a package imports of the runtime is seen as it is asked for, before the builder takes it as the runtime's.
        enforce: 'pre',
        resolveId: (id, importer) => {
          const name = importer === undefined ? undefined : packageAt(importer)
          if (name !== undefined && (id.startsWith('node:') || builtinModules.includes(id) || id.endsWith('.node')))
            o.outOf?.(name, id)
          return null
        },
      },
    ],
    build: {
      ssr: true,
      write: false,
      minify: o.small,
      // A source map is made for a development build alone.
      sourcemap: !o.small,
      target: 'esnext',
      rolldownOptions: {
        input: o.inputs,
        external: o.external,
        // The builder marks each source in the code by its path from where the program was started: left out.
        experimental: { attachDebugInfo: 'none' },
        // The builder works no value out. Left to itself it writes what a name holds in the place of each read of
        // the name, and joins texts, also where the code is not made small: a text that is doubled some thirty
        // times is then made whole while a project is built. Small code keeps short names and no space, and
        // nothing more.
        optimization: { inlineConst: false },
        treeshake: false,
        output: {
          format: 'es',
          entryFileNames: '[name].js',
          chunkFileNames: 'shared.[name].js',
          minify: o.small ? { compress: false, mangle: true, codegen: true } : false,
        },
      },
    },
  })
  const made: Made[] = []
  for (const one of Array.isArray(built) ? built : [built]) {
    if (!('output' in one)) continue
    for (const file of one.output) {
      if (file.type === 'chunk') {
        for (const id of file.moduleIds) if (!id.startsWith('\0')) o.took?.(id.replaceAll('\\', '/'))
        made.push({
          name: file.fileName,
          text: file.code,
          imports: [...file.imports],
          ...(file.isEntry && file.facadeModuleId ? { source: file.facadeModuleId.replaceAll('\\', '/') } : {}),
        })
      } else {
        const text = String(file.source)
        made.push({
          name: file.fileName,
          text: file.fileName.endsWith('.map') ? fromProject(text, o.folder) : text,
          imports: [],
        })
      }
    }
  }
  return made.sort((a, b) => (a.name < b.name ? -1 : 1))
}

// The plugins of the project's own file, by the file and the form, with the text they were read from: kept through a
// session of development as the builder's own server keeps them, so a plugin that compiles styles goes on from what
// it compiled before. An edit of the file takes the place of what was kept of it.
const pluginsKept = keeping<{ text: string; plugins: Promise<Plugin[]> }>()

/**
 * Takes the folder of a project and whether the code is made small. Answers the plugins of the builder that the
 * project names in its own `vite.config.ts` (or `.js`, `.mjs`, `.mts`): read anew for every build but one of a
 * session of development, which takes them as they were while the file stays the same. None where the project has
 * no such file. Throws what the file throws.
 */
async function projectPlugins(folder: string, small: boolean): Promise<Plugin[]> {
  const names = ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs']
  const file = names.map((name) => join(folder, name)).find((one) => existsSync(one))
  if (file === undefined) return []
  const key = `${file}
${small}`
  const text = readFileSync(file, 'utf8')
  const kept = pluginsKept.get(key)
  const plugins = kept?.text === text ? kept.plugins : pluginsOf(file, folder, small)
  pluginsKept.set(key, { text, plugins })
  // The builder writes into a plugin as it builds: each build is handed a copy, and what the plugin keeps it keeps.
  return (await plugins).map((one) => ({ ...one }))
}

/** The plugins that a file of the project names, read anew. */
async function pluginsOf(file: string, folder: string, small: boolean): Promise<Plugin[]> {
  const { loadConfigFromFile } = await import('vite')
  const loaded = await loadConfigFromFile(
    { command: 'build', mode: small ? 'production' : 'development', isSsrBuild: false },
    file,
    folder,
    'silent',
  )
  const flat = (given: unknown): Plugin[] =>
    Array.isArray(given) ? given.flatMap(flat) : isPlugin(given) ? [given] : []
  return flat(loaded?.config.plugins ?? [])
}

const isPlugin = (value: unknown): value is Plugin =>
  typeof value === 'object' && value !== null && typeof Reflect.get(value, 'name') === 'string'

/** One file that the builder made for the screens: its name, its bytes, what it imports, and for a module that was asked for its name and the style files it needs. */
export interface MadeView {
  name: string
  bytes: Uint8Array
  imports: string[]
  entry?: string
  // Of a module of development, which is one file of its own: the module it was made from.
  module?: string
  styles?: string[]
  // The source map of a module, as its text, where one was asked for.
  map?: string
  // The bytes that each package stands for in the module, as the builder wrote them.
  packages?: Record<string, number>
  // Of a file that is no module, as a font that a style file names: the real place of the file it was made from.
  source?: string
  // Of a module of the server: for each package that it holds and that a file of the project or an input names by
  // its name, the style files that the package's code imports, however deep, each by its real place, in their order.
  looks?: Record<string, string[]>
}

/** What the id of a made-up module starts with, as the builder knows it. */
export const madeMark = '\0tent:'

/**
 * Takes what answers the end of the module of a file, by its real place, and what answers the real place of an id.
 * Answers the plugin that writes that end after the module's own code, once the transform of Fast Refresh has made
 * it: below every line, so the source map of the module stands as it was.
 */
function refreshed(tail: (file: string) => string | undefined, lies: (id: string) => string): Plugin {
  return {
    name: 'tent:refresh',
    enforce: 'post',
    transform(code, id) {
      if (id.startsWith('\0')) return null
      const end = tail(lies(id))
      return end === undefined ? null : { code: `${code}\n${end}`, map: null }
    },
  }
}

/**
 * A style file of modules that a module of a browser imports brings its rules to the page, whether or not the
 * browser reads a class of it, as Vite's own server serves it: the build leaves one out where no class is read, and
 * a component drawn on the server alone reads its classes on the server.
 */
const modulesKept: Plugin = {
  name: 'tent:modules-kept',
  enforce: 'post',
  transform: (code, id) =>
    /\.module\.(?:css|scss|sass|less|styl|stylus|pcss|postcss|sss)$/.test(id)
      ? { code, map: { mappings: '' }, moduleSideEffects: 'no-treeshake' as const }
      : null,
}

/**
 * Takes the folder of a project, the modules to build, each as the made-up file it starts at, the text of each
 * made-up file, a function that answers a made-up file in place of a file that a module imports, a function that
 * answers the text of a source file, the side that is built for, the names of the page code, with the address
 * that each is written as in the browser, and whether the code is made small. Every file that the builder names
 * is handed on by its real place, which `place` answers. Answers every file the builder made, in the order of
 * their names, a module of the server with the style files of each package it holds, and every file it took in,
 * each by its real place. It writes no file. Throws what the builder throws.
 */
export async function bundleViews(o: {
  folder: string
  inputs: Record<string, string>
  made: Map<string, string>
  instead(file: string, importer: string | undefined): string | undefined
  // The text of a source file, with the source map of what the build wrote into it where it wrote something.
  read(file: string): string | { code: string; map: string } | undefined
  // What the name of a file is, and what stood after it; whether that asks for the file as its text or its bytes.
  parted(asked: string): [name: string, after: string]
  asksForBytes(after: string): boolean
  // The real place of a path, however it is written.
  place(path: string): string
  // Whether a file is held back from a browser, and what is told of each asking for one that is refused.
  backend(file: string): boolean
  refused(file: string, by: string | undefined, words: string): void
  // The text of a file with every asking for a held file that passes no import taken out, or nothing.
  cleaned(text: string, file: string): string | undefined
  side: 'browser' | 'server'
  names: string[]
  paths?: Record<string, string>
  // The packages that were built apart, each by the name its module is imported by: a module names it, and holds none of it.
  packaged?: Record<string, string>
  small: boolean
  // Whether each module is answered with its source map, which holds the source that it was made of.
  maps?: boolean
  // In development each module is a file of its own, as Vite serves it: `named` answers the name of the file of a
  // module, and `kept` the name of one that was made before and stands as it was, which is imported where it lies
  // and is no part of this build.
  unbundled?: { named(module: string): string; kept(module: string): string | undefined }
  // The settings of TypeScript that the files of the project are read with, where a project is built.
  tsconfig?: string
  // In development, for a browser: the transform of Fast Refresh is made on each file of the project, and each module
  // of such a file ends with the text that this answers for the file, by its real place, where it answers one.
  refresh?(file: string): string | undefined
}): Promise<{ made: MadeView[]; from: string[] }> {
  const { build, esmExternalRequirePlugin, isCSSRequest } = await import('vite')
  const server = o.side === 'server'
  const mark = madeMark
  // What a module of development that was made before is imported as, until it is written as its own file.
  const keptMark = 'tent-kept:'
  // What stands in place of a held file that was asked for as its text or its bytes: a module that gives nothing.
  const nothing = 'refused'
  const taken = new Set<string>()
  // A file as the builder names it, by its real place, with what stood after its name.
  const lies = (id: string): string => {
    const [name, after] = o.parted(id.replaceAll('\\', '/'))
    return isAbsolute(name) ? `${o.place(name)}${after}` : id
  }
  const last = (file: string): string => file.slice(file.lastIndexOf('/') + 1)
  // The server follows the code of a package that a component drawn on the server alone imports, which a browser
  // never loads: the file that each name of a package was found as, and the style files that its code imports.
  const packagesNamed = new Map<string, string>()
  const packageLooks = new Map<string, string[]>()
  const looksFollowed: Plugin = {
    name: 'tent:looks-followed',
    generateBundle() {
      const looksOf = (id: string, seen: Set<string>): string[] => {
        if (seen.has(id)) return []
        seen.add(id)
        const [name, after] = o.parted(lies(id))
        if (isCSSRequest(name)) return after === '' ? [name] : []
        const info = this.getModuleInfo(id)
        return [...(info?.importedIds ?? []), ...(info?.dynamicallyImportedIds ?? [])].flatMap((one) =>
          looksOf(one, seen),
        )
      }
      for (const found of new Set(packagesNamed.values())) packageLooks.set(found, looksOf(found, new Set()))
    },
  }
  // The builder builds a worker by itself, apart from the modules: the same hold stands in both.
  const hold = (worker: boolean): Plugin => ({
    name: 'tent:views',
    enforce: 'pre',
    async resolveId(id, importer, options) {
      if (o.made.has(id)) return `${mark}${id}`
      if (importer !== undefined && o.packaged && Object.hasOwn(o.packaged, id))
        return { id: o.packaged[id], external: true }
      if (id.startsWith(mark) || o.names.includes(id)) return null
      const found = await this.resolve(id, importer, { ...options, skipSelf: true })
      if (!found || found.external) return found
      const byProject = importer === undefined || packageAt(lies(importer)) === undefined
      if (server && !worker && byProject && packageOf(id) !== undefined) packagesNamed.set(id, found.id)
      const from = importer?.startsWith(mark) ? importer.slice(mark.length) : importer && lies(importer)
      // A held file is known by its real place alone, whatever stands after its name: asked for as code it is
      // answered with its generated file, and asked for as its text, its bytes or a worker it is refused, and
      // nothing of it is read.
      const [name, after] = o.parted(lies(found.id))
      if (o.backend(name) && ((worker && importer === undefined) || o.asksForBytes(after))) {
        o.refused(name, from, worker && importer === undefined ? last(name) : id)
        return `${mark}${nothing}`
      }
      const to = o.instead(after !== '' && !o.backend(name) ? `${name}${after}` : name, from)
      const module = to === undefined ? found.id : `${mark}${to}`
      // A module that was made before and stands as it was is imported from its own file.
      const kept = worker ? undefined : o.unbundled?.kept(module)
      if (kept !== undefined) return { id: `${keptMark}${kept}`, external: true }
      return to === undefined ? found : module
    },
    load(id) {
      if (id === `${mark}${nothing}`) return 'export default ""\n'
      if (id.startsWith(mark)) return o.made.get(id.slice(mark.length)) ?? null
      const [name, after] = o.parted(lies(id))
      if (isAbsolute(name)) taken.add(name)
      // A server draws no style: what a style file gives a page comes from the modules of a browser. A style file
      // of modules names its classes for the server too, and is read.
      if (
        server &&
        after === '' &&
        /\.(?:css|scss|sass|less|styl|pcss|postcss)$/.test(name) &&
        !/\.module\./.test(name)
      )
        return ''
      // A file that is asked for as something other than its code is read by the builder itself.
      return after === '' ? (o.read(name) ?? null) : null
    },
    // An address that a file makes from its own, and what a style file names, pass no import: each is read here.
    transform(code, id) {
      if (id.startsWith(mark)) return null
      const clean = o.cleaned(code, lies(id))
      return clean === undefined ? null : { code: clean, map: null }
    },
  })
  // The project's own plugins, as Tailwind CSS adds its own for Vite, work on its files after the hold has placed them.
  const own = await projectPlugins(o.folder, o.small)
  const built = await build({
    configFile: false,
    envFile: false,
    publicDir: false,
    root: o.folder,
    ...(o.tsconfig === undefined ? {} : { tsconfig: o.tsconfig }),
    logLevel: 'silent',
    mode: o.small ? 'production' : 'development',
    plugins: [
      hold(false),
      ...own,
      // A package that asks for one of the names by `require` is answered as an import is: a browser has none.
      ...(server ? [] : [esmExternalRequirePlugin({ external: o.names })]),
      ...(server ? [looksFollowed] : [modulesKept]),
      ...(o.refresh ? [refreshed(o.refresh, lies)] : []),
    ],
    worker: { format: 'es', plugins: () => [hold(true)] },
    // On the server every package is built into the module, so that what it imports of the page code is answered
    // where the module lies.
    ...(server ? { ssr: { noExternal: true as const } } : {}),
    // A tag is made by the runtime of React that the page code of its form holds: the one of development, which
    // keeps the place of each tag, in a development build, where the page code is of development too. With Fast
    // Refresh, the builder's own transform registers each component and signs its hooks, as Vite's plug-in for React
    // has it do, on the files of the project and on no package.
    oxc: o.refresh
      ? {
          jsx: { runtime: 'automatic' as const, development: true, refresh: {} },
          // What the transform of Fast Refresh holds: a file of code, and none of a package.
          jsxRefreshInclude: /\.[cm]?[jt]sx?$/,
          jsxRefreshExclude: /[\\/]node_modules[\\/]/,
        }
      : { jsx: { runtime: 'automatic' as const, development: !o.small } },
    build: {
      ssr: server,
      write: false,
      minify: o.small,
      // A map is asked for apart from its module, which names it only once its own name is known.
      sourcemap: o.maps ? 'hidden' : false,
      modulePreload: false,
      // The bytes of a held file are written into no code, whoever asked. A font is a file of its own however small:
      // the page's policy takes fonts from its own origin alone, and a `data:` address is none.
      assetsInlineLimit: (file) => {
        const [name] = o.parted(lies(file))
        if (!o.backend(name)) return /\.(woff2?|ttf|otf)$/i.test(file) ? false : undefined
        o.refused(name, undefined, last(name))
        return false
      },
      ...(server ? { target: 'esnext' } : {}),
      rolldownOptions: {
        input: o.inputs,
        external: server ? o.names : [],
        preserveEntrySignatures: 'strict',
        experimental: { attachDebugInfo: 'none' },
        output: {
          format: 'es',
          ...(o.unbundled
            ? {
                // Each module is a file of its own, named by the module, as the session keeps it.
                preserveModules: true,
                entryFileNames: (chunk: { name: string; facadeModuleId: string | null }) =>
                  chunk.facadeModuleId === null || chunk.facadeModuleId.startsWith(`${mark}entry:`)
                    ? `${chunk.name}.js`
                    : `${o.unbundled?.named(chunk.facadeModuleId)}.js`,
                assetFileNames: (asset: { originalFileNames: readonly string[]; names: readonly string[] }) =>
                  `${o.unbundled?.named(asset.originalFileNames[0] ?? asset.names[0] ?? 'asset')}[extname]`,
              }
            : { entryFileNames: '[name].js', chunkFileNames: 'shared.[name].js', assetFileNames: '[name][extname]' }),
          ...(o.paths ? { paths: o.paths } : {}),
        },
      },
    },
  })
  const made: MadeView[] = []
  for (const one of Array.isArray(built) ? built : [built]) {
    if (!('output' in one)) continue
    for (const file of one.output) {
      if (file.type === 'chunk') {
        // The builder tells the style files of a module beside what its types name.
        const styles: unknown = Reflect.get(Object(Reflect.get(file, 'viteMetadata')), 'importedCss')
        const packages: Record<string, number> = {}
        for (const [id, module] of Object.entries(file.modules)) {
          const name = packageAt(id)
          if (name !== undefined) packages[name] = (packages[name] ?? 0) + module.renderedLength
        }
        // A module that was made before is named by its own file.
        const code = o.unbundled ? file.code.replaceAll(`"${keptMark}`, '"./') : file.code
        const imports = [...file.imports, ...(o.unbundled ? file.dynamicImports : [])].map((one) =>
          one.startsWith(keptMark) ? one.slice(keptMark.length) : one,
        )
        const looks = Object.fromEntries(
          [...packagesNamed].flatMap(([named, found]) => {
            const brought = packageLooks.get(found) ?? []
            return file.moduleIds.includes(found) && brought.length ? [[named, brought] as const] : []
          }),
        )
        made.push({
          name: file.fileName,
          bytes: new TextEncoder().encode(code),
          imports,
          ...(file.isEntry && Object.hasOwn(o.inputs, file.name) ? { entry: file.name } : {}),
          ...(o.unbundled && file.facadeModuleId !== null ? { module: file.facadeModuleId } : {}),
          ...(styles instanceof Set && styles.size ? { styles: [...styles].map(String).sort() } : {}),
          ...(file.map ? { map: fromProject(file.map.toString(), o.folder) } : {}),
          ...(Object.keys(packages).length ? { packages } : {}),
          ...(Object.keys(looks).length ? { looks } : {}),
        })
      } else if (file.fileName.endsWith('.map')) {
        // The map of a module is taken from the module itself, above.
      } else {
        // And no held file is a file of the bundle.
        const places = file.originalFileNames.map(
          (from) => o.parted(lies(isAbsolute(from) ? from : join(o.folder, from)))[0],
        )
        for (const name of places) if (o.backend(name)) o.refused(name, undefined, last(name))
        made.push({
          name: file.fileName,
          bytes: typeof file.source === 'string' ? new TextEncoder().encode(file.source) : file.source,
          imports: [],
          ...(places[0] === undefined ? {} : { source: places[0] }),
        })
      }
    }
  }
  return { made: made.sort((a, b) => (a.name < b.name ? -1 : 1)), from: [...taken].sort() }
}

/**
 * Takes the folder of a project, and what is told each file of it that was saved, added or removed. Watches the
 * folder with the builder's own watcher, which serves nothing: what lies in the engine's own folder, among the
 * packages of the project, and the type list that every build writes, is no save. Answers what ends the watching,
 * once the watcher has read the folder.
 */
export async function watching(folder: string, saved: (file: string) => void): Promise<{ close(): Promise<void> }> {
  const { createServer } = await import('vite')
  const server = await createServer({
    configFile: false,
    envFile: false,
    root: folder,
    logLevel: 'silent',
    appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: {
      middlewareMode: true,
      ws: false,
      hmr: false,
      watch: { ignored: ['**/.tent/**', '**/node_modules/**', '**/tent.d.ts'] },
    },
  })
  server.watcher.on('all', (event, file) => {
    // A file or a folder that comes or goes changes what a build of the session found on the disk.
    if (event !== 'change') lookupsForgotten()
    if (event === 'change' || event === 'add' || event === 'unlink') saved(file.replaceAll('\\', '/'))
  })
  // A save before the watcher has read the folder is seen by nobody: the watching answers once it has.
  if (!Reflect.get(server.watcher, '_readyEmitted')) await new Promise((done) => server.watcher.once('ready', done))
  return { close: () => server.close() }
}
