import { valueWords as wordsOfCore, isStored } from '../../core/internal.ts'
import type { Node } from '../tree.ts'
import { child, keyOf, kids, nameOf, unwrap, word } from '../tree.ts'
import type { Known, Reach } from './reach.ts'
import { endsAChain, local, NotPlain, Refused } from './reach.ts'
import { arrow } from './statement.ts'
import { isTypeCall, isTypeWord, typeStored } from './type.ts'
import { value } from './value.ts'

/** The value words, which a body calls by their names: those that core carries out. */
export const valueWords: ReadonlySet<string> = new Set(Object.keys(wordsOfCore))

// A screen's arrows are worked out on the server and in the browser alike: no word whose value is drawn, and none
// that the page code leaves to backend code for its weight.
const backendWords = new Set(['fingerprint', 'now', 'chunks', 'random', 'sameSecret', 'token'])

/** The value words that a screen's `data`, `title` and search-engine fields may hold. */
export const screenWords: ReadonlySet<string> = new Set([...valueWords].filter((name) => !backendWords.has(name)))
const otherWords = new Set(['fail', 'start', 'emit', 'given', 'event'])
const handles = new Set([
  'attempts',
  'connections',
  'files',
  'grants',
  'keys',
  'log',
  'mail',
  'passwords',
  'roles',
  'runs',
  'sessions',
  'workspaces',
])
const referenceWords = new Set(['input', 'caller', 'col'])
const takesArrow = new Set(['each', 'step', 'step.all', 'step.first'])
const asAValue: Record<string, string> = {
  query: 'function',
  change: 'function',
  action: 'function',
  python: 'function',
  flow: 'flow',
  agent: 'agent',
  service: 'service',
  model: 'model',
  table: 'table',
}

/** One dot, one place in square brackets, or one call, as it follows the start of a read. */
type Link =
  | { dot: string; optional: boolean; node: Node }
  | { place: Node; optional: boolean; node: Node }
  | { args: Node[]; node: Node }

const isCall = (link: Link | undefined): link is { args: Node[]; node: Node } => link !== undefined && 'args' in link
const isDot = (link: Link | undefined): link is { dot: string; optional: boolean; node: Node } =>
  link !== undefined && 'dot' in link && !link.optional

// One read or call, laid flat: where it starts, and each dot, place and call after it, in order. `?.` ends at the
// brackets around it, so a value in brackets is a start of its own.
function flatten(node: Node): { root: Node; links: Link[] } {
  const links: Link[] = []
  let at = node.type === 'ChainExpression' ? child(node, 'expression') : node
  for (;;) {
    if (at.type === 'TSNonNullExpression') at = child(at, 'expression')
    else if (at.type === 'MemberExpression') {
      const optional = at.optional === true
      const property = child(at, 'property')
      links.unshift(
        at.computed === true
          ? { place: property, optional, node: at }
          : { dot: word(property, 'name') ?? '', optional, node: at },
      )
      at = child(at, 'object')
    } else if (at.type === 'CallExpression') {
      if (at.optional === true) throw new NotPlain('a call written with `?.`', at)
      links.unshift({ args: kids(at, 'arguments'), node: at })
      at = child(at, 'callee')
    } else return { root: unwrap(at), links }
  }
}

const textOf = (node: Node): string | undefined =>
  node.type === 'Literal' && typeof node.value === 'string' ? node.value : undefined

// A place by a written text is stored as a name is. One that starts with a question mark is stored as text with
// values, so that it is a place that is worked out and is never read as `?.`.
function place(node: Node, reach: Reach): unknown {
  const n = unwrap(node)
  const text = textOf(n)
  if (text !== undefined) return text.startsWith('?') ? { text: [text] } : text
  if (n.type === 'Literal' && typeof n.value === 'number') return n.value
  const stored = value(n, reach)
  if (stored === null || typeof stored !== 'object') throw new NotPlain('a place that is true, false or nothing', node)
  return stored
}

