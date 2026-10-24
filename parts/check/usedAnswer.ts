import type { Node, Source } from '../build/index.ts'
import { below, keyOf, kid, kids, nameOf, scan, unwrap, word } from '../build/index.ts'
import { isFunction } from './code.ts'
import type { Written } from './rule.ts'

// What stands around a value and hands it on as it is: an `await`, brackets, and the marks of the type checker.
const passing = new Set([
  'AwaitExpression',
  'ParenthesizedExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'ChainExpression',
])

/** Each node of a tree with the node it stands in. */
function parentsOf(tree: Node): Map<Node, Node> {
  const parents = new Map<Node, Node>()
  const look = (node: Node): void => {
    for (const one of below(node)) {
      parents.set(one, node)
      look(one)
    }
  }
  look(tree)
  return parents
}

// The members of `Promise` that answer what the promises they are handed answer.
const handingOn = new Set(['all', 'allSettled', 'any', 'race'])

/** The name of the member a call is made of, as `map` of `list.map(fn)`, or nothing for a call of a plain name. */
function memberCalled(call: Node): string | undefined {
  const callee = unwrap(kid(call, 'callee') ?? call)
  return callee.type === 'MemberExpression' && callee.computed !== true
    ? word(kid(callee, 'property'), 'name')
    : undefined
}

/** Whether a call is of `Promise.all` or another of its kind, which answers what the values handed to it answer. */
function handsOn(call: Node): boolean {
  const callee = unwrap(kid(call, 'callee') ?? call)
  const object = kid(callee, 'object')
  return handingOn.has(memberCalled(call) ?? '') && nameOf(object ? unwrap(object) : undefined) === 'Promise'
}

/** Whether a function is what an attribute of a tag that names an event holds: the page throws its answer away. */
function handlesEvent(fn: Node, parents: Map<Node, Node>): boolean {
  const holder = parents.get(fn)
  const attribute = holder?.type === 'JSXExpressionContainer' ? parents.get(holder) : undefined
  return attribute?.type === 'JSXAttribute' && /^on[A-Z]/.test(word(kid(attribute, 'name'), 'name') ?? '')
}

/**
 * Whether the value of an expression is taken: anything but a statement of its own. A list written in place, and
 * a `Promise.all` handed it, hand on what they hold. What a function answers is taken only where that function is
 * handed to a call whose own value is taken, as `step` and `map` are: `forEach` and an event of a tag throw it away.
 */
function taken(node: Node, parents: Map<Node, Node>): boolean {
  let at = node
  for (;;) {
    const parent = parents.get(at)
    if (!parent) return false
    if (passing.has(parent.type) || parent.type === 'ArrayExpression') {
      at = parent
      continue
    }
    if (parent.type === 'ExpressionStatement') return false
    if (parent.type === 'CallExpression' && handsOn(parent) && kids(parent, 'arguments').includes(at)) {
      at = parent
      continue
    }
    // What a function answers, by its body or by a `return` of its own.
    const fn =
      isFunction(parent) && kid(parent, 'body') === at
        ? parent
        : parent.type === 'ReturnStatement'
          ? enclosing(parent, parents)
          : undefined
    if (!fn) return true
    if (handlesEvent(fn, parents)) return false
    const call = parents.get(fn)
    if (call?.type !== 'CallExpression') return true
    if (memberCalled(call) === 'forEach') return false
    at = call
  }
}

/** The function that a node stands in, or nothing at the top of its file. */
function enclosing(node: Node, parents: Map<Node, Node>): Node | undefined {
  for (let at = parents.get(node); at; at = parents.get(at)) if (isFunction(at)) return at
  return undefined
}

/** The names by which a file reaches a definition: its own name in its own file, and what imports it elsewhere. */
function namesIn(tree: Node, path: string, written: Written): Set<string> {
  const names = new Set<string>()
  if (path === written.path) names.add(written.declared.exportName)
  for (const one of scan(tree).imports)
    if (one.from.startsWith('.') && one.name === written.declared.exportName) names.add(one.local)
  return names
}

