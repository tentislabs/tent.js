import type { Node, Source } from '../build/index.ts'
import { below, child, keyOf, kid, kids, scan, unwrap, word } from '../build/index.ts'
import type { Written } from './rule.ts'
import { writtenIn } from './rule.ts'
import { statedAt } from './stated.ts'

/** A value that a view writes in place, or nothing known where it is worked out while running. */
export type Literal = { known: true; value: unknown } | { known: false }

/** One property of a tag: where it is written, what stands as its value, and that value where it is written in place. */
interface Prop {
  node: Node
  value?: Node
  literal: Literal
}

/**
 * One tag of a view: its definition, its name as written, what of `tentjs/ui` it is, its properties, and the tags
 * around it.
 */
export interface Tag {
  written: Written
  node: Node
  name: string
  taken?: string
  props: Map<string, Prop>
  around: Tag[]
}

const unknown: Literal = { known: false }

/** Reads a value that is written in place: a text, a number, true, false, nothing, and lists and records of them. */
export function literalOf(written: Node | undefined): Literal {
  // A property with no value is true.
  if (!written) return { known: true, value: true }
  const node = unwrap(written.type === 'JSXExpressionContainer' ? child(written, 'expression') : written)
  if (node.type === 'Literal') {
    const value = node.value
    return value === null || ['string', 'number', 'boolean'].includes(typeof value) ? { known: true, value } : unknown
  }
  if (node.type === 'TemplateLiteral' && !kids(node, 'expressions').length) {
    const cooked: unknown = Reflect.get(Object(kids(node, 'quasis')[0]?.value), 'cooked')
    return typeof cooked === 'string' ? { known: true, value: cooked } : unknown
  }
  if (node.type === 'UnaryExpression' && node.operator === '-') {
    const inner = literalOf(kid(node, 'argument'))
    return inner.known && typeof inner.value === 'number' ? { known: true, value: -inner.value } : unknown
  }
  if (node.type === 'ArrayExpression') {
    const entries = Array.isArray(node.elements) ? node.elements : []
    const read = kids(node, 'elements').map((one) => literalOf(one))
    if (read.length !== entries.length || read.some((one) => !one.known)) return unknown
    return { known: true, value: read.map((one) => (one.known ? one.value : undefined)) }
  }
  if (node.type === 'ObjectExpression') {
    const value: Record<string, unknown> = {}
    for (const one of kids(node, 'properties')) {
      const key = one.type === 'Property' ? keyOf(one) : undefined
      const read = key === undefined ? unknown : literalOf(kid(one, 'value'))
      if (key === undefined || !read.known) return unknown
      value[key] = read.value
    }
    return { known: true, value }
  }
  return unknown
}

/** The keys of a record that is written in place, each with its value, or nothing where it is no such record. */
export function entriesOf(written: Node | undefined): [string, Node][] | undefined {
  if (!written) return undefined
  const node = unwrap(written.type === 'JSXExpressionContainer' ? child(written, 'expression') : written)
  if (node.type !== 'ObjectExpression') return undefined
  const found: [string, Node][] = []
  for (const one of kids(node, 'properties')) {
    const key = one.type === 'Property' ? keyOf(one) : undefined
    const value = kid(one, 'value')
    if (key === undefined || !value) return undefined
    found.push([key, value])
  }
  return found
}

/** The names that a file takes from `tentjs/ui`, each by the name the file gives it. */
function uiNames(tree: Node): Map<string, string> {
  return new Map(
    scan(tree)
      .imports.filter((one) => one.from === 'tentjs/ui')
      .map((one) => [one.local, one.name] as const),
  )
}

/** Whether a definition is a screen or a component. */
export const isView = (written: Written): boolean => written.word === 'screen' || written.word === 'component'

function visit(node: Node, written: Written, ui: Map<string, string>, around: Tag[], into: Tag[]): void {
  if (node.type !== 'JSXElement') {
    for (const one of below(node)) visit(one, written, ui, around, into)
    return
  }
  const opening = child(node, 'openingElement')
  const named = child(opening, 'name')
  const name = named.type === 'JSXIdentifier' ? (word(named, 'name') ?? '') : ''
  const taken = ui.get(name)
  const props = new Map<string, Prop>()
  for (const one of kids(opening, 'attributes')) {
    const key = one.type === 'JSXAttribute' ? kid(one, 'name') : undefined
    const prop = key?.type === 'JSXIdentifier' ? word(key, 'name') : undefined
    if (prop === undefined) continue
    const value = kid(one, 'value')
    props.set(prop, { node: one, literal: literalOf(value), ...(value ? { value } : {}) })
  }
  const tag: Tag = {
    written,
    node,
    name,
    props,
    around,
    ...(taken !== undefined ? { taken } : {}),
  }
  into.push(tag)
  for (const one of below(node)) visit(one, written, ui, [...around, tag], into)
}

const seen = new WeakMap<Source, Tag[]>()

/** Every tag that the view of a screen or of a component of a project writes, in the order of the files and of the text. */
export function tagsOf(source: Source): Tag[] {
  const held = seen.get(source)
  if (held) return held
  const found: Tag[] = []
  for (const written of writtenIn(source).filter(isView)) {
    const tree = source[written.path].tree
    const view = statedAt(written, ['view'])
    if (tree && view) visit(view, written, uiNames(tree), [], found)
  }
  seen.set(source, found)
  return found
}
