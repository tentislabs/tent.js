import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// The conditions of an entry that the runtime takes for a module that is imported, in the order it asks them.
const conditions = ['node', 'import', 'default', 'require']

/** The file that one entry of `exports` names, through its conditions, or nothing. */
function namedBy(entry: unknown): string | undefined {
  if (typeof entry === 'string') return entry
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return undefined
  for (const condition of conditions)
    if (Object.hasOwn(entry, condition)) {
      const found = namedBy(Reflect.get(entry, condition))
      if (found !== undefined) return found
    }
  return undefined
}

/** The entry file of a package, as its `package.json` names it: its `exports` for `.`, or its `main`. */
function entryOf(folder: string): string {
  const read: unknown = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8'))
  const exports: unknown = Reflect.get(Object(read), 'exports')
  const main: unknown = Reflect.get(Object(read), 'main')
  const dotted =
    typeof exports === 'object' && exports !== null && Object.hasOwn(exports, '.') ? Reflect.get(exports, '.') : exports
  return namedBy(dotted) ?? (typeof main === 'string' ? main : 'index.js')
}

/**
 * Takes the folder of a part that was fetched and the name of a package in it, which lies under `node_modules/`.
 * Loads the module that the package names as its entry, and answers it: a module of CommonJS as its `default`.
 */
export async function fetchedModule(part: string, name: string): Promise<unknown> {
  const folder = join(part, 'node_modules', ...name.split('/'))
  return import(pathToFileURL(join(folder, entryOf(folder))).href)
}
