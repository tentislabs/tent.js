import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { bundlePage, parse } from './borrowed/vite.ts'
import type { Node } from './tree.ts'
import { kid, kids, walk, word } from './tree.ts'

const slashed = (path: string): string => path.replaceAll('\\', '/')

/** Every code file under a folder, each where it lies. */
function filesUnder(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? filesUnder(join(folder, entry.name))
      : /\.tsx?$/.test(entry.name)
        ? [slashed(join(folder, entry.name))]
        : [],
  )
}

/** The name of what an import takes or gives: a name as it is, and a name that is written as a text. */
const named = (node: Node | undefined): string => word(node, 'name') ?? String(node?.value ?? '')

/**
 * Takes the files of one part of the page code, the folder of the part and the folder of the screen side. Answers
 * what the part takes from the files of the screen side that lie outside its own folder: for each such file, by
 * where it lies, the names that the part imports from it. Those files are held by the main file, and a part reads
 * them from there. Throws for an import that takes such a file whole, since the main file then could not say
 * which of its names are used.
 */
function takenFrom(files: string[], own: string, screens: string): Map<string, Set<string>> {
  const taken = new Map<string, Set<string>>()
  for (const file of files) {
    walk(parse(readFileSync(file, 'utf8'), file.endsWith('.tsx')), (node) => {
      if (node.type !== 'ImportDeclaration' || node.importKind === 'type') return
      const from = String(kid(node, 'source')?.value ?? '')
      if (!from.startsWith('.')) return
      const lies = slashed(resolve(dirname(file), from))
      if (lies.startsWith(`${own}/`) || !lies.startsWith(`${screens}/`)) return
      const names = taken.get(lies) ?? new Set<string>()
      taken.set(lies, names)
      for (const one of kids(node, 'specifiers')) {
        if (one.type !== 'ImportSpecifier')
          throw new Error(`${file} imports ${from} whole: a part of the page code imports the names it uses`)
        if (one.importKind !== 'type') names.add(named(kid(one, 'imported')))
      }
    })
  }
  return taken
}

// The parts that a page loads before the main file, in the development form alone: each holds what it imports itself,
// and nothing of the main file, which has not run yet.
const before = new Set(['refresh'])

/** The text of a made file that gives names, each read from a record that the main file of the page code exports. */
const handed = (record: string, key: string, names: string[]): string =>
  [
    `import { ${record} } from "./page.js"`,
    `const all = ${record}[${JSON.stringify(key)}]`,
    ...names.map((name) => `export const ${name} = all.${name}`),
    '',
  ].join('\n')

/**
 * Takes the folder of the screen side, one of the two forms, what says which files hold no effect of their own,
 * and for each name by which a module finds the page code the names that it gives. Has the builder make the files
 * of the page code for a browser: the main file, which every page loads, and one file for each part, which a page
 * loads only when it needs it. A part lies in `page/<part>/`, in a file named after it. What a part takes from the
 * screen side outside its own folder is held by the main file once, which gives it in the record `inner`, and what
 * it takes of React it reads from `names`: so a page holds each once, whichever of its files asks. The main file
 * names a part as `./<part>.js`, and a part the main file as `./page.js`. In the form for one file each is a plain
 * script: the main file gives its names as `__tent` of the page, each part reads them from there, and the part
 * `chat`, which only that form holds, is among them.
 */
export async function browserFiles(o: {
  screens: string
  small: boolean
  pure(file: string): boolean
  names: Record<string, string[]>
  single?: boolean
}): Promise<{ main: string; parts: Record<string, string>; maps: Record<string, string> }> {
  // The form that is not made small is that of development: each of its files comes with its source map.
  const maps: Record<string, string> = {}
  const mapped = (name: string): { map?: (text: string) => void } =>
    o.small
      ? {}
      : {
          map: (text) => {
            maps[name] = text
          },
        }
  const screens = slashed(o.screens).replace(/\/$/, '')
  const page = `${screens}/page`
  const entries = new Map<string, string>()
  for (const entry of readdirSync(page, { withFileTypes: true })) {
    if (!entry.isDirectory() || (entry.name === 'chat' && !o.single) || (before.has(entry.name) && o.small)) continue
    const found = ['tsx', 'ts'].map((ending) => `${page}/${entry.name}/${entry.name}.${ending}`).find(existsSync)
    if (found) entries.set(entry.name, found)
  }
  const taken = new Map<string, Map<string, Set<string>>>()
  for (const name of entries.keys())
    if (!before.has(name)) taken.set(name, takenFrom(filesUnder(`${page}/${name}`), `${page}/${name}`, screens))
  // Every name that some part takes of a file, by that file: the main file gives each once.
  const given = new Map<string, Set<string>>()
  for (const part of taken.values())
    for (const [file, names] of part) given.set(file, new Set([...(given.get(file) ?? []), ...names]))
  const keyOf = (file: string): string => slashed(relative(screens, file))
  const shared = [...given].sort(([a], [b]) => (a < b ? -1 : 1))
  const main = await bundlePage({
    entry: 'tent-page-entry',
    made: [
      `export * from ${JSON.stringify(`${page}/browser.ts`)}`,
      ...shared.map(
        ([file, names], place) =>
          `import { ${[...names]
            .sort()
            .map((name) => `${name} as in${place}_${name}`)
            .join(', ')} } from ${JSON.stringify(file)}`,
      ),
      `export const inner = { ${shared
        .map(
          ([file, names], place) =>
            `${JSON.stringify(keyOf(file))}: { ${[...names]
              .sort()
              .map((name) => `${name}: in${place}_${name}`)
              .join(', ')} }`,
        )
        .join(', ')} }`,
      '',
    ].join('\n'),
    side: 'browser',
    small: o.small,
    pure: o.pure,
    ...(o.single ? { classic: { name: '__tent', globals: {} } } : {}),
    ...mapped('page'),
    // The main file loads a part by its name, and holds nothing of it.
    instead: (file) => {
      const part = [...entries].find(([, entry]) => entry === file)
      return part ? { outside: `./${part[0]}.js` } : undefined
    },
  })
  const parts: Record<string, string> = {}
  for (const [name, entry] of entries) {
    const own = `${page}/${name}`
    parts[name] = await bundlePage({
      entry,
      side: 'browser',
      small: o.small,
      pure: o.pure,
      ...(o.single ? { classic: { globals: { './page.js': '__tent' } } } : {}),
      ...mapped(name),
      instead: (file) => {
        if (before.has(name)) {
          if (file === './page.js' || Object.hasOwn(o.names, file))
            throw new Error(`the part ${name} of the page code runs before the main file, and takes nothing of it`)
          return undefined
        }
        if (file === './page.js') return { outside: './page.js' }
        if (Object.hasOwn(o.names, file)) return { text: handed('names', file, o.names[file]) }
        const names = taken.get(name)?.get(file)
        if (names) return { text: handed('inner', keyOf(file), [...names].sort()) }
        if (file.startsWith(`${screens}/`) && !file.startsWith(`${own}/`))
          throw new Error(`the part ${name} of the page code takes ${file} in a way that the build did not read`)
        return undefined
      },
    })
  }
  return { main, parts, maps }
}
