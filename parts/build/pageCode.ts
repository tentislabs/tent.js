import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { fingerprintOf, handedOn } from '../core/internal.ts'
import { builderVersion, bundlePage } from './borrowed/vite.ts'
import { browserFiles } from './pageParts.ts'

/** The files of the page code for a browser, in one of its two forms: the main file, one small file for each name, and the parts. */
interface PageForm {
  main: string
  names: Record<string, string>
  parts: Record<string, string>
}

/** What names the files of the page code, as it lies beside them. */
export interface PageJson {
  format: 'tent.page/1'
  fingerprint: string
  browser: PageForm
  browserDev: PageForm
  server: string
  // The file of the server for a development build: React of development, which tells the place of each tag that
  // a failing view was drawn by, where the other is made small.
  serverDev: string
  single: { main: string; parts: Record<string, string> }
}

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)

/** A source map, with the name of the file it is for. */
const mapNamed = (text: string, file: string): string => JSON.stringify({ ...Object(JSON.parse(text)), file })
const print = (text: string): string => fingerprintOf(encode(text)).slice(0, 12)

/** The folder of a part of the framework, where it lies beside this one. */
const partFolder = (part: string): string => fileURLToPath(new URL(`../${part}/`, import.meta.url))

// The builder writes whole paths into the form of development, as the file of each tag and in the sources of its
// maps: each is written from the folder of the repository, so no file holds the folder of the computer that made it.
const repository = `${join(partFolder('build'), '..', '..').replaceAll('\\', '/')}/`

/** A text of the page code, with each path written from the folder of the repository. */
const fromRepository = (text: string): string => text.replaceAll(repository, '')

/** The files of the page code that the builder made, each written from the folder of the repository. */
const filesFromRepository = (
  made: Awaited<ReturnType<typeof browserFiles>>,
): Awaited<ReturnType<typeof browserFiles>> => {
  const each = (texts: Record<string, string>): Record<string, string> =>
    Object.fromEntries(Object.entries(texts).map(([name, text]) => [name, fromRepository(text)]))
  return { main: fromRepository(made.main), parts: each(made.parts), maps: each(made.maps) }
}

/** Every source file under a folder that the page code may be made of, each with its text: no test and no list. */
function sourcesOf(folder: string, path = ''): [string, string][] {
  const found: [string, string][] = []
  for (const entry of readdirSync(join(folder, path), { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : 1,
  )) {
    const below = path ? `${path}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      if (entry.name !== 'tests') found.push(...sourcesOf(folder, below))
    } else if (/\.tsx?$/.test(entry.name) && entry.name !== 'list.ts')
      found.push([below, readFileSync(join(folder, below), 'utf8').replace(/\r\n?/g, '\n')])
  }
  return found
}

/** The version of a package that the page code is made of, read from the package itself. */
function versionOf(name: string): string {
  const lies = fileURLToPath(import.meta.resolve(`${name}/package.json`))
  return String(Object(JSON.parse(readFileSync(lies, 'utf8'))).version)
}

/**
 * Takes a folder. Has the builder make the files of the page code into it, and writes `page.json` beside them.
 * Throws what the builder throws.
 */
export async function madePageCode(folder: string): Promise<void> {
  const screens = partFolder('screens')
  // What the page code takes of `core` is data and pure functions: what it does not use is left out of a browser.
  const pure = (file: string): boolean => file.includes('/parts/core/')
  const write = (name: string, text: string): string => {
    const file = name.replace('<fp>', print(text))
    writeFileSync(join(folder, file), text)
    return file
  }
  // The file of the server of each form, with its map beside it, which a development bundle alone holds.
  const serverOf = async (small: boolean): Promise<string> => {
    let map = ''
    const file = write(
      small ? 'page.server.<fp>.js' : 'page.server.dev.<fp>.js',
      fromRepository(
        await bundlePage({
          entry: join(screens, 'page', 'server.ts'),
          side: 'server',
          small,
          pure,
          map: (text) => {
            map = fromRepository(text)
          },
        }),
      ),
    )
    if (map) writeFileSync(join(folder, `${file}.map`), mapNamed(map, file))
    return file
  }
  const server = await serverOf(true)
  const serverDev = await serverOf(false)
  const given: { names: Record<string, object> } = await import(pathToFileURL(join(folder, server)).href)
  const exported = (all: object): string[] =>
    Object.keys(all).filter((key) => key !== 'default' && /^[A-Za-z_$][\w$]*$/.test(key))
  const gives = Object.fromEntries(Object.entries(given.names).map(([name, all]) => [name, exported(all)]))
  const form = async (small: boolean): Promise<PageForm> => {
    const made = filesFromRepository(await browserFiles({ screens, small, pure, names: gives }))
    // The main file names its parts and each part names the main file, so no one of them can be named by its own
    // text alone: all are named from the texts of all, as the builder wrote them. So one name is one text.
    const all = print(JSON.stringify([made.main, Object.entries(made.parts).sort(([a], [b]) => (a < b ? -1 : 1))]))
    const dev = small ? '' : 'dev.'
    const files: Record<string, string> = { page: `page.${dev}${all}.js` }
    for (const [name, text] of Object.entries(made.parts))
      files[name] = `page.${dev}${name}.${print(`${all}${text}`)}.js`
    const named = (text: string): string =>
      text.replace(/(["'`])\.\/([A-Za-z0-9_-]+)\.js\1/g, (written, quote: string, name: string) =>
        Object.hasOwn(files, name) ? `${quote}./${files[name]}${quote}` : written,
      )
    writeFileSync(join(folder, files.page), named(made.main))
    const parts: Record<string, string> = {}
    for (const name of Object.keys(made.parts).sort()) {
      writeFileSync(join(folder, files[name]), named(made.parts[name]))
      parts[name] = files[name]
    }
    // Each file of the form of development has its map beside it, under its own name and the ending `.map`.
    for (const [name, map] of Object.entries(made.maps))
      if (Object.hasOwn(files, name)) writeFileSync(join(folder, `${files[name]}.map`), mapNamed(map, files[name]))
    const names: Record<string, string> = {}
    for (const [name, held] of Object.entries(given.names))
      names[name] = write(`page.${name.replaceAll('/', '-')}.<fp>.js`, handedOn(name, held, `./${files.page}`))
    return { main: files.page, names, parts }
  }
  const browser = await form(true)
  // The form for one file holds plain scripts that name each other by `__tent` alone, so each is named by its text.
  const one = filesFromRepository(await browserFiles({ screens, small: true, pure, names: gives, single: true }))
  const single = {
    main: write('page.single.<fp>.js', one.main),
    parts: Object.fromEntries(
      Object.keys(one.parts)
        .sort()
        .map((name) => [name, write(`page.single.${name}.<fp>.js`, one.parts[name])]),
    ),
  }
  const page: PageJson = {
    format: 'tent.page/1',
    // One fingerprint for the pair of forms: both give the same names with the same meaning.
    fingerprint: fingerprintOf(encode([browser.main, server].join('\n'))),
    browser,
    browserDev: await form(false),
    server,
    serverDev,
    single,
  }
  writeFileSync(join(folder, 'page.json'), `${JSON.stringify(page, null, 2)}\n`)
}

