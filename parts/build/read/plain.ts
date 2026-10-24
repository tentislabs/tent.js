import * as words from '../../core/index.ts'
import { isInherited, ownMember } from '../../core/internal.ts'
import type { Node } from '../tree.ts'
import { child, cooked, keyOf, kid, kids, nameOf, unwrap, word } from '../tree.ts'
import type { Scan } from './scan.ts'
import { definitionWords } from './scan.ts'

/** A thing that the plain reader does not take, with the node it stands at. */
interface NotTaken {
  thing: string
  node: Node
}

/** What the plain reader made of one file. */
export interface PlainFile {
  // What each definition of the file is, by the name of its `const`: what its word returned for what was read.
  made: Map<string, unknown>
  // What the file exports as its default, where the reader took it.
  byDefault?: unknown
  // Each thing the reader does not take. A file with none of them is read, and never run.
  notTaken: NotTaken[]
  // What a word threw while a definition was made, with the node of that definition.
  failed: { error: unknown; node: Node }[]
  // The definitions, by the name of their `const`, that were made with nothing in the place of a value that was
  // not taken. What is found wrong with such a one may be that alone.
  holed: Set<string>
}

/** What the reader asks of whoever holds the files of the project. */
export interface Around {
  // What a name that is imported from another file of the project holds, or a thing that the reader does not take.
  imported(from: string, name: string): { value: unknown } | { thing: string } | undefined
  // The text of a text file that the file imports, or nothing for any other import.
  textFile(from: string): string | undefined
  // For an arrow that is written where a word takes one: nothing where it was read, and else what made it code.
  arrow(node: Node): { thing: string; node: Node } | undefined | 'unknown'
}

const exported: Record<string, unknown> = { ...words }

// Stands where a word is handed an arrow that was read: the word records it, and nothing ever calls it.
const readArrow = (): never => {
  throw new Error('an arrow that was read is carried out from its stored form, and never called')
}

const plainValue = (node: Node): boolean => {
  const n = unwrap(node)
  if (n.type === 'Literal') return n.regex === undefined && n.bigint === undefined
  if (n.type === 'TemplateLiteral') return !kids(n, 'expressions').length
  if (n.type === 'UnaryExpression' && n.operator === '-') return unwrap(child(n, 'argument')).type === 'Literal'
  if (n.type === 'ArrayExpression')
    return kids(n, 'elements').every((one) => one.type !== 'SpreadElement' && plainValue(one))
  return (
    n.type === 'ObjectExpression' &&
    kids(n, 'properties').every(
      (one) =>
        one.type === 'Property' &&
        keyOf(one) !== undefined &&
        one.shorthand !== true &&
        plainValue(child(one, 'value')),
    )
  )
}

/**
 * Takes the tree of a file, what was seen of it, and what stands around it. Reads the file as text: each
 * definition is made by calling its word with the values that were read, and nothing of the file is run. Answers
 * the definitions, and each thing that the reader does not take.
 */
