// The marks of the modules of development. In development each module of a view lies at its address with no
// fingerprint, as Vite serves a page, so the modules that import it name it the same way through every save. What a
// browser holds of one is told apart by a mark instead, as Vite asks a module with its own: every address that names
// such a file - in the record of a page, in a module that imports it, in the swap of a switch, and the source map
// that a module names - carries `?v=` and the first 12 characters of a fingerprint of the file and of every file it
// imports, however deep. So a file that changed, or that imports one which changed, is another address, and every
// other is the one the browser holds. A mark is worked out from the fingerprints of the list of the version, so a
// save reads only the files it changed.
import type { Description } from '../core/internal.ts'
import { fingerprintOf } from '../core/internal.ts'
import { bytesAt, printsAt } from './files.ts'

/** A version as its files are read: the place they lie in, and its description. */
interface Version {
  bundle: string
  description: Description
}

// The files of each description of development that lie at their addresses with no fingerprint.
const steady = new WeakMap<object, Set<string>>()

/**
 * The files of a version of development that lie at their addresses with no fingerprint: the modules of its views
 * and their style files, as the description names them for each screen and component and among what they share. A
 * package that was built apart carries its fingerprint, and so does the page code.
 */
function steadyOf(description: Description): Set<string> {
  const held = steady.get(description)
  if (held) return held
  const found = new Set<string>()
  const browser: Record<string, unknown> = Object(description.browser)
  if (description.app.dev === true)
    for (const one of [browser.screens, browser.components, browser.shared, browser.styles])
      for (const files of Array.isArray(one) ? [one] : Object.values(Object(one)))
        for (const file of Array.isArray(files) ? files : [])
          if (typeof file === 'string' && /^browser\/.+\.(js|css)$/.test(file) && !file.startsWith('browser/package.'))
            found.add(file)
  steady.set(description, found)
  return found
}

/** Whether a file of a version lies at its address with no fingerprint, and is named with its mark. */
export const isSteady = (version: Version, path: string): boolean => steadyOf(version.description).has(path)

/** An import of a file beside a module, as the builder writes it. */
const imported = /"\.\/([^"?#\n]+\.js)"/g

/** The last line of a module of development, which names its source map beside it, as the builder writes it. */
const mapLine = /\n\/\/# sourceMappingURL=([^\s?#]+\.map)\n$/

// The files beside it that each file imports, by the fingerprint of its bytes: one text names one list, so a file
// is read once, whichever versions hold it. The newest are kept, which a long day of saves does not outgrow.
const importsOfPrint = new Map<string, string[]>()
const most = 20_000

// The mark of each steady file of a version, by its place and its path, as long as its description is held.
const marks = new WeakMap<object, Map<string, string>>()

/** The fingerprint of a file of a version, as its list holds it. */
function printOf(version: Version, path: string): string {
  const print = printsAt(version.bundle)[path]
  if (print === undefined) throw Object.assign(new Error(`The version holds no file ${path}.`), { code: 'ENOENT' })
  return print
}

/** The files beside it that a file of a version imports: read where its bytes were never read. */
function importsOf(version: Version, path: string): string[] {
  const print = printOf(version, path)
  const held = importsOfPrint.get(print)
  if (held) return held
  const found = [...new TextDecoder().decode(bytesAt(version.bundle, path)).matchAll(imported)].map(
    (one) => `browser/${one[1]}`,
  )
  if (importsOfPrint.size >= most) importsOfPrint.clear()
  importsOfPrint.set(print, found)
  return found
}

/** Takes a version and the path of one of its steady files. Answers its mark. */
export function moduleMarkOf(version: Version, path: string): string {
  let known = marks.get(version.description)
  if (!known) {
    known = new Map<string, string>()
    marks.set(version.description, known)
  }
  const key = `${version.bundle}\n${path}`
  const held = known.get(key)
  if (held !== undefined) return held
  const files = steadyOf(version.description)
  // The file and every file it reaches, each once, in one order: two files that import each other are one mark.
  const reached = new Map<string, string>()
  const left = [path]
  for (let file = left.pop(); file !== undefined; file = left.pop()) {
    if (reached.has(file)) continue
    reached.set(file, printOf(version, file))
    left.push(...importsOf(version, file).filter((one) => files.has(one)))
  }
  const text = [...reached].sort(([a], [b]) => (a < b ? -1 : 1)).map(([file, print]) => `${file} ${print}`)
  const mark = fingerprintOf(new TextEncoder().encode(text.join('\n'))).slice(0, 12)
  known.set(key, mark)
  return mark
}

/**
 * Takes a version, the path of one of its steady files, and its bytes. Answers the bytes it is served with: each
 * steady module it imports, and its source map, named at their marks.
 */
export function servedOf(version: Version, path: string, bytes: Uint8Array): Uint8Array {
  if (!path.endsWith('.js')) return bytes
  const files = steadyOf(version.description)
  return new TextEncoder().encode(
    new TextDecoder()
      .decode(bytes)
      .replace(imported, (written, name: string) =>
        files.has(`browser/${name}`) ? `"./${name}?v=${moduleMarkOf(version, `browser/${name}`)}"` : written,
      )
      // The map changes with its module, so it is asked at the module's mark, and found by it as the module is.
      .replace(mapLine, (_line, name: string) => `\n//# sourceMappingURL=${name}?v=${moduleMarkOf(version, path)}\n`),
  )
}

/** Takes a version and the path of one of its files. Answers the address it is named by: with its mark where it is steady. */
export const markedOf = (version: Version, path: string): string =>
  path !== '' && isSteady(version, path) ? `${path}?v=${moduleMarkOf(version, path)}` : path

/** Takes what stands after the question mark of an address. Answers the mark it asks with, where it asks with one. */
export const askedMark = (search: string): string | undefined =>
  /^[0-9a-f]{12}$/.exec(new URLSearchParams(search).get('v') ?? '')?.[0]