function pathOf(links: Link[], reach: Reach): unknown[] {
  return links.flatMap((link): unknown[] => {
    if (isCall(link))
      throw new NotPlain(`a call of what a read or a call gave: a method${methodOf(links, link)}`, link.node)
    if ('dot' in link) return [link.optional ? `?${link.dot}` : link.dot]
    if (!link.optional) return [place(link.place, reach)]
    // The entry "?" alone says that the place after it was reached with `?.` in front of its square brackets.
    const text = textOf(unwrap(link.place))
    if (text !== undefined && text !== '' && !text.startsWith('?')) return [`?${text}`]
    return ['?', text === '' ? { text: [''] } : place(link.place, reach)]
  })
}

/** The name of the method that a call stands for, where a dot stands in front of it. */
function methodOf(links: Link[], call: Link): string {
  const before = links[links.indexOf(call) - 1]
  return before && 'dot' in before ? `, \`.${before.dot}\`` : ''
}

function readInto(base: unknown, links: Link[], reach: Reach): unknown {
  if (!links.length) return base
  const path = pathOf(links, reach)
  const names = isStored(base) && Array.isArray(base.name) ? base.name : undefined
  const plainName = names?.every((entry) => typeof entry !== 'string' || !entry.startsWith('?'))
  return names && plainName ? { name: [...names, ...path] } : { read: base, path }
}

function args(nodes: Node[], reach: Reach, arrows: boolean): unknown[] {
  const isArrow = (entry: Node) => unwrap(entry).type === 'ArrowFunctionExpression'
  return nodes.map((node) => {
    if (node.type === 'SpreadElement') throw new NotPlain('a spread', node)
    const n = unwrap(node)
    if (isArrow(n)) {
      if (!arrows) throw new NotPlain('an arrow handed to a word that takes none', n)
      if (reach.screen && n.async === true) throw new NotPlain('an arrow that is `async`', n)
      return arrow(n, reach)
    }
    if (n.type === 'FunctionExpression') throw new NotPlain('a function other than an arrow', n)
    if (arrows && n.type === 'ArrayExpression' && kids(n, 'elements').some(isArrow))
      return kids(n, 'elements').map((entry) => (isArrow(entry) ? arrow(unwrap(entry), reach) : value(entry, reach)))
    const properties = n.type === 'ObjectExpression' ? kids(n, 'properties') : []
    const types =
      properties.length > 0 &&
      properties.every(
        (one) => one.type === 'Property' && keyOf(one) !== undefined && isTypeCall(child(one, 'value'), reach),
      )
    if (types)
      return {
        types: Object.fromEntries(properties.map((one) => [keyOf(one), typeStored(child(one, 'value'), reach)])),
      }
    return value(n, reach)
  })
}

// A chain is stored as it is written: where it starts, and each member with its values, in order. A chain through
// `db` ends with a member that answers: what stands after it reads into a value.
function chainFrom(start: object, links: Link[], reach: Reach, ends = true): unknown {
  const then: Record<string, unknown[]>[] = []
  let i = 0
  for (;;) {
    const [dot, call] = [links[i], links[i + 1]]
    if (!isDot(dot) || !isCall(call)) break
    then.push({ [dot.dot]: args(call.args, reach, false) })
    i += 2
    if (ends && endsAChain.has(dot.dot)) break
  }
  return readInto({ plan: start, then }, links.slice(i), reach)
}

function fromLocal(name: string, known: { chain: false | 'db' | 'table' }, links: Link[], reach: Reach): unknown {
  const first = links.findIndex(isCall)
  if (first === -1) return { name: [name, ...pathOf(links, reach)] }
  if (first === 0) throw new NotPlain(`a call of \`${name}\`, a name of the body`, links[0].node)
  if (first === 1 && isDot(links[0]) && known.chain)
    return chainFrom({ name: [name] }, links, reach, known.chain === 'db')
  const dot = links[first - 1]
  const member = dot && 'dot' in dot ? `\`.${dot.dot}\`` : 'a member'
  throw new NotPlain(
    `${member} called on \`${name}\`, which is no \`const\` with a chain that has not ended: a method`,
    links[first].node,
  )
}

