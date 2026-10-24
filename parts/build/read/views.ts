import type { Node } from '../tree.ts'
import { child, keyOf, kid, kids, lineOf, nameOf, propertyOf, unwrap, walk, word } from '../tree.ts'
import type { FileReach, Why } from './arrows.ts'
import { neededBy } from './needs.ts'
import { opensBy } from './opens.ts'
import type { Known, Reach } from './reach.ts'
import { NotPlain } from './reach.ts'
import type { Declared } from './scan.ts'
import { ownNames } from './statement.ts'
import { value } from './value.ts'

/** What was read of the arrows of one screen or one component. */
export interface ViewsRead {
  // What was read, as `describe` is handed it: `data`, `title`, `seo.description`, `seo.image`, `seo.data`, and
  // of its view `uses`, the components the build sees it draw, `needs`, the parts of the page code it needs, and
  // `opens`, what its hooks need of the headers of the page.
  views: Record<string, object>
  // The first arrow that was not read, with what made it code.
  why?: Why
  // Each arrow that was tried, with its option, and for one that was not read what made it code and where.
  arrows: Map<Node, { option: string; thing?: string; at?: Node }>
}

const isArrow = (node: Node | undefined): node is Node =>
  node?.type === 'ArrowFunctionExpression' || node?.type === 'FunctionExpression'

/** The names that an arrow of a screen takes what it is handed apart into. */
function handedTo(arrow: Node, what: string): string[] {
  if (arrow.type !== 'ArrowFunctionExpression') throw new NotPlain('a function other than an arrow', arrow)
  if (arrow.async === true) throw new NotPlain(`${what} that is \`async\``, arrow)
  const [first, second] = kids(arrow, 'params')
  if (!first) return []
  if (second) throw new NotPlain(`${what} that takes more than what it is handed`, second)
  if (nameOf(first) !== undefined) throw new NotPlain(`${what} that takes what it is handed as one name`, first)
  const names = ownNames(first)
  if (!names) throw new NotPlain(`${what} whose parameter is taken apart under other names`, first)
  return names
}

/** The names in reach of an arrow of a screen file that is handed these names. */
const reachOf = (file: FileReach, handed: string[]): Reach => ({
  ...file,
  handed: new Set(handed),
  scopes: [],
  screen: true,
})

/** The definition that a name of the file stands for, its own or an imported one. */
function knownAs(file: FileReach, name: string): Known | undefined {
  const imported = file.imports.get(name)
  return file.own.get(name) ?? (imported && 'app' in imported ? imported.app : undefined)
}

/** What an entry of `data` reads: a definition that the file names, or a member of one, as `helper.working`. */
function readOf(node: Node, reach: Reach): string {
  const n = unwrap(node)
  const from = n.type === 'MemberExpression' && n.computed !== true ? unwrap(child(n, 'object')) : n
  const name = nameOf(from) ?? ''
  const known = reach.handed.has(name) ? undefined : knownAs(reach, name)
  if (!known) throw new NotPlain('a `read` of what is no definition that the file names', n)
  return from === n ? known.definition : `${known.definition}.${word(kid(n, 'property'), 'name') ?? ''}`
}

/** The entries of an object that was written in place, each a key and its node, in the order they were written. */
function entriesOf(node: Node): [string, Node][] {
  const entries: [string, Node][] = []
  for (const property of kids(node, 'properties')) {
    if (property.type !== 'Property') throw new NotPlain('a spread', property)
    const key = keyOf(property)
    if (property.computed === true || key === undefined) throw new NotPlain('a key that is worked out', property)
    if (property.method === true || property.kind !== 'init')
      throw new NotPlain('a function other than an arrow', property)
    if (entries.some((entry) => entry[0] === key))
      throw new NotPlain(`an object that writes the key "${key}" twice`, property)
    entries.push([key, child(property, 'value')])
  }
  return entries
}

/** A record of plain values that is written in place: how an entry of `data` is asked. */
function plainRecord(node: Node): Record<string, unknown> {
  const made: Record<string, unknown> = {}
  for (const [key, written] of entriesOf(node)) {
    const one = unwrap(written)
    if (one.type !== 'Literal' || one.regex !== undefined || one.bigint !== undefined)
      throw new NotPlain(`\`${key}\` of a \`read\` that is no value written in place`, one)
    made[key] = one.value
  }
  return made
}

/** One entry of `data`, as `read` answers it, with each value of its input in its stored form. */
function entryOf(written: Node, reach: Reach): object {
  const call = unwrap(written)
  const callee =
    call.type === 'CallExpression' ? reach.imports.get(nameOf(unwrap(child(call, 'callee'))) ?? '') : undefined
  if (!callee || !('ours' in callee) || callee.ours !== 'read')
    throw new NotPlain('an entry of `data` that is no `read(...)`', call)
  const [what, input, how, more] = kids(call, 'arguments')
  if (!what || more || [what, input, how].some((one) => one?.type === 'SpreadElement'))
    throw new NotPlain('a `read` that is not handed what it reads, its input and how it is asked', call)
  const entry: Record<string, unknown> = { read: readOf(what, reach) }
  const given = input ? unwrap(input) : undefined
  if (given && nameOf(given) !== 'undefined') {
    if (given.type !== 'ObjectExpression')
      throw new NotPlain('an input of `read` that is no record written in place', given)
    entry.input = Object.fromEntries(entriesOf(given).map(([key, one]) => [key, value(one, reach)]))
  }
  const asked = how ? unwrap(how) : undefined
  if (asked && asked.type !== 'ObjectExpression')
    throw new NotPlain('the options of a `read` that are no record written in place', asked)
  return { ...entry, ...(asked ? plainRecord(asked) : {}) }
}

