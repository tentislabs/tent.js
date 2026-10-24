import type { Node } from '../tree.ts'
import { child, kid, kids, nameOf, propertyOf, unwrap, walk, word } from '../tree.ts'

/** The words that make a definition, which a backend file imports from `tentjs`. */
export const definitionWords = new Set([
  'project',
  'table',
  'query',
  'change',
  'action',
  'flow',
  'service',
  'model',
  'agent',
  'python',
  'route',
  'incoming',
  'command',
  'backfill',
  'screen',
  'component',
])

/** The three imports of an app, each with the sort of file that imports it. */
export const sorts: Record<string, 'backend' | 'screen' | 'command'> = {
  tentjs: 'backend',
  'tentjs/ui': 'screen',
  'tentjs/cli': 'command',
}

/** One name that a file imports: the name it has in the file, the name it has where it comes from, and from where. */
interface ImportedName {
  local: string
  // `default` for the default of a file, and `*` for all of it under one name.
  name: string
  from: string
  node: Node
}

/** One definition as a file writes it: `export const name = <word>('name', { ... })`. */
export interface Declared {
  exportName: string
  word: string
  // The stated name, where it is written as a text.
  name?: string
  options?: Node
  // The declarator, and the whole statement that exports it.
  node: Node
  statement: Node
}

/** What is seen of one file without carrying anything out. */
export interface Scan {
  imports: ImportedName[]
  // Every file or package that the file names in an import or hands on in an export, types among them.
  named: { from: string; node: Node }[]
  sorts: ('backend' | 'screen' | 'command')[]
  declared: Declared[]
  // The default that the file exports, where it does.
  byDefault?: Node
  // A word that makes a definition, called where no top-level `export const` takes what it makes.
  loose: { word: string; node: Node }[]
  // What the file exports that no word made, by its name.
  helpers: { name: string; node: Node }[]
  // The events it declares, `export const name = event('name', { data })`, each with the name it states.
  events: Declared[]
}

/** The word that a call calls, where its callee is a name that the file imports from `tentjs` as a word that makes a definition. */
function wordOf(call: Node | undefined, words: Map<string, string>): string | undefined {
  if (call?.type !== 'CallExpression') return undefined
  return words.get(nameOf(child(call, 'callee')) ?? '')
}

/** Whether a call declares an event: it calls `event` of tentjs with options that state `data`. */
function declaresEvent(call: Node | undefined, eventWords: Set<string>): boolean {
  if (call?.type !== 'CallExpression' || !eventWords.has(nameOf(child(call, 'callee')) ?? '')) return false
  const [, options] = kids(call, 'arguments')
  return propertyOf(options, 'data') !== undefined
}

/** Takes the tree of a file. Answers what it imports, how it is sorted, the definitions it writes, and what it exports beside them. */
export function scanOf(tree: Node): Scan {
  const found: Scan = { imports: [], named: [], sorts: [], declared: [], loose: [], helpers: [], events: [] }
  const taken = new Set<Node>()
  for (const node of kids(tree, 'body')) {
    const from = word(kid(node, 'source'), 'value')
    if (from !== undefined && node.type !== 'ImportDeclaration' && node.exportKind !== 'type')
      found.named.push({ from, node })
    if (node.type !== 'ImportDeclaration' || from === undefined) continue
    found.named.push({ from, node })
    // An `import type` never counts: it is gone when the file runs.
    if (node.importKind === 'type') continue
    const names = kids(node, 'specifiers').filter((one) => one.importKind !== 'type')
    for (const one of names) {
      const local = nameOf(kid(one, 'local')) ?? ''
      const imported = kid(one, 'imported')
      const name =
        one.type === 'ImportDefaultSpecifier'
          ? 'default'
          : one.type === 'ImportNamespaceSpecifier'
            ? '*'
            : (nameOf(imported) ?? String(imported?.value))
      found.imports.push({ local, name, from, node: one })
    }
    const sort = Object.hasOwn(sorts, from) ? sorts[from] : undefined
    // An import that names nothing still runs its file, so it counts where it is no import of types alone.
    if (sort && (names.length || !kids(node, 'specifiers').length) && !found.sorts.includes(sort))
      found.sorts.push(sort)
  }
  const words = new Map(
    found.imports
      .filter((one) => Object.hasOwn(sorts, one.from) && definitionWords.has(one.name))
      .map((one) => [one.local, one.name] as const),
  )
  // The local names of `event` of tentjs, by which a file declares an event.
  const eventWords = new Set(
    found.imports.filter((one) => one.from === 'tentjs' && one.name === 'event').map((one) => one.local),
  )
  for (const node of kids(tree, 'body')) {
    const declaration = kid(node, 'declaration')
    if (node.type === 'ExportDefaultDeclaration') found.byDefault = declaration
    else if (node.type === 'ExportAllDeclaration' && node.exportKind !== 'type') found.helpers.push({ name: '*', node })
    else if (node.type === 'ExportNamedDeclaration' && node.exportKind !== 'type') {
      for (const one of kids(node, 'specifiers'))
        if (one.exportKind !== 'type')
          found.helpers.push({ name: nameOf(kid(one, 'exported')) ?? String(kid(one, 'exported')?.value), node: one })
      if (declaration?.type === 'VariableDeclaration') {
        for (const one of kids(declaration, 'declarations')) {
          const exportName = nameOf(kid(one, 'id'))
          const init = kid(one, 'init')
          const call = init ? unwrap(init) : undefined
          const made = wordOf(call, words)
          const declares = declaresEvent(call, eventWords)
          if (exportName === undefined) found.helpers.push({ name: '{ ... }', node: one })
          else if (declares && call && declaration.kind === 'const') {
            const [first, options] = kids(call, 'arguments')
            const name = first?.type === 'Literal' && typeof first.value === 'string' ? first.value : undefined
            found.events.push({
              exportName,
              word: 'event',
              ...(name !== undefined ? { name } : {}),
              options,
              node: one,
              statement: node,
            })
          } else if (!call || made === undefined || declaration.kind !== 'const') {
            if (made !== undefined && call) continue
            found.helpers.push({ name: exportName, node: one })
          } else {
            const [first, options] = kids(call, 'arguments')
            const name = first?.type === 'Literal' && typeof first.value === 'string' ? first.value : undefined
            taken.add(call)
            found.declared.push({
              exportName,
              word: made,
              ...(name !== undefined ? { name } : {}),
              options,
              node: one,
              statement: node,
            })
          }
        }
      } else if (declaration && !declaration.type.startsWith('TS')) {
        const name = nameOf(kid(declaration, 'id'))
        if (declaration.declare !== true) found.helpers.push({ name: name ?? declaration.type, node: declaration })
      }
    }
  }
  walk(tree, (node) => {
    const made = wordOf(node, words)
    if (made !== undefined && !taken.has(node)) found.loose.push({ word: made, node })
    return undefined
  })
  return found
}