/** What a name stands for that is no name of the body: a definition of the file or of an import, or nothing. */
function definitionOf(name: string, reach: Reach): Known | undefined {
  const imported = reach.imports.get(name)
  return reach.own.get(name) ?? (imported && 'app' in imported ? imported.app : undefined)
}

function definitionCalled(node: Node | undefined, reach: Reach): object {
  const name = node ? nameOf(unwrap(node)) : undefined
  const known = name !== undefined && !local(reach, name) ? definitionOf(name, reach) : undefined
  if (!known || asAValue[known.kind] !== 'function')
    throw new NotPlain('`call` handed anything but a query, a change or an action that the file names', node)
  return { function: known.definition }
}

function fromHanded(name: string, links: Link[], reach: Reach): unknown {
  const [first, second] = links
  if (name === reach.db && isDot(first)) {
    const system = first.dot === 'system'
    const table = system ? second : first
    if (!isDot(table) || table.dot === 'sql' || table.dot === 'n') throw new NotPlain('`db.sql` or `db.n`', first.node)
    return chainFrom(system ? { db: table.dot, system: true } : { db: table.dot }, links.slice(system ? 2 : 1), reach)
  }
  if (name === 'call' && isCall(first)) {
    const [definition, ...rest] = first.args
    return readInto(
      { call: definitionCalled(definition, reach), args: args(rest, reach, false), system: true },
      links.slice(1),
      reach,
    )
  }
  if (name === 'step' && isCall(first))
    return readInto({ fn: 'step', args: args(first.args, reach, true) }, links.slice(1), reach)
  if (name === 'step' && isDot(first) && isCall(second)) {
    const fn = `step.${first.dot}`
    return readInto({ fn, args: args(second.args, reach, takesArrow.has(fn)) }, links.slice(2), reach)
  }
  return { name: [name, ...pathOf(links, reach)] }
}

/** A word of `tentjs/ui` in an arrow of a screen: a value word of a screen, `message` and `asset`. */
function fromUi(name: string, links: Link[], reach: Reach, node: Node): unknown {
  const [first] = links
  if (name === 'asset' && isCall(first)) {
    const [named, more] = first.args
    if (!named || more || named.type === 'SpreadElement') throw new NotPlain('`asset` with more than one name', node)
    return readInto({ asset: value(named, reach) }, links.slice(1), reach)
  }
  // A message of the language files: its key, written in place or as a list of its parts, and the values of its places.
  if (name === 'message' && isCall(first)) {
    const [key, values, more] = first.args
    if (!key || more || key.type === 'SpreadElement' || values?.type === 'SpreadElement')
      throw new NotPlain('`message` with more than a key and the values of its places', node)
    const stored = value(key, reach)
    if (typeof stored !== 'string' && !Array.isArray(stored))
      throw new NotPlain('`message` whose key is neither a text nor a list of its parts', key)
    const given = values ? unwrap(values) : undefined
    if (given && given.type !== 'ObjectExpression')
      throw new NotPlain('`message` whose values are not a record written in place', given)
    const entries = given ? Object(value(given, reach)).object : undefined
    return readInto(
      { message: stored, ...(Array.isArray(entries) ? { with: Object.fromEntries(entries) } : {}) },
      links.slice(1),
      reach,
    )
  }
  if (screenWords.has(name) && isCall(first))
    return readInto({ fn: name, args: args(first.args, reach, name === 'each') }, links.slice(1), reach)
  throw new NotPlain(
    isCall(first) ? `a call of \`${name}\`` : `a use of \`${name}\` that a screen's arrow does not hold`,
    node,
  )
}

