/** One node of the tree that the builder's reader of source gives: its kind, its place in the text, and its members. */
export interface Node {
  readonly type: string
  readonly start: number
  readonly end: number
  readonly [member: string]: unknown
}

/** Whether a value is a node of the tree. */
const isNode = (value: unknown): value is Node =>
  typeof value === 'object' && value !== null && typeof Reflect.get(value, 'type') === 'string'

/** The node that stands under a member of a node, or nothing where none does. */
export const kid = (node: Node | undefined, member: string): Node | undefined => {
  const found = node?.[member]
  return isNode(found) ? found : undefined
}

/** The node that stands under a member of a node. Throws where none does: the tree has another form than the reader gives. */
export function child(node: Node, member: string): Node {
  const found = kid(node, member)
  if (!found) throw new Error(`a ${node.type} of the tree holds no ${member}`)
  return found
}

/** The nodes of a member that is a list. A gap of a list, which holds nothing, is left out. */
export const kids = (node: Node, member: string): Node[] => {
  const found = node?.[member]
  return Array.isArray(found) ? found.filter(isNode) : []
}

/** The text of a member, or nothing where it holds none. */
export const word = (node: Node | undefined, member: string): string | undefined => {
  const found = node?.[member]
  return typeof found === 'string' ? found : undefined
}

/** The name of a node that is one name, or nothing for any other node. */
export const nameOf = (node: Node | undefined): string | undefined =>
  node?.type === 'Identifier' ? word(node, 'name') : undefined

/** The key of a property that is written as a name or as a text. */
export function keyOf(property: Node): string | undefined {
  const key = kid(property, 'key')
  if (property.computed === true || !key) return undefined
  if (key.type === 'Identifier') return word(key, 'name')
  return key.type === 'Literal' && (typeof key.value === 'string' || typeof key.value === 'number')
    ? String(key.value)
    : undefined
}

const marks = new Set([
  'ParenthesizedExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
])

/** The value under brackets and under the marks that only the type checker reads. */
export function unwrap(node: Node): Node {
  let at = node
  while (marks.has(at.type)) at = child(at, 'expression')
  return at
}

/** The line of a place in a text, counted from 1. */
export const lineOf = (text: string, at: number): number => text.slice(0, at).split('\n').length

/** The property of an object that is written under a key, or nothing where the object writes none. */
export function propertyOf(object: Node | undefined, key: string): Node | undefined {
  if (object?.type !== 'ObjectExpression') return undefined
  return kids(object, 'properties').find((one) => one.type === 'Property' && keyOf(one) === key)
}

// The nodes under each node, worked out once: a tree is never changed, and the rules of the check walk it often.
const belowKept = new WeakMap<Node, readonly Node[]>()

/** The nodes that stand under a node, in the order of the text. */
export function below(node: Node): readonly Node[] {
  const held = belowKept.get(node)
  if (held) return held
  const found = nodesBelow(node)
  belowKept.set(node, found)
  return found
}

/** The nodes that stand under a node, as its members hold them, in the order of the text. */
function nodesBelow(node: Node): Node[] {
  const found: Node[] = []
  for (const [member, value] of Object.entries(node)) {
    if (member === 'type') continue
    if (isNode(value)) found.push(value)
    else if (Array.isArray(value)) for (const one of value) if (isNode(one)) found.push(one)
  }
  return found.sort((a, b) => a.start - b.start)
}

/** The text of one written piece of a text in backticks, with its escapes worked out. */
export function cooked(piece: Node | undefined): string {
  const value = piece?.value
  const text: unknown = typeof value === 'object' && value !== null ? Reflect.get(value, 'cooked') : undefined
  return typeof text === 'string' ? text : ''
}

/** Calls `see` for a node and for every node under it, in the order of the text. */
export function walk(node: Node, see: (node: Node) => void): void {
  see(node)
  for (const one of below(node)) walk(one, see)
}
