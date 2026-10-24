import { parseModule } from './borrowed/vite.ts'
import { kid, kids, nameOf } from './tree.ts'
import { isStored } from '../core/internal.ts'

/** One export that a module owes beside its definitions: the code of a rule or of an option, under the name that the description gives it. */
export interface Owed {
  name: string
  // The export of the definition that holds the code, and the way to it from the options of that definition:
  // none where the definition states no option that the stored code stands for.
  from: string
  way?: string[]
}

/**
 * Takes the stored record of a definition, the name its module exports it under, and its options as they were
 * written. Answers an export for everything inside the record that is stored as code: the arrow of a rule, and an
 * option that is code wherever it stands. The record itself, which is the export of the definition, is none.
 */
export function owedOf(record: unknown, from: string, options: unknown, way: string[] = []): Owed[] {
  if (!isStored(record) || !isStored(options)) return []
  const found: Owed[] = []
  for (const [name, stored] of Object.entries(record)) {
    if (!isStored(stored)) continue
    // A record that the description adds around options, as `agent` around those of an agent, is no
    // option itself: what it holds was written beside it.
    if (!Object.hasOwn(options, name)) {
      if (typeof stored.export === 'string') found.push({ name: stored.export, from })
      found.push(...owedOf(stored, from, options, way))
      continue
    }
    const written = options[name]
    // The arrow of a rule stands in the record that `where` or `allow` made of it, as its `code`.
    const arrow = isStored(written) && typeof written.code === 'function' ? ['code'] : []
    if (typeof stored.export === 'string') found.push({ name: stored.export, from, way: [...way, name, ...arrow] })
    found.push(...owedOf(stored, from, written, [...way, name]))
  }
  return found
}

/** How a module holds what it exports: under a name inside itself, or straight out of another module, under a name of that one. */
type Held = { local: string } | { imported: string; source: string }

/** How a module holds each thing that it exports, by the name it exports it under. */
function heldOf(text: string): Map<string, Held> {
  const held = new Map<string, Held>()
  for (const statement of kids(parseModule(text), 'body')) {
    if (statement.type !== 'ExportNamedDeclaration') continue
    // Two files that import each other are made one module by the builder, and the other gives its export on.
    const source = kid(statement, 'source')?.value
    for (const one of kids(statement, 'specifiers')) {
      const [local, exported] = [nameOf(kid(one, 'local')), nameOf(kid(one, 'exported'))]
      if (local === undefined || exported === undefined) continue
      held.set(exported, typeof source === 'string' ? { imported: local, source } : { local })
    }
    const declared = kid(statement, 'declaration')
    for (const one of declared ? kids(declared, 'declarations') : []) {
      const name = nameOf(kid(one, 'id'))
      if (name !== undefined) held.set(name, { local: name })
    }
  }
  return held
}

/**
 * Takes the text of a module that the builder made, and the exports that it owes. Answers the text with each of
 * them added after the code and before the line that names its map, so that the map still fits. Answers with it,
 * as lost, each that it could not add: one whose definition the module does not export, and one with no way.
 */
export function withOwed(text: string, owed: Owed[]): { text: string; lost: Owed[] } {
  if (!owed.length) return { text, lost: [] }
  const held = heldOf(text)
  // A name that the text does not hold stands for nothing in the module yet.
  let stem = 'tent_owed'
  while (text.includes(stem)) stem += '_'
  const lines: string[] = []
  const given: string[] = []
  const lost: Owed[] = []
  const names = new Map<string, string>()
  for (const [k, one] of owed.entries()) {
    const from = held.get(one.from)
    if (!from || !one.way) {
      lost.push(one)
      continue
    }
    let name = 'local' in from ? from.local : names.get(one.from)
    if (name === undefined && 'imported' in from) {
      name = `${stem}_${one.from}`
      names.set(one.from, name)
      lines.push(`import { ${from.imported} as ${name} } from ${JSON.stringify(from.source)};`)
    }
    lines.push(`var ${stem}${k} = ${name}.options${one.way.map((part) => `[${JSON.stringify(part)}]`).join('')};`)
    given.push(`${stem}${k} as ${one.name}`)
  }
  if (!given.length) return { text, lost }
  lines.push(`export { ${given.join(', ')} };`)
  const map = text.lastIndexOf('\n//# sourceMappingURL=')
  const [code, rest] = map < 0 ? [text, ''] : [text.slice(0, map), text.slice(map)]
  return { text: `${code}${code.endsWith('\n') ? '' : '\n'}${lines.join('\n')}${rest || '\n'}`, lost }
}
