import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Description } from '../../core/internal.ts'
import { fingerprintOf } from '../../core/internal.ts'

// A file of a bundle that is named by its fingerprint: `<name>.<12 hex>.<kind>`, a map of a module beside it left out.
const named = /\.([0-9a-f]{12})\.[a-z]+$/

/**
 * Whether the bytes of a file give the fingerprint its name holds: the fingerprint of its bytes, or of its text
 * with the line that names its map taken out, as a module is named before that line is written. The files of
 * the page code are the framework's own, named from the texts of all of them together, and are not held here.
 */
function givesItsName(name: string, bytes: Uint8Array): boolean {
  const [, stated] = named.exec(name) ?? []
  if (stated === undefined || name.startsWith('page.')) return true
  if (fingerprintOf(bytes).startsWith(stated)) return true
  const text = new TextDecoder().decode(bytes)
  const line = `//# sourceMappingURL=${name}.map`
  return [`\n${line}\n`, `\n${line}`, line].some((written) => {
    const plain = text.endsWith(written) ? text.slice(0, -written.length) : text.replace(line, '')
    return plain !== text && fingerprintOf(new TextEncoder().encode(plain)).startsWith(stated)
  })
}

/** The paths under a folder, with `/` between their names. */
const pathsIn = (folder: string): string[] =>
  readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((one) => one.isFile())
    .map((one) =>
      join(one.parentPath, one.name)
        .slice(folder.length + 1)
        .replaceAll('\\', '/'),
    )

/**
 * Takes the folder of a bundle and its description. Answers what makes it another version than its description
 * says: a file named by a fingerprint that its bytes do not give, or a module that the description names and the
 * folder lacks. Nothing where every module and asset is what its name and the description say.
 */
export function notAsNamed(folder: string, description: Description): string | undefined {
  const paths = pathsIn(folder)
  for (const path of paths) {
    if (path.endsWith('.map')) continue
    if (!givesItsName(path.slice(path.lastIndexOf('/') + 1), readFileSync(join(folder, path))))
      return `the bytes of ${path} are not those its name gives`
  }
  const modules: unknown = Reflect.get(Object(description.server), 'modules')
  for (const module of Array.isArray(modules) ? modules.map(String) : [])
    if (!paths.includes(module)) return `the module ${module} that the description names is not among the files`
  return undefined
}
