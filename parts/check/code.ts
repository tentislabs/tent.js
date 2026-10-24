import type { Node } from '../build/index.ts'
import { below, child, kid, kids, nameOf, unwrap, walk, word } from '../build/index.ts'

/** One call in code: what is called, as the names it is reached by with dots between, and what it is handed. */
export interface Call {
  name: string
  made: boolean
  args: Node[]
  node: Node
}

/** The names that a read is made of, with dots between, where it is a name and reads into it by names alone. */
function dotted(node: Node): string | undefined {
  const n = unwrap(node)
  if (n.type === 'Identifier') return nameOf(n)
  if (n.type !== 'MemberExpression' || n.computed === true) return undefined
  const from = dotted(child(n, 'object'))
  const name = word(kid(n, 'property'), 'name')
  return from !== undefined && name !== undefined ? `${from}.${name}` : undefined
}

/** Every call, and every `new`, that stands in a piece of code, in the order of the text. */
export function callsIn(code: Node): Call[] {
  const found: Call[] = []
  walk(code, (node) => {
    if (node.type !== 'CallExpression' && node.type !== 'NewExpression') return
    const name = dotted(child(node, 'callee'))
    if (name !== undefined)
      found.push({ name, made: node.type === 'NewExpression', args: kids(node, 'arguments'), node })
  })
  return found
}

/** One read in code of a name that is reached by names alone, with dots between: `db.system.orders`. */
export interface Read {
  name: string
  node: Node
}

/** Every read of a name by names alone that stands in a piece of code, in the order of the text, each part of a longer one among them. */
export function readsIn(code: Node): Read[] {
  const found: Read[] = []
  walk(code, (node) => {
    if (node.type !== 'MemberExpression') return
    const name = dotted(node)
    if (name !== undefined) found.push({ name, node })
  })
  return found
}

/** Whether a node is a function written in code: an arrow, a function expression or a declared one. */
export const isFunction = (node: Node): boolean =>
  node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration'

/**
 * The expressions that a function answers: its body where it is one, and what each of its own `return`s hands
 * back. A `return` of a function written inside it is that function's own, and is left out.
 */
export function answersOf(fn: Node): Node[] {
  const body = kid(fn, 'body')
  if (!body) return []
  if (body.type !== 'BlockStatement') return [body]
  const found: Node[] = []
  const look = (node: Node): void => {
    if (isFunction(node)) return
    const argument = node.type === 'ReturnStatement' ? kid(node, 'argument') : undefined
    if (argument) found.push(argument)
    for (const one of below(node)) look(one)
  }
  for (const one of below(body)) look(one)
  return found
}