/**
 * Takes the folder that holds the page code as it was made from the sources, one folder for each state of them, and
 * the name of the one in use. Takes every folder away but the one in use and the newest beside it: so a computer on
 * which the sources change keeps two, and not one for each change. A folder that another program is still making,
 * whose name holds a dot, is left alone, and so is what cannot be taken away now.
 */
export function sweptPageCode(kept: string, inUse: string): void {
  const made = readdirSync(kept, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.includes('.') && entry.name !== inUse)
    .map((entry) => ({ name: entry.name, at: statSync(join(kept, entry.name)).mtimeMs }))
    .sort((a, b) => b.at - a.at)
  for (const old of made.slice(1)) {
    try {
      rmSync(join(kept, old.name), { recursive: true, force: true })
    } catch {
      // A program that still reads it holds it: the next one that makes a folder takes it away.
    }
  }
}

let found: Promise<{ folder: string; page: PageJson }> | undefined

const makers = ['pageCode.ts', 'pageParts.ts', 'tree.ts', 'borrowed/vite.ts']

/**
 * Answers where the files of the page code lie, and what names them. The page code is built once for a release
 * and lies in the install. Where the framework runs from its own sources it is made at the first need, and kept
 * under the fingerprint of everything it is made of, so that it is made again only when one of those changes.
 */
export function pageCode(): Promise<{ folder: string; page: PageJson }> {
  if (found) return found
  const made = (async () => {
    const shipped = join(partFolder('screens'), 'built')
    if (existsSync(join(shipped, 'page.json')))
      return { folder: shipped, page: JSON.parse(readFileSync(join(shipped, 'page.json'), 'utf8')) }
    const key = print(
      JSON.stringify({
        // What `page.json` holds beside the files: a folder that was kept before it held the screens is made anew.
        holds: ['screens', 'parts', 'inner', 'plain tags', 'maps', 'single', 'server of development'],
        builder: builderVersion(),
        react: versionOf('react'),
        dom: versionOf('react-dom'),
        screens: sourcesOf(partFolder('screens')),
        core: sourcesOf(partFolder('core')),
        // The files of this part that make it, so that a change of how it is made makes it anew too.
        makers: makers.map((file) => readFileSync(join(partFolder('build'), file), 'utf8').replace(/\r\n?/g, '\n')),
      }),
    )
    const kept = join(
      dirname(dirname(fileURLToPath(import.meta.resolve('vite/package.json')))),
      '.cache',
      'tentjs-page',
    )
    const folder = join(kept, key)
    if (!existsSync(join(folder, 'page.json'))) {
      // It is made in a folder of its own and put in its place whole: two programs may make it at one time.
      const making = join(kept, `${key}.${process.pid}.${Date.now()}`)
      mkdirSync(making, { recursive: true })
      await madePageCode(making)
      try {
        renameSync(making, folder)
      } catch {
        rmSync(making, { recursive: true, force: true })
      }
      sweptPageCode(kept, key)
    }
    return { folder, page: JSON.parse(readFileSync(join(folder, 'page.json'), 'utf8')) }
  })()
  found = made
  // A making that failed is not kept: the next build of the session tries again.
  made.catch(() => {
    if (found === made) found = undefined
  })
  return made
}
