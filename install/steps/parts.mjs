// The named step `parts`: the parts of the framework built into the two trees of a release, the player and the
// build tools: the code of each part as one file of plain JavaScript, with what loads each borrowed package that the
// part loads only at its first use in a file of its own beside it, and what the part reads at run time beside them.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { rolldown } from 'rolldown'
import { parseAst } from 'rolldown/parseAst'
import { transformSync } from 'rolldown/utils'
import { playerPackages } from './modules.mjs'

/** The parts that the player holds, and those that only the build tools hold (`41-install.md`, section 2). */
export const playerParts = ['core', 'data', 'flows', 'connect', 'ai', 'screens', 'engine', 'history', 'publish', 'cli']
export const toolsParts = ['build', 'check', 'docs', 'test', 'workspaces', 'starters']

/** The layer that holds a part. */
const layerOf = (part) => (toolsParts.includes(part) ? 'tools' : 'player')

// A part's own starters are app code that is written into a project as it is, and never run from the tree.
const asIs = new Set(['starters'])

// The file a part starts from where no entry of `parts/entries.json` names it: the command line's own start.
const mains = { cli: 'shell.ts' }

// Files of a part that the room runtime imports by their own, never by the entry of the part, so that a host loads no
// more of the part into an isolate: each is answered as an entry is, from the one code of its part.
const byOwnFile = ['data/dbFace.ts', 'data/fileName.ts']

// Files that run in a thread or a program of their own, or before the rest of their part is loaded: each is built
// into one file of its own at its place.
const apart = [
  'check/rulesWorker.ts',
  'cli/askFirst.ts',
  'cli/knownLook.ts',
  'cli/marks.ts',
  'cli/names.ts',
  'engine/files/thread.ts',
  'engine/pictures/thread.ts',
  'engine/python/rowsWriter.ts',
  'engine/readers/thread.ts',
  'engine/rooms/apart/thread.ts',
  'engine/rooms/held/host.ts',
  'engine/threads/query.ts',
]

// The folder of a part that holds its code: the one file `code.js`; a file of its own for what loads each borrowed
// package that the part loads only at its first use, and where there is one the bundler's helpers that these share;
// and the thin file of each module that the part imports when it is first needed, which names what it gives from them.
const held = 'part'

// What a part keeps beside its code for those who change it, and nothing runs: the text of its interface, the list
// of what is owed a page of the docs, and the notes of the outside pages it was built against.
const papers = new Set(['interface.txt', 'owed.json', 'sources.md'])

