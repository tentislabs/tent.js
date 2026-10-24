import type { Node } from '../build/index.ts'
import { kid, kids, nameOf, unwrap } from '../build/index.ts'
import type { Written } from './rule.ts'
import { statedAt } from './stated.ts'
import { entriesOf } from './tags.ts'

/** One entry of `data`, as its file writes it: its name, what stands under it, and the three things `read` is given. */
export interface Entry {
  name: string
  node: Node
  // The name of what is read, where it is written as one name.
  what?: string
  options?: [string, Node][]
}

/** What an arrow gives, where it gives one value and holds no statement. */
const given = (node: Node): Node => {
  if (node.type !== 'ArrowFunctionExpression') return node
  const body = kid(node, 'body')
  return body && body.type !== 'BlockStatement' ? unwrap(body) : node
}

/**
 * Takes a screen or a component. Answers the entries of its `data`, in the order they are written: an empty list
 * where it states none, and nothing where `data` is written in a way that names no entries in place.
 */
export function dataOf(written: Written): Entry[] | undefined {
  const data = statedAt(written, ['data'])
  if (!data) return []
  const entries = entriesOf(given(data))
  return entries?.map(([name, value]) => {
    const call = unwrap(value)
    const args = call.type === 'CallExpression' ? kids(call, 'arguments') : []
    const what = nameOf(args[0] ? unwrap(args[0]) : undefined)
    const options = entriesOf(args[2])
    // The finding of an entry stands at its name, which is where its line begins.
    return { name, node: value, ...(what === undefined ? {} : { what }), ...(options ? { options } : {}) }
  })
}