/** The entries of a `data` that is written as an arrow, each by its name. */
function dataOf(arrow: Node, file: FileReach): object {
  const reach = reachOf(file, handedTo(arrow, 'a `data`'))
  const body = child(arrow, 'body')
  if (body.type === 'BlockStatement') throw new NotPlain('a statement, in a `data`', kids(body, 'body')[0] ?? body)
  const record = unwrap(body)
  if (record.type !== 'ObjectExpression')
    throw new NotPlain('a `data` whose arrow gives no record of `read(...)`', record)
  return Object.fromEntries(entriesOf(record).map(([name, written]) => [name, entryOf(written, reach)]))
}

/** The one value that an arrow of `title` or of a search-engine field gives, read by the reader of values. */
function oneValue(arrow: Node, file: FileReach, option: string): object {
  const reach = reachOf(file, handedTo(arrow, `the arrow of \`${option}\``))
  const body = child(arrow, 'body')
  if (body.type === 'BlockStatement')
    throw new NotPlain(`a statement, in the arrow of \`${option}\``, kids(body, 'body')[0] ?? body)
  const stored = value(body, reach)
  // What the build hands on of an arrow is a record: a text that is written in place is stored as a text with no value.
  if (typeof stored === 'string') return { text: [stored] }
  if (typeof stored !== 'object' || stored === null)
    throw new NotPlain(`an arrow of \`${option}\` that gives a value written in place, which stands there itself`, body)
  return stored
}

/** The components that an arrow draws as tags, by their names: what the build sees of a view. */
function drawnIn(arrow: Node, file: FileReach): string[] {
  const found = new Set<string>()
  walk(arrow, (node) => {
    const tag = node.type === 'JSXOpeningElement' ? kid(node, 'name') : undefined
    const known = tag?.type === 'JSXIdentifier' ? knownAs(file, word(tag, 'name') ?? '') : undefined
    if (known?.kind === 'component') found.add(known.definition)
  })
  return [...found].sort()
}

/** The function that a file declares at its top under a name, as a view may name it, or nothing. */
function topFunction(tree: Node | undefined, name: string): Node | undefined {
  for (const node of tree ? kids(tree, 'body') : []) {
    const declaration = node.type === 'ExportNamedDeclaration' ? (kid(node, 'declaration') ?? node) : node
    if (declaration.type === 'FunctionDeclaration' && nameOf(kid(declaration, 'id')) === name) return declaration
    if (declaration.type !== 'VariableDeclaration') continue
    for (const one of kids(declaration, 'declarations')) {
      const init = kid(one, 'init')
      if (nameOf(kid(one, 'id')) === name && init && isArrow(unwrap(init))) return unwrap(init)
    }
  }
  return undefined
}

/**
 * Takes a screen or a component as its file writes it, what the file gives its arrows, the text of the file, and
 * its tree. Answers the components its view draws and the parts of the page code it needs, what was read of a
 * `data` that is an arrow and of the arrows of `title` and of the search-engine fields, each in its stored form,
 * and for each that was not read what made it code. A view that names a function of its file draws what that
 * function draws, and every view needs what its file imports.
 */
export function readViews(declared: Declared, file: FileReach, text: string, tree?: Node): ViewsRead {
  const read: ViewsRead = { views: {}, arrows: new Map() }
  const tried = (option: string, arrow: Node, work: () => object): void => {
    read.arrows.set(arrow, { option })
    try {
      read.views[option] = work()
    } catch (failure) {
      if (!(failure instanceof NotPlain)) throw failure
      read.arrows.set(arrow, { option, thing: failure.thing, at: { type: '', start: failure.at, end: failure.at } })
      read.why ??= { option, thing: failure.thing, line: lineOf(text, failure.at) }
    }
  }
  const written = (options: Node | undefined, option: string): Node | undefined => {
    const one = kid(propertyOf(options, option), 'value')
    return one ? unwrap(one) : undefined
  }
  const view = written(declared.options, 'view')
  if (view) {
    const drawing =
      view.type === 'Identifier' ? topFunction(tree, nameOf(view) ?? '') : isArrow(view) ? view : undefined
    const uses = drawing ? drawnIn(drawing, file) : []
    if (uses.length) read.views.uses = uses
    const needs = neededBy(file)
    if (needs.length) read.views.needs = needs
    const opens = opensBy(file)
    if (opens) read.views.opens = opens
  }
  const data = written(declared.options, 'data')
  if (isArrow(data)) tried('data', data, () => dataOf(data, file))
  if (declared.word !== 'screen') return read
  const title = written(declared.options, 'title')
  if (isArrow(title)) tried('title', title, () => oneValue(title, file, 'title'))
  const seo = written(declared.options, 'seo')
  for (const field of ['description', 'image', 'data']) {
    const arrow = written(seo, field)
    if (isArrow(arrow)) tried(`seo.${field}`, arrow, () => oneValue(arrow, file, `seo.${field}`))
  }
  return read
}
