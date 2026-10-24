import type { Node } from '../../build/index.ts'
import { keyOf, kid, kids, lineOf, nameOf, propertyOf, walk } from '../../build/index.ts'

/** The place of the closing bracket that matches the opening one at a place of a text, or -1 where none does. */
export function closingOf(text: string, open: number): number {
  const pairs: Record<string, string> = { '{': '}', '(': ')', '[': ']' }
  const stack: string[] = []
  let quote: string | undefined
  for (let k = open; k < text.length; k++) {
    const letter = text[k] ?? ''
    if (quote) {
      if (letter === '\\') k += 1
      else if (letter === quote) quote = undefined
      continue
    }
    if (letter === "'" || letter === '"' || letter === '`') quote = letter
    else if (pairs[letter]) stack.push(pairs[letter] ?? '')
    else if (letter === stack.at(-1)) {
      stack.pop()
      if (!stack.length) return k
    }
  }
  return -1
}

/** A name as a pattern of a regular expression, taken as itself. */
export const asPattern = (name: string): string => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** One change of a text: the characters from `at` to before `end` take `text`. */
export interface Edit {
  at: number
  end: number
  text: string
}

// The members that are code wherever their word stands, and the words whose `run` is code where the description
// holds it as code. Every other place of a file is plain: what the description holds as it is written.
const codeMembers: Record<string, string[]> = {
  screen: ['view'],
  action: ['run'],
  project: ['identify', 'onRequest', 'build'],
}
const runWhereCode = new Set(['query', 'change', 'flow'])

/** The text of a node that is a text in quotes, or nothing for any other node. */
const quoted = (node: Node | undefined): string | undefined =>
  node?.type === 'Literal' && typeof node.value === 'string' ? node.value : undefined

/**
 * Takes the tree of a file, as the build's reader gives it, and the form the description holds of a definition by
 * its name. Answers the places of the file that are code, each from its first character to its last: the view of a
 * screen, the `run` of an action, `identify`, `onRequest` and `build` of the project, and the `run` of a query, a
 * change and a flow that the description holds as code.
 */
export function codeRanges(tree: Node, formOf: (name: string) => unknown): [number, number][] {
  const ranges: [number, number][] = []
  walk(tree, (node) => {
    if (node.type !== 'CallExpression') return
    const word = nameOf(kid(node, 'callee')) ?? ''
    const [first, options] = kids(node, 'arguments')
    const name = quoted(first)
    const members =
      codeMembers[word] ?? (runWhereCode.has(word) && name !== undefined && formOf(name) === 'code' ? ['run'] : [])
    for (const member of members) {
      const value = kid(propertyOf(options, member), 'value')
      if (value) ranges.push([value.start, value.end - 1])
    }
  })
  return ranges
}

// The nodes whose member is a name of its own, which a rename leaves: `a.name`, `{ name: ... }`, a member of a type.
const ownNames: Record<string, string> = {
  MemberExpression: 'property',
  TSQualifiedName: 'right',
  Property: 'key',
  PropertyDefinition: 'key',
  MethodDefinition: 'key',
  TSPropertySignature: 'key',
  TSMethodSignature: 'key',
}

/**
 * Takes the tree of a file, a name, and the name it takes. Answers the changes that rename every use of the name,
 * as JavaScript reads it: not a member read with a dot before it, nor a key of a record, which keep their own names,
 * nor a text in quotes or a comment, but for a text that names a table in `link`.
 */
export function wordEdits(tree: Node, from: string, to: string): Edit[] {
  const own = new Set<number>()
  const found = new Map<number, Edit>()
  walk(tree, (node) => {
    const member = ownNames[node.type]
    if (member && node.computed !== true && node.shorthand !== true) {
      const named = kid(node, member)
      if (named) own.add(named.start)
    }
    if (node.type === 'Identifier' && node.name === from && !own.has(node.start))
      found.set(node.start, { at: node.start, end: node.end, text: to })
    if (node.type === 'CallExpression' && nameOf(kid(node, 'callee')) === 'link') {
      const [first] = kids(node, 'arguments')
      if (first && quoted(first) === from) found.set(first.start, { at: first.start + 1, end: first.end - 1, text: to })
    }
  })
  return [...found.values()]
}

/**
 * Takes the tree of a file, the name of a table as the file names it, a column and the name it takes. Answers the
 * changes that rename the column as a key of the record that a write or a filter of that table is handed:
 * `orders.add({ buyer })`, `orders.change(id, { buyer })`, `orders.where({ buyer })`.
 */
export function keyEdits(tree: Node, table: string, from: string, to: string): Edit[] {
  const found: Edit[] = []
  walk(tree, (node) => {
    const callee = kid(node, 'callee')
    if (node.type !== 'CallExpression' || callee?.type !== 'MemberExpression' || callee.computed === true) return
    if (nameOf(kid(callee, 'object')) !== table) return
    if (!['add', 'change', 'where'].includes(nameOf(kid(callee, 'property')) ?? '')) return
    const record = kids(node, 'arguments').find((one) => one.type === 'ObjectExpression')
    for (const property of record ? kids(record, 'properties') : []) {
      const key = kid(property, 'key')
      if (property.type === 'Property' && key && keyOf(property) === from)
        found.push({ at: key.start, end: key.end, text: to })
    }
  })
  return found
}

/**
 * Takes the text of a file, its places in code, and the changes of a rename. Answers the text with every change
 * made outside code, and the lines of the changes in code, which are left as they stand: code is never rewritten
 * by a tool.
 */
export function renamedPlain(text: string, code: [number, number][], edits: Edit[]): { text: string; code: number[] } {
  const inCode = (edit: Edit): boolean => code.some(([from, to]) => edit.at >= from && edit.at <= to)
  const lines = new Set<number>()
  let out = text
  for (const edit of [...edits].sort((a, b) => b.at - a.at)) {
    if (inCode(edit)) lines.add(lineOf(text, edit.at))
    else out = `${out.slice(0, edit.at)}${edit.text}${out.slice(edit.end)}`
  }
  return { text: out, code: [...lines].sort((a, b) => a - b) }
}
