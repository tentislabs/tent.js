import type { Node } from '../build/index.ts'
import { kid, kids, keyOf, nameOf, unwrap, walk } from '../build/index.ts'
import { callsIn } from './code.ts'
import { arrowsOfFlow } from './flowCode.ts'
import type { Written } from './rule.ts'
import { isStored } from '../core/internal.ts'

/** One step that a flow's code makes, with what its options state that the check can read, and where it stands. */
export interface StepWritten {
  name?: string
  node: Node
  // Each option written as a text, a number, `true`, `false`, or an object, by its key.
  options: Record<string, unknown>
}

/** The names that a file declares once with `const`, each with the value it is given. */
function constantsOf(tree: Node | undefined): Map<string, Node> {
  const found = new Map<string, Node>()
  const twice = new Set<string>()
  if (!tree) return found
  walk(tree, (node) => {
    if (node.type !== 'VariableDeclarator') return
    const id = kid(node, 'id')
    const init = kid(node, 'init')
    if (id?.type !== 'Identifier' || !init) return
    const name = nameOf(id)
    if (name === undefined) return
    if (found.has(name)) twice.add(name)
    found.set(name, init)
  })
  // A name that is declared twice may stand for either value: it is read as written.
  for (const name of twice) found.delete(name)
  return found
}

/**
 * What a node written as a value holds where it is plain: a text, a number, a truth, or an object of those. A
 * name that the file declares once is read as the value it is given.
 */
function valueOf(node: Node | undefined, constants: Map<string, Node>, depth = 0): unknown {
  if (!node || depth > 20) return undefined
  const at = unwrap(node)
  if (at.type === 'Literal') return at.value
  if (at.type === 'Identifier') {
    const name = nameOf(at)
    const given = name === undefined ? undefined : constants.get(name)
    return given ? valueOf(given, constants, depth + 1) : { written: true }
  }
  if (at.type === 'ObjectExpression') {
    const held: Record<string, unknown> = {}
    for (const property of kids(at, 'properties')) {
      const key = keyOf(property)
      if (key !== undefined) held[key] = valueOf(kid(property, 'value'), constants, depth + 1)
    }
    return held
  }
  if (at.type === 'ArrayExpression') return kids(at, 'elements').map((one) => valueOf(one, constants, depth + 1))
  return { written: true }
}

/** Every call of `step` with its options in the code of a flow, in the order of the text. */
export function stepsOf(flow: Written): StepWritten[] {
  const constants = constantsOf(flow.tree)
  return arrowsOfFlow(flow).flatMap((code) =>
    callsIn(code)
      .filter((call) => call.name === 'step')
      .map((call) => {
        const named = call.args[0] ? valueOf(call.args[0], constants) : undefined
        const options = valueOf(call.args[2], constants)
        return {
          ...(typeof named === 'string' ? { name: named } : {}),
          node: call.node,
          options: isStored(options) ? options : {},
        }
      }),
  )
}