/** Every file of a part but its tests and its papers, by its path from the folder of the part, with `/`. */
function filesOf(folder, path = '') {
  const found = []
  for (const entry of readdirSync(join(folder, path), { withFileTypes: true })) {
    const below = path ? `${path}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      if ((path === '' && entry.name === 'tests') || entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      found.push(...filesOf(folder, below))
    } else if (!papers.has(entry.name)) found.push(below)
  }
  return found.sort()
}

const isCode = (file) => /\.tsx?$/.test(file) && !file.endsWith('.d.ts')
const built = (file) => (isCode(file) ? file.replace(/\.tsx?$/, '.js') : file)

/** The part of a file of the source tree, and its path in the part with `/`, or nothing for a file outside `parts/`. */
function partPath(root, file) {
  const path = relative(join(root, 'parts'), file).split(sep).join('/')
  if (path.startsWith('..')) return undefined
  const [part, ...rest] = path.split('/')
  return part ? { part, path: rest.join('/') } : undefined
}

/** Where a file of the source tree lies in the trees of the release, by its path from the root of the repository. */
function placeOf(root, file) {
  const at = partPath(root, file)
  if (!at) return undefined
  if (!at.path) return `${layerOf(at.part)}/parts/${at.part}`
  return `${layerOf(at.part)}/parts/${at.part}/${asIs.has(at.part) ? at.path : built(at.path)}`
}

/** Walks every node of a tree of source, handing each to `seen` with the node that holds it. */
function walk(node, seen, holder) {
  if (Array.isArray(node)) for (const one of node) walk(one, seen, holder)
  else if (node && typeof node === 'object') {
    const typed = typeof node.type === 'string'
    if (typed) seen(node, holder)
    for (const value of Object.values(node)) if (value && typeof value === 'object') walk(value, seen, typed ? node : holder)
  }
}

/**
 * What the build of the parts knows of the source: for each part its entries, and where in the release a file of
 * code is answered: an entry, and a file that runs apart, each at its own place.
 */
function layoutOf(root) {
  const entries = JSON.parse(readFileSync(join(root, 'parts', 'entries.json'), 'utf8'))
  const parts = readdirSync(join(root, 'parts'), { withFileTypes: true })
    .filter((one) => one.isDirectory())
    .map((one) => one.name)
  const members = new Map()
  for (const part of parts) {
    if (!playerParts.includes(part) && !toolsParts.includes(part))
      throw new Error(`The part ${part} is in no tree of the release: name it in install/steps/parts.mjs`)
    if (asIs.has(part)) continue
    const own = Object.values(entries)
      .filter((file) => file.startsWith(`parts/${part}/`))
      .map((file) => file.slice(`parts/${part}/`.length))
    const ownFiles = byOwnFile.filter((file) => file.startsWith(`${part}/`)).map((file) => file.slice(part.length + 1))
    const named = [...new Set([...(mains[part] ? [mains[part]] : []), ...own, ...ownFiles])]
    if (!named.length)
      throw new Error(`The part ${part} has no entry: name its file in parts/entries.json or in install/steps/parts.mjs`)
    members.set(part, named)
  }
  /** The place of the file that answers a file of code: an entry, or a file that runs apart, at its own place. */
  const answeredBy = (file) => {
    const at = partPath(root, file)
    if (!at) return undefined
    if (apart.includes(`${at.part}/${at.path}`) || members.get(at.part)?.includes(at.path)) return placeOf(root, file)
    return undefined
  }
  const isEntry = (file) => {
    const at = partPath(root, file)
    return at !== undefined && members.get(at.part)?.includes(at.path) === true
  }
  return { parts, members, answeredBy, isEntry }
}

/**
 * Every import of the framework by its name, as `parts/entries.json` gives it, with the place of the release that
 * answers it and the place of its source, which the type checker reads.
 */
export function entryPlaces(root) {
  const entries = JSON.parse(readFileSync(join(root, 'parts', 'entries.json'), 'utf8'))
  return Object.fromEntries(
    Object.entries(entries).map(([name, file]) => [
      name,
      { code: placeOf(root, join(root, file)), types: `tools/${file}` },
    ]),
  )
}

/** A relative address from a place of the release to another, as an import or `new URL` writes it. */
function wayFrom(from, to, folder = false) {
  let way = posix.relative(posix.dirname(from), to)
  if (folder && !way.endsWith('/')) way += '/'
  return way.startsWith('.') ? way : `./${way}`
}

// A file of code turned into plain JavaScript, once: the files of a part that runs apart are built again with it.
const plain = new Map()

/** Takes a file of code. Answers its text as plain JavaScript, its types taken off and its tags turned into calls. */
function plainOf(file) {
  const kept = plain.get(file)
  if (kept !== undefined) return kept
  const made = transformSync(file, readFileSync(file, 'utf8'), { jsx: { runtime: 'automatic' } })
  if (made.errors?.length) throw new Error(`${file}: ${made.errors.map((one) => one.message).join('; ')}`)
  plain.set(file, made.code)
  return made.code
}

/** The package that an import names, or nothing for a file and for a module of the runtime. */
function packageOf(source) {
  if (source.startsWith('./') || source.startsWith('../') || source.startsWith('node:')) return undefined
  return source.split('/').slice(0, source.startsWith('@') ? 2 : 1).join('/')
}

// The declarations that import another module, as the reader of source names them: an import, and an export from one.
const importing = /^(ImportDeclaration|ExportNamedDeclaration|ExportAllDeclaration)$/

/**
 * Whether an import of a file of the player names what an install of the player alone does not hold: a part of the
 * build tools, or a package that the player does not carry.
 */
function tooled(root, file, source) {
  const from = partPath(root, file)
  if (from === undefined || layerOf(from.part) !== 'player' || source.startsWith('node:')) return false
  const name = packageOf(source)
  if (name !== undefined) return !playerPackages.includes(name)
  const to = partPath(root, resolve(dirname(file), source))
  return to !== undefined && layerOf(to.part) === 'tools'
}

// What each file of code imports, read once.
const imports = new Map()

/** Each module that a module of code imports by an import that is no `import()`, as it is written. */
function importsOf(file) {
  if (!imports.has(file))
    imports.set(
      file,
      parseAst(plainOf(file), { lang: 'js', sourceType: 'module' }, file)
        .body.filter((node) => importing.test(node.type) && typeof node.source?.value === 'string')
        .map((node) => node.source.value),
    )
  return imports.get(file)
}

/**
 * Takes the root, the files a part starts from, and every module of the part. Answers, for each module whose loading
 * loads a package that the part is not loaded with, the packages it loads so: the module imports one, or imports
 * such a module, by an import that is no `import()`. Loaded with the part are the files it starts from, each module
 * that a loaded one imports so, and the packages those import. A borrowed part is loaded at its first use.
 */
function borrowedLater(root, starts, modules) {
  const own = (file, source) => {
    const target = resolve(dirname(file), source)
    return packageOf(source) === undefined && modules.has(target) ? target : undefined
  }
  const loaded = new Set()
  const packages = new Set()
  const next = [...starts]
  while (next.length) {
    const file = next.pop()
    if (loaded.has(file)) continue
    loaded.add(file)
    for (const source of importsOf(file)) {
      if (packageOf(source) !== undefined) packages.add(packageOf(source))
      else if (own(file, source)) next.push(own(file, source))
    }
  }
  const later = new Map()
  for (let grew = true; grew; ) {
    grew = false
    for (const file of modules) {
      if (loaded.has(file)) continue
      const reached = new Set(later.get(file))
      for (const source of importsOf(file)) {
        const name = packageOf(source)
        if (name !== undefined && !packages.has(name)) reached.add(name)
        for (const one of later.get(own(file, source)) ?? []) reached.add(one)
      }
      if (reached.size > (later.get(file)?.size ?? 0)) {
        later.set(file, reached)
        grew = true
      }
    }
  }
  return later
}

/**
 * Takes a file, an import or an export of another module, and how that module is taken. Answers it as the same names
 * taken from that module when this module is first run. A module of the player that imports what an install of the
 * player alone does not hold is loaded only where it is needed, by `import()`: in the one file of its part a static
 * import would load it with the part. A module of the runtime is taken from the runtime as it is, with no ES module
 * around it: the runtime makes that one by reading each member, which loads at once what a member loads at its first
 * use, as the client of `fetch` behind `node:http`.
 */
function taken(file, node, how) {
  const runtime = how === 'runtime'
  const from = runtime
    ? `process.getBuiltinModule(${JSON.stringify(node.source.value)})`
    : `await import(${JSON.stringify(node.source.value)})`
  const nameOf = (one) => (one.type === 'Literal' ? JSON.stringify(one.value) : one.name)
  if (node.type === 'ExportAllDeclaration')
    throw new Error(`${file}: export * from ${node.source.value} is not loaded where it is needed: name what it gives`)
  if (node.type === 'ExportNamedDeclaration') {
    const taken = node.specifiers.map((one, k) => `${nameOf(one.local)}: __tent${node.start}_${k}`)
    const given = node.specifiers.map((one, k) => `__tent${node.start}_${k} as ${nameOf(one.exported)}`)
    return `const { ${taken.join(', ')} } = ${from}; export { ${given.join(', ')} };`
  }
  if (!node.specifiers.length) return `${from};`
  const lines = []
  const names = []
  for (const one of node.specifiers) {
    // The default of a module of the runtime is the module itself.
    if (one.type === 'ImportNamespaceSpecifier' || (runtime && one.type === 'ImportDefaultSpecifier'))
      lines.push(`const ${one.local.name} = ${from};`)
    else if (one.type === 'ImportDefaultSpecifier') names.push(`default: ${one.local.name}`)
    else {
      const name = nameOf(one.imported)
      names.push(name === one.local.name ? name : `${name}: ${one.local.name}`)
    }
  }
  if (names.length) lines.push(`const { ${names.join(', ')} } = ${from};`)
  return lines.join(' ')
}

/**
 * Takes the root of the repository, the layout, a file of code, the place of the file its code is written into,
 * and the file that is the program's own start there, where there is one. Answers its text as plain JavaScript in
 * which the module finds what it found beside itself: its own address, `import.meta.url`, is the place it would
 * have had as a file of its own, and each relative path that is no import and names a file of the source is
 * written as the way from that place to what answers it in the release.
 */
function moduleText(root, layout, file, into, start) {
  const text = plainOf(file)
  const place = placeOf(root, file)
  const imported = new Set()
  const changes = []
  walk(parseAst(text, { lang: 'js', sourceType: 'module' }, file), (node, holder) => {
    if ((importing.test(node.type) || node.type === 'ImportExpression') && node.source?.type === 'Literal')
      imported.add(node.source.start)
    if (importing.test(node.type) && node.source) {
      const how = tooled(root, file, node.source.value) ? 'later' : node.source.value.startsWith('node:') ? 'runtime' : undefined
      if (how) changes.push({ start: node.start, end: node.end, text: taken(file, node, how) })
    }
    if (node.type === 'MetaProperty' && node.meta?.name === 'import') {
      const member = holder?.type === 'MemberExpression' && holder.object === node ? holder.property?.name : undefined
      if (member !== 'url' && member !== 'resolve' && !(member === 'main' && file === start))
        throw new Error(`${file}: import.meta.${member} is not built into one file: read import.meta.url`)
      const at = `new URL(${JSON.stringify(wayFrom(into, place))}, import.meta.url).href`
      if (member === 'url') changes.push({ start: holder.start, end: holder.end, text: at })
      // The program's own start is the entry's thin file, whose place the program was started with, and not the
      // file of the part that holds its code.
      if (member === 'main' && into !== place)
        changes.push({
          start: holder.start,
          end: holder.end,
          text: `(process.argv[1] !== undefined && process.getBuiltinModule('node:url').pathToFileURL(process.argv[1]).href === ${at})`,
        })
      return
    }
    if (node.type !== 'Literal' || typeof node.value !== 'string' || imported.has(node.start)) return
    const value = node.value
    if (!value.startsWith('./') && !value.startsWith('../')) return
    const target = resolve(dirname(file), value)
    // A release holds only what lies inside the repository: a path that leads out of it names nothing of the release,
    // whatever lies there on the computer that builds it.
    const inside = relative(root, target)
    if (inside.startsWith('..') || isAbsolute(inside) || !existsSync(target)) return
    const answered = isCode(target) && statSync(target).isFile() ? layout.answeredBy(target) : placeOf(root, target)
    if (!answered)
      throw new Error(
        `${file}: ${value} names a file that is no entry and runs apart nowhere: name it in install/steps/parts.mjs`,
      )
    const written = text.slice(node.start, node.end)
    if (written.slice(1, -1) !== value) throw new Error(`${file}: a path of ${written} is not where the reader of source says`)
    changes.push({
      start: node.start,
      end: node.end,
      text: `${written[0]}${wayFrom(place, answered, value.endsWith('/'))}${written[0]}`,
    })
  })
  let out = text
  for (const change of changes.sort((a, b) => b.start - a.start))
    out = out.slice(0, change.start) + change.text + out.slice(change.end)
  return out
}

/**
 * Takes the root, the layout, the folder to build into, the part, the files to build, and whether they run apart.
 * Builds the entries of a part, each as a thin file at its own place that names what it gives from the files of the
 * part: the one file, which holds their code, and a file of its own for what loads each borrowed package that the
 * part loads only at its first use. Or it builds one file that runs apart from the rest of its part, which holds
 * all of its code itself. Every import of another part is the entry of that part, loaded at run time, and
 * every package is the one the tree carries beside it.
 */
async function bundled(root, layout, out, part, files, alone) {
  const folder = join(root, 'parts', part)
  const base = posix.dirname(placeOf(root, join(folder, 'index.ts')))
  // The file that the code is written into, which `import.meta.url` of each of its modules is reckoned from.
  const into = alone ? placeOf(root, join(folder, files[0])) : `${base}/${held}/code.js`
  const input = Object.fromEntries(files.map((file) => [built(file).replace(/\.js$/, ''), join(folder, file)]))
  const start = alone ? join(folder, files[0]) : join(folder, mains[part] ?? '')
  const modules = new Set()
  const bundle = await rolldown({
    input,
    // An import of another part is written as the way from the file of this code, beside which every entry lies.
    makeAbsoluteExternalsRelative: false,
    platform: 'node',
    logLevel: 'warn',
    onLog(_level, log) {
      // A cycle of imports inside a part is the part's own design, and a module that is imported both ways is
      // in its one file either way: neither is a fault, and nor is the time the build took.
      if (!['CIRCULAR_DEPENDENCY', 'INEFFECTIVE_DYNAMIC_IMPORT', 'PLUGIN_TIMINGS'].includes(log.code))
        throw new Error(`${into}: ${log.message}`)
    },
    plugins: [
      {
        name: 'tent-parts',
        resolveId(source, importer) {
          if (isAbsolute(source) || !importer) return source
          if (!source.startsWith('./') && !source.startsWith('../')) return { id: source, external: true }
          const target = resolve(dirname(importer), source)
          const at = partPath(root, target)
          if (!at) throw new Error(`${importer}: ${source} lies outside the parts`)
          if (at.part === part) return target
          if (!layout.isEntry(target)) throw new Error(`${importer}: ${source} is no entry of the part ${at.part}`)
          return { id: wayFrom(into, placeOf(root, target)), external: true }
        },
        load(id) {
          if (!isCode(id)) return undefined
          modules.add(id)
          return { code: moduleText(root, layout, id, into, start), moduleType: 'js' }
        },
      },
    ],
  })
  // In the one file of a part the import of a package is loaded with the part: so what loads a borrowed part that
  // the part loads at its first need is a file of its own beside it, named after what it borrows, loaded then. It is
  // worked out once every module is read, which is when the files are made.
  let later
  const borrows = (id) => {
    later ??= borrowedLater(root, Object.values(input), modules)
    return later.get(id)
  }
  const { output } = await bundle.generate({
    format: 'esm',
    // A module runs when the source would run it: one that the part imports when it is first needed runs then.
    strictExecutionOrder: true,
    entryFileNames: '[name].js',
    ...(alone
      ? { codeSplitting: false }
      : {
          chunkFileNames: `${held}/[name].js`,
          codeSplitting: {
            groups: [
              // The one file goes first: what such a module imports from the rest of the part stays in it.
              { name: 'code', test: (id) => borrows(id) === undefined, priority: 2 },
              {
                debugName: 'borrowed',
                name: (id) => [...(borrows(id) ?? [])].sort().join('-').replace(/[@/]/g, '') || null,
                priority: 1,
              },
            ],
          },
        }),
  })
  await bundle.close()
  const kept = output.filter((one) => !alone || one.isEntry)
  for (const one of output.filter((chunk) => !kept.includes(chunk)))
    if (kept.some((chunk) => chunk.code.includes(posix.basename(one.fileName))))
      throw new Error(`${into}: its code imports ${one.fileName}, which a file that runs apart cannot hold`)
  for (const one of kept) {
    const to = join(out, base, one.fileName)
    mkdirSync(dirname(to), { recursive: true })
    writeFileSync(to, one.type === 'chunk' ? one.code : one.source)
  }
  return kept.length
}

/**
 * Takes the root of the repository and the folder to build into. Writes the player and the build tools there,
 * as `player/parts/<part>/` and `tools/parts/<part>/`: the code of each part as one file, `part/code.js`, with what
 * loads each borrowed package that the part loads only at its first use as a file of its own beside it, and a thin
 * file at the place of each of its entries; each file that runs apart from the rest of its part as one file at
 * its place; and every other file of a part as it is. The build tools also hold the source of every part, which
 * the type checker reads for the types of a project, and the page code, built once for the release. Answers the
 * number of files it wrote.
 */
export async function buildParts(root, out) {
  rmSync(out, { recursive: true, force: true })
  const layout = layoutOf(root)
  let count = 0
  for (const part of layout.parts) {
    const folder = join(root, 'parts', part)
    for (const path of filesOf(folder)) {
      if (!asIs.has(part) && isCode(path)) continue
      const to = join(out, placeOf(root, join(folder, path)))
      mkdirSync(dirname(to), { recursive: true })
      writeFileSync(to, readFileSync(join(folder, path)))
      count++
    }
    if (asIs.has(part)) continue
    const files = layout.members.get(part)
    count += await bundled(root, layout, out, part, files, false)
    for (const one of apart.filter((file) => file.startsWith(`${part}/`))) {
      count += await bundled(root, layout, out, part, [one.slice(part.length + 1)], true)
    }
    // The type checker of a project reads the framework from its sources, as the build tools find them beside themselves.
    for (const path of filesOf(folder).filter((one) => /\.tsx?$/.test(one))) {
      const to = join(out, 'tools', 'parts', part, path)
      mkdirSync(dirname(to), { recursive: true })
      if (!existsSync(to)) writeFileSync(to, readFileSync(join(folder, path)))
    }
  }
  // The page code is built once for each release, and lies where the build looks for it first.
  const { pageCode } = await import(pathToFileURL(join(root, 'parts', 'build', 'pageCode.ts')).href)
  const page = await pageCode()
  cpSync(page.folder, join(out, 'tools', 'parts', 'screens', 'built'), { recursive: true })
  return count
}

/** The size of every file under a folder, in bytes. */
export function sizeOf(folder) {
  if (!existsSync(folder)) return 0
  let size = 0
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name)
    size += entry.isDirectory() ? sizeOf(path) : statSync(path).size
  }
  return size
}
