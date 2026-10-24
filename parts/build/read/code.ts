import type { Node } from '../tree.ts'
import { below, child, keyOf, kid, kids, nameOf, propertyOf, unwrap, word } from '../tree.ts'

const loops = new Set(['ForStatement', 'ForOfStatement', 'ForInStatement', 'WhileStatement', 'DoWhileStatement'])
const functions = new Set(['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration'])

/** The name under which the `run` of a flow takes a thing it is handed, or nothing where it takes the record whole. */
function handedAs(run: Node, thing: string): string | undefined {
  const [first] = kids(run, 'params')
  if (first?.type !== 'ObjectPattern') return undefined
  const taken = kids(first, 'properties').find((one) => one.type === 'Property' && keyOf(one) === thing)
  return nameOf(kid(taken, 'value'))
}

const textOf = (node: Node | undefined): string | undefined =>
  node?.type === 'Literal' && typeof node.value === 'string' ? node.value : undefined

/** The name that the options of a step tool state, where they are written in place. */
const statedName = (options: Node | undefined): string | undefined =>
  textOf(kid(propertyOf(options ? unwrap(options) : undefined, 'name'), 'value'))

/** The name of one call of a step tool, or nothing for a name that is worked out. */
function stepName(member: string | undefined, args: Node[]): string | undefined {
  const [first, second] = args.map(unwrap)
  if (member === undefined || member === 'many') return textOf(first)
  if (member === 'wait') return statedName(second) ?? 'wait'
  if (member === 'waitFor') {
    const event = first?.type === 'CallExpression' ? kids(first, 'arguments')[0] : first
    return statedName(second) ?? textOf(event)
  }
  return member
}

/**
 * Takes the `run` of a code flow. Answers the step names that can be found in it, in the order they stand: a step
 * that stands in a repeat, or in a function that is handed on, as repeated, and a step whose name is worked out,
 * or that a helper is handed, as one that is in code.
 */
export function stepNamesOf(run: Node): object[] {
  const step = handedAs(run, 'step')
  const found: { name?: string; repeated?: true; inCode?: true }[] = []
  const inCode = () => {
    if (!found.some((one) => one.inCode)) found.push({ inCode: true })
  }
  // A `run` that takes its record whole may reach the step tool by any read, which is not followed.
  if (step === undefined) {
    if (kids(run, 'params').length && kids(run, 'params')[0].type !== 'ObjectPattern') inCode()
    return found
  }
  const see = (node: Node, repeated: boolean, hidden: boolean): void => {
    const callee = node.type === 'CallExpression' ? unwrap(child(node, 'callee')) : undefined
    const direct = nameOf(callee) === step
    const member =
      callee?.type === 'MemberExpression' && nameOf(kid(callee, 'object')) === step
        ? word(kid(callee, 'property'), 'name')
        : undefined
    let inside = repeated
    if (callee && (direct || member !== undefined)) {
      const name = member === 'all' || member === 'first' ? '' : stepName(member, kids(node, 'arguments'))
      if (name === undefined || hidden) inCode()
      else if (name !== '' && !found.some((one) => one.name === name && (one.repeated === true) === repeated))
        found.push(repeated ? { repeated: true, name } : { name })
      // One arrow that is run for each entry of a list makes the steps inside it repeated.
      if ((member === 'all' || member === 'first') && kids(node, 'arguments').length > 1) inside = true
    } else if (nameOf(node) === step) inCode()
    else if (callee && kids(node, 'arguments').some((one) => functions.has(unwrap(one).type))) inside = true
    const deeper =
      hidden ||
      node.type === 'FunctionDeclaration' ||
      (node.type === 'VariableDeclarator' && functions.has(unwrap(kid(node, 'init') ?? node).type))
    // The name of the tool where it is called is no hand-over of it.
    const called = direct || member !== undefined ? kid(node, 'callee') : undefined
    for (const one of below(node)) if (one !== called) see(one, inside || loops.has(node.type), deeper)
  }
  see(child(run, 'body'), false, false)
  return found
}

/** Whether the code of an arrow uses the store's own SQL, `db.sql`, which ties its definition to SQLite. */
export function usesSql(arrow: Node): boolean {
  let found = false
  const see = (node: Node): void => {
    if (node.type === 'MemberExpression' && word(kid(node, 'property'), 'name') === 'sql') {
      const object = unwrap(child(node, 'object'))
      const root = object.type === 'MemberExpression' ? unwrap(child(object, 'object')) : object
      if (nameOf(root) === 'db') found = true
    }
    for (const one of below(node)) see(one)
  }
  see(arrow)
  return found
}
