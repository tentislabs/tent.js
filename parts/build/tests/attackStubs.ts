import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { buildProject } from '../index.ts'
import { copyOf } from './projects.ts'

/** One way by which a screen file reaches a backend file: the files that are written into the project of the vault. */
export type Way = Record<string, string>

// Every screen of a way starts so, and ends with a view that uses what the way reached.
const head = "import { screen } from 'tentjs/ui'\n"
const tail = (uses: string): string =>
  `\nexport const wayScreen = screen('wayScreen', { path: '/way', access: 'anyone', view: () => <span>{String(${uses})}</span> })\n`

/** A screen file that reaches a backend file by the lines it is given, and shows what it reached. */
export const screenWith = (lines: string, uses: string): string => `${head}${lines}\n${tail(uses)}`

/** A package of `node_modules`, by its name, with the one file it gives. */
export const packageOf = (name: string, text: string, type = 'module'): Way => ({
  [`node_modules/${name}/package.json`]: `{ "name": "${name}", "type": "${type}", "main": "index.js" }\n`,
  [`node_modules/${name}/index.js`]: text,
})

// A package named `tentjs` in the project, as a project that installed the framework holds one. It stands in for
// the words: each is a thing that takes any call and any read, so that a backend file can be loaded with it.
const standIn =
  "const any = () => new Proxy(function () {}, { get: (_, key) => (key === 'then' || typeof key === 'symbol' ? undefined : any()), apply: () => any() })\n" +
  'export const action = any(), change = any(), input = any(), number = any(), query = any(), table = any(), text = any(), where = any()\n'

/** The package `tentjs` in the folder of a project, which the builder finds by its name. */
export const installed: Way = packageOf('tentjs', standIn)

const filesIn = (folder: string, path = ''): string[] => {
  const found: string[] = []
  for (const name of readdirSync(join(folder, path)).sort()) {
    const below = path ? `${path}/${name}` : name
    if (statSync(join(folder, below)).isDirectory()) found.push(...filesIn(folder, below))
    else found.push(below)
  }
  return found
}

// A marker text of the backend files of the vault, of which each holds several: in a comment, a constant, a rule,
// the text of a query, the name of a type and of a private column.
const marker = /MARKER-[A-Z-]{6,}|MARKER(COLUMN|TYPE)/g

/**
 * Takes a text of a browser file. Answers every marker text it holds: as it is written, and inside each text that
 * the file holds in base 64, as an address that carries its own bytes does.
 */
export function markersIn(text: string): string[] {
  const packed = [...text.matchAll(/base64,([A-Za-z0-9+/=]+)/g)].map((one) =>
    Buffer.from(one[1], 'base64').toString('latin1'),
  )
  return [...new Set([text, ...packed].flatMap((one) => one.match(marker) ?? []))].sort()
}

/** What a build of one way gave: whether a bundle was written, its errors, and each browser file that holds a marker text. */
export interface Reached {
  built: boolean
  // Each error as its code, and the file and the line it names.
  errors: string[]
  // The text of every browser file that the build made of the project, without the page code.
  modules: string
  // Whether the bundle holds the browser module of the screen of the way: a way that built nothing proves nothing.
  screen: boolean
  leaks: string[]
}

/**
 * Takes the name of a way and its files. Writes them into a copy of the project of the vault, builds it for a
 * browser, and answers what every file under `browser/` and `assets/` of the bundle holds of the marker texts. A
 * build that fails wrote no file for a browser, and holds none.
 */
export async function reached(name: string, way: Way, o: { for?: 'dev' | 'release' } = {}): Promise<Reached> {
  const folder = copyOf('attack-stubs', `attack-stubs-${name}`)
  for (const [file, text] of Object.entries(way)) {
    mkdirSync(dirname(join(folder, file)), { recursive: true })
    writeFileSync(join(folder, file), text)
  }
  const made = await buildProject(folder, { for: o.for ?? 'release' })
  const errors = made.findings
    .filter((one) => one.level === 'error')
    .map((one) => `${one.code} ${one.where?.file}:${one.where?.line}`)
  if (made.bundleFolder === '') return { built: false, errors, screen: false, leaks: [], modules: '' }
  const leaks: string[] = []
  let modules = ''
  for (const file of filesIn(made.bundleFolder)) {
    if (!file.startsWith('browser/') && !file.startsWith('assets/')) continue
    const text = readFileSync(join(made.bundleFolder, file), 'latin1')
    if (!file.startsWith('browser/page.')) modules += text
    const found = markersIn(text)
    if (found.length) leaks.push(`${name}: ${file.replace(/\.[0-9a-f]{12}\./, '.')} holds ${found.join(', ')}`)
  }
  const screens: unknown = Reflect.get(Object(made.description.browser), 'screens')
  return { built: true, errors, screen: Object.hasOwn(Object(screens), 'wayScreen'), leaks, modules }
}
