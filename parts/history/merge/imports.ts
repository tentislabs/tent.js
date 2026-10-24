import type { Description } from '../../core/internal.ts'
import { fileSource } from '../../core/internal.ts'

/** The names of an import line between its curly brackets, and where they come from, or nothing for another line. */
function importOf(line: string): { names: string[]; from: string } | undefined {
  const found = /^import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/.exec(line.trim())
  if (!found) return undefined
  const names = found[1]
    .split(',')
    .map((one) => one.split(/\s+as\s+/)[0].trim())
    .filter(Boolean)
  return { names, from: found[2] }
}

/**
 * Takes the merged text of a file, its path, and each definition that was written anew in it with the
 * description it was written from. Adds one import line after the last import line of the file for each place a
 * written definition needs names from that the file does not import from there, and changes no line that stands.
 */
export function addImports(text: string, path: string, written: { name: string; description: Description }[]): string {
  const end = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(end)
  const has = new Map<string, Set<string>>()
  let last = -1
  for (const [k, line] of lines.entries()) {
    if (!line.startsWith('import ')) continue
    last = k
    const found = importOf(line)
    if (found) has.set(found.from, new Set([...(has.get(found.from) ?? []), ...found.names]))
  }
  const missing = new Map<string, string[]>()
  for (const one of written) {
    const source = fileSource(one.description, [one.name], { path })
    for (const line of source.split('\n')) {
      const found = importOf(line)
      if (!found) continue
      for (const name of found.names) {
        const there = missing.get(found.from) ?? []
        if (!has.get(found.from)?.has(name) && !there.includes(name)) missing.set(found.from, [...there, name])
      }
    }
  }
  if (!missing.size) return text
  const added = [...missing].map(([from, names]) => `import { ${names.join(', ')} } from '${from}'`)
  lines.splice(last + 1, 0, ...added)
  return lines.join(end)
}