export function readPlain(tree: Node, seen: Scan, around: Around): PlainFile {
  const read: PlainFile = { made: new Map(), notTaken: [], failed: [], holed: new Set() }
  const names = new Map<string, unknown>()
  // What a word of ours made or gave, which alone may be read into and called.
  const ours = new WeakSet<object>()
  const own = (value: unknown): unknown => {
    if ((typeof value === 'object' || typeof value === 'function') && value !== null) ours.add(value)
    return value
  }
  const not = (thing: string, node: Node): undefined => {
    read.notTaken.push({ thing, node })
    return undefined
  }

  for (const one of seen.imports) {
    const text = around.textFile(one.from)
    if (one.from === 'tentjs') {
      if (Object.hasOwn(exported, one.name)) names.set(one.local, own(exported[one.name]))
    } else if (text !== undefined && one.name === 'default') names.set(one.local, text)
    else if (one.from.startsWith('.')) {
      const found = around.imported(one.from, one.name)
      if (found && 'value' in found) names.set(one.local, own(found.value))
      else if (found) not(found.thing, one.node)
    } else not(`an import from \`${one.from}\`, which is no file of the project`, one.node)
  }

  const list = (node: Node): unknown[] => {
    const entries = kids(node, node.type === 'ArrayExpression' ? 'elements' : 'arguments')
    const written = node[node.type === 'ArrayExpression' ? 'elements' : 'arguments']
    if (Array.isArray(written) && written.length !== entries.length) not('a list with a gap', node)
    return entries.map((entry) => (entry.type === 'SpreadElement' ? not('a spread', entry) : value(entry)))
  }

  const record = (node: Node): Record<string, unknown> => {
    const made: Record<string, unknown> = {}
    for (const property of kids(node, 'properties')) {
      const key = property.type === 'Property' ? keyOf(property) : undefined
      if (property.type !== 'Property') not('a spread', property)
      else if (key === undefined) not('a key that is worked out', property)
      else if (property.method === true || property.kind !== 'init')
        not('a function other than an arrow of a `run` or of a rule', property)
      else made[key] = value(child(property, 'value'))
    }
    return made
  }

  const arrow = (node: Node): unknown => {
    const found = around.arrow(node)
    if (found === 'unknown') not('a function other than an arrow of a `run` or of a rule', node)
    else if (found) not(found.thing, found.node)
    return readArrow
  }

  const member = (node: Node): { from: unknown; value: unknown } => {
    const from = value(child(node, 'object'))
    const name = node.computed === true ? undefined : word(kid(node, 'property'), 'name')
    const isOurs = (typeof from === 'object' || typeof from === 'function') && from !== null && ours.has(from)
    if (name === undefined) return { from, value: not('a place that is worked out', node) }
    if (from === undefined) return { from, value: undefined }
    if (!isOurs) return { from, value: not(`a read of \`.${name}\` into a value that no word of ours made`, node) }
    if (Reflect.get(from, 'kind') === 'project')
      return { from, value: not('a read of the project among the options of a definition', node) }
    // The handle of the settings answers the record of a setting for any name, and holds no member of its own.
    if (from === exported.settings) return { from, value: own(Reflect.get(from, name)) }
    const found = ownMember(from, name)
    if (!found && isInherited(from, name))
      return { from, value: not(`a read of \`.${name}\`, which a value only inherits from the runtime`, node) }
    return { from, value: own(found?.value) }
  }

  const value = (written: Node): unknown => {
    const node = unwrap(written)
    switch (node.type) {
      case 'Literal':
        return node.regex === undefined && node.bigint === undefined ? node.value : not('a regular expression', node)
      case 'TemplateLiteral':
        return kids(node, 'expressions').length
          ? not('a text with values, which is worked out', node)
          : cooked(kids(node, 'quasis')[0])
      case 'ArrayExpression':
        return list(node)
      case 'ObjectExpression':
        return record(node)
      case 'UnaryExpression': {
        const inner = value(child(node, 'argument'))
        return node.operator === '-' && typeof inner === 'number' ? -inner : not('a value that is worked out', node)
      }
      case 'Identifier': {
        const name = nameOf(node) ?? ''
        if (name === 'undefined') return undefined
        return names.has(name)
          ? names.get(name)
          : not(`a read of \`${name}\`, a name that the file does not hold as a plain value`, node)
      }
      case 'MemberExpression':
        return member(node).value
      case 'CallExpression': {
        const callee = unwrap(child(node, 'callee'))
        const target = callee.type === 'MemberExpression' ? member(callee) : { from: undefined, value: value(callee) }
        const args = list(node)
        if (target.value === undefined) return undefined
        if (typeof target.value !== 'function' || !ours.has(target.value))
          return not('a call of what is no word of ours', node)
        if (callee.type !== 'MemberExpression' && definitionWords.has(nameOf(callee) ?? ''))
          return not('a definition that is made inside another', node)
        return own(Reflect.apply(target.value, target.from, args))
      }
      case 'ArrowFunctionExpression':
      case 'FunctionExpression':
        return arrow(node)
      default:
        return not(node.type === 'NewExpression' ? '`new`' : `a value that is worked out (${node.type})`, node)
    }
  }

  const declared = new Map(seen.declared.map((one) => [one.node, one]))
  const making = (node: Node, name: string | undefined, work: () => void): void => {
    const before = read.notTaken.length
    try {
      work()
    } catch (error) {
      // A word that was handed nothing in the place of a value that was not taken may refuse that alone: the
      // value that was not taken is what is told, and it is told on its own line.
      if (read.notTaken.length === before) read.failed.push({ error, node })
    }
    if (name !== undefined && read.notTaken.length > before) read.holed.add(name)
  }
  for (const node of kids(tree, 'body')) {
    const declaration = node.type === 'ExportNamedDeclaration' ? kid(node, 'declaration') : undefined
    if (node.type === 'ImportDeclaration' || node.type.startsWith('TS') || node.type === 'EmptyStatement') continue
    if (node.type === 'ExportNamedDeclaration' && (node.exportKind === 'type' || declaration?.type.startsWith('TS')))
      continue
    if (node.type === 'ExportDefaultDeclaration') {
      const handed = child(node, 'declaration')
      making(handed, undefined, () => {
        read.byDefault = value(handed)
      })
    } else if (declaration?.type === 'VariableDeclaration') {
      for (const one of kids(declaration, 'declarations')) {
        const found = declared.get(one)
        const call = unwrap(kid(one, 'init') ?? one)
        if (!found) not('an export that is no definition', one)
        else
          making(one, found.exportName, () => {
            const word = exported[found.word]
            const made = own(Reflect.apply(Object(word), undefined, list(call)))
            names.set(found.exportName, made)
            read.made.set(found.exportName, made)
          })
      }
    } else if (node.type === 'VariableDeclaration') {
      for (const one of kids(node, 'declarations')) {
        const name = nameOf(kid(one, 'id'))
        const init = kid(one, 'init')
        if (node.kind !== 'const' || name === undefined || !init)
          not('a top-level name that is no `const` of a plain value', one)
        else if (!plainValue(init)) not(`a \`const\` whose value is worked out, \`${name}\``, one)
        else names.set(name, value(init))
      }
    } else not(`another statement than an import, a definition and a \`const\` (${node.type})`, node)
  }
  return read
}