function fromOurs(name: string, links: Link[], reach: Reach, node: Node): unknown {
  if (reach.screen) return fromUi(name, links, reach, node)
  const [first, second] = links
  if (referenceWords.has(name))
    throw new Refused('T1014', `\`${name}\` has no meaning in a body, which reads that value by its name.`, node)
  if (isTypeWord(name) && isCall(first) && links.length === 1) return { type: typeStored(first.node, reach) }
  if ((valueWords.has(name) || otherWords.has(name)) && isCall(first))
    return readInto({ fn: name, args: args(first.args, reach, takesArrow.has(name)) }, links.slice(1), reach)
  if (handles.has(name) && isDot(first) && isCall(second))
    return readInto(
      { call: { builtin: `${name}.${first.dot}` }, args: args(second.args, reach, false) },
      links.slice(2),
      reach,
    )
  if (name === 'settings' && isDot(first)) return readInto({ setting: first.dot }, links.slice(1), reach)
  if (name === 'secrets') throw new NotPlain('a secret, which code reads and opens', node)
  throw new NotPlain(`a use of \`${name}\` that a body does not hold`, node)
}

function fromDefinition(known: Known, links: Link[], reach: Reach, node: Node): unknown {
  const kind = asAValue[known.kind]
  const name = known.definition
  const [first, second] = links
  // A screen reads through `read`, and calls through `useCall` or a `Form`: its arrows hold no definition.
  if (reach.screen)
    throw new NotPlain(
      isCall(first) || (isDot(first) && isCall(second))
        ? `a call of \`${name}\`: a screen calls through \`read\`, \`useCall\` or a \`Form\``
        : `a use of the ${known.kind} \`${name}\` that a screen's arrow does not hold`,
      node,
    )
  if (known.kind === 'project') {
    // An option of the project is stored where it is read, as the value that the project's file writes, with its
    // name: `options` and the option's own name. A deeper read is a read into it.
    if (!isDot(first) || first.dot !== 'options' || !isDot(second))
      throw new NotPlain(`a read of the project \`${name}\` that is no option of it`, node)
    const option = known.option?.(second.dot)
    if (option === undefined)
      throw new NotPlain(
        `a read of the option \`${second.dot}\` of the project, which holds no plain value written in place`,
        node,
      )
    return readInto(
      { named: { project: ['options', second.dot] }, value: structuredClone(option) },
      links.slice(2),
      reach,
    )
  }
  if (kind === undefined)
    throw new NotPlain(`a use of the ${known.kind} \`${name}\` that a body has no stored form for`, node)
  if (!links.length) return { [kind]: name }
  if (isCall(first)) {
    const rest = links.slice(1)
    const input = () => args(first.args, reach, false)
    if (kind === 'function') return readInto({ call: { function: name }, args: input() }, rest, reach)
    if (kind === 'flow' || kind === 'agent') return readInto({ call: { flow: name }, args: input() }, rest, reach)
    if (kind === 'model' && known.called) return readInto({ call: { model: name }, args: input() }, rest, reach)
  }
  if (isDot(first) && isCall(second)) {
    if (kind === 'service' || kind === 'model')
      return readInto(
        { call: { [kind]: name, call: first.dot }, args: args(second.args, reach, false) },
        links.slice(2),
        reach,
      )
    if (kind === 'table') return chainFrom({ table: name }, links, reach, false)
    // A member of the engine's own: any member of an agent, and `working` of a flow and of an action.
    const working = (kind === 'flow' || known.kind === 'action' || known.kind === 'python') && first.dot === 'working'
    if (kind === 'agent' || working)
      return readInto(
        { call: { [kind]: name, member: first.dot }, args: args(second.args, reach, false) },
        links.slice(2),
        reach,
      )
  }
  // The stored forms of a body have no member of a definition that is read as a value.
  throw new NotPlain(`a use of the ${known.kind} \`${name}\` that a body has no stored form for`, node)
}

/** The words of a call or of a read that starts at a name the body does not hold. */
function notHeld(name: string, links: Link[], what: string): string {
  const [first, second] = links
  if (isCall(first)) return `a call of \`${name}\`, ${what}`
  if (isDot(first) && isCall(second)) return `a call of \`${name}.${first.dot}\`, ${what}`
  return `a read of \`${name}\`, ${what}`
}