/** Whether the value of an attribute of a tag is a function that takes what it is handed. */
const takesArgument = (attribute: Node | undefined): boolean => {
  const value = kid(kid(attribute, 'value'), 'expression')
  const fn = value ? unwrap(value) : undefined
  return fn !== undefined && isFunction(fn) && kids(fn, 'params').length > 0
}

/** The attribute of a tag of that name. */
const attributeOf = (tag: Node, name: string): Node | undefined =>
  kids(tag, 'attributes').find((one) => one.type === 'JSXAttribute' && word(kid(one, 'name'), 'name') === name)

/** Whether a node is a name among those that reach the definition. */
const reaches = (node: Node | undefined, names: Set<string>): boolean => {
  const name = nameOf(node ? unwrap(node) : undefined)
  return name !== undefined && names.has(name)
}

/** Each node that stands under a node, at any depth. */
function* within(node: Node): Generator<Node> {
  for (const one of below(node)) {
    yield one
    yield* within(one)
  }
}

/**
 * Takes a `useCall` of the definition and where it stands. Answers whether its view uses the answer, in the forms
 * `hook.useCall` shows: reads `value`, of what it answers or taken apart, or takes the value of its `call`.
 */
function viewTakes(useCall: Node, parents: Map<Node, Node>, tree: Node): boolean {
  const declared = parents.get(useCall)
  const pattern = declared?.type === 'VariableDeclarator' ? kid(declared, 'id') : undefined
  const parts = pattern?.type === 'ObjectPattern' ? kids(pattern, 'properties') : []
  if (parts.some((one) => keyOf(one) === 'value')) return true
  const handle = nameOf(pattern)
  const calls = new Set(parts.filter((one) => keyOf(one) === 'call').map((one) => nameOf(kid(one, 'value')) ?? ''))
  // A name of the view is its own: what another view names alike is no use of this `useCall`.
  for (const node of within(enclosing(useCall, parents) ?? tree)) {
    const member = node.type === 'MemberExpression' && node.computed !== true ? node : undefined
    const owner = member ? kid(member, 'object') : undefined
    if (handle && owner && nameOf(unwrap(owner)) === handle && word(kid(member, 'property'), 'name') === 'value')
      return true
    if (node.type !== 'CallExpression' || !taken(node, parents)) continue
    const callee = unwrap(kid(node, 'callee') ?? node)
    const of = kid(callee, 'object')
    if (handle && memberCalled(node) === 'call' && nameOf(of ? unwrap(of) : undefined) === handle) return true
    if (calls.has(nameOf(callee) ?? '')) return true
  }
  return false
}

/**
 * Takes a definition of a function and the files of the project. Answers whether code of the project uses what
 * the function answers: takes the value of a call of it, has a `Form` that calls it hand its answer to `then`, or
 * uses the answer of a `useCall` of it.
 */
export function answerUsed(written: Written, source: Source): boolean {
  for (const [path, file] of Object.entries(source)) {
    const tree = file.tree
    if (!tree) continue
    const names = namesIn(tree, path, written)
    if (!names.size) continue
    const parents = parentsOf(tree)
    for (const node of parents.keys()) {
      if (node.type === 'CallExpression' && reaches(kid(node, 'callee'), names) && taken(node, parents)) return true
      if (node.type === 'JSXOpeningElement' && word(kid(node, 'name'), 'name') === 'Form') {
        const call = kid(kid(attributeOf(node, 'call'), 'value'), 'expression')
        if (reaches(call, names) && takesArgument(attributeOf(node, 'then'))) return true
      }
      if (node.type === 'CallExpression' && nameOf(kid(node, 'callee')) === 'useCall') {
        const [called] = kids(node, 'arguments')
        if (reaches(called, names) && viewTakes(node, parents, tree)) return true
      }
    }
  }
  return false
}