/**
 * Holds a call of a tool to its form: one value, the record of its fields. A call that is handed its fields as
 * values, or two inputs, is refused with how it is written, so that a model mends it at once.
 */
function oneInput(tool: string, given: Node[], node: Node): void {
  const [first] = given
  const literal = first !== undefined && ['Literal', 'TemplateLiteral'].includes(unwrap(first).type)
  if (given.length <= 1 && !literal) return
  const what = given.length > 1 ? `${given.length} values` : 'a value that is no record'
  throw new NotPlain(
    `a call of \`${tool}\` with ${what}: a tool takes one record of its fields, as ${tool}({ field: value })`,
    first ?? node,
  )
}

/** A call that only a sequence holds: of a tool by its name, of a dotted one, by `call` with a name written in place, `all` and `fill`. */
function fromSequence(name: string, kind: string, links: Link[], reach: Reach, node: Node): unknown {
  const [first, second] = links
  if (kind === 'tool' && isCall(first)) {
    oneInput(name, first.args, node)
    return readInto({ call: { tool: name }, args: args(first.args, reach, false) }, links.slice(1), reach)
  }
  const dotted = isDot(first) ? `${name}.${first.dot}` : ''
  if (kind === 'dotted' && isCall(second) && reach.tools?.has(dotted)) {
    oneInput(dotted, second.args, node)
    return readInto({ call: { tool: dotted }, args: args(second.args, reach, false) }, links.slice(2), reach)
  }
  if (kind === 'call' && isCall(first)) {
    const [named, ...rest] = first.args
    const text = named && named.type !== 'SpreadElement' ? textOf(unwrap(named)) : undefined
    if (text === undefined)
      throw new NotPlain(
        "a call whose name is worked out: write the name in place, as call('refund', { order })",
        named ?? node,
      )
    oneInput(text, rest, node)
    return readInto({ call: { tool: text }, args: args(rest, reach, false) }, links.slice(1), reach)
  }
  if ((kind === 'all' || kind === 'fill') && isCall(first))
    return readInto({ fn: kind, args: args(first.args, reach, kind === 'all') }, links.slice(1), reach)
  throw new NotPlain(notHeld(name, links, 'which a sequence holds as a call alone'), node)
}

/** Takes a name, a read into a value, or a call. Answers its stored form: what the name is decides it. */
export function access(node: Node, reach: Reach): unknown {
  const { root, links } = flatten(node)
  const name = nameOf(root)
  if (name === undefined) return readInto(value(root, reach), links, reach)
  const known = local(reach, name)
  if (known) return fromLocal(name, known, links, reach)
  if (reach.handed.has(name)) return fromHanded(name, links, reach)
  const own = reach.own.get(name)
  if (own) return fromDefinition(own, links, reach, node)
  const top = reach.tops.get(name)
  if (top) {
    if (top.value === undefined)
      throw new NotPlain(
        isCall(links[0])
          ? `a call of \`${name}\`, a function of the file's own`
          : `a read of the top-level \`const\` \`${name}\`, whose value is no plain value written in place`,
        root,
      )
    return readInto({ named: { top: name }, value: structuredClone(top.value) }, links, reach)
  }
  const imported = reach.imports.get(name)
  if (!imported)
    throw new NotPlain(notHeld(name, links, `a name that the ${reach.screen ? 'arrow' : 'body'} does not hold`), root)
  if ('text' in imported)
    return readInto({ named: { textFile: imported.textFile, as: name }, value: imported.text }, links, reach)
  if ('ours' in imported) return fromOurs(imported.ours, links, reach, node)
  if ('app' in imported) return fromDefinition(imported.app, links, reach, node)
  if ('sequence' in imported) return fromSequence(name, imported.sequence, links, reach, root)
  throw new NotPlain(notHeld(name, links, `which is imported from '${imported.other}' and is no word of ours`), root)
}
