import type { Node } from '../build/index.ts'
import { child, kids, unwrap } from '../build/index.ts'
import type { Tag } from './tags.ts'
import { literalOf } from './tags.ts'

/** A value as it is written, out of the curly brackets of a tag. */
const written = (node: Node): Node => unwrap(node.type === 'JSXExpressionContainer' ? child(node, 'expression') : node)

/**
 * What a property of an `Image` names as its source: an asset by a name written in place, `asset` with a value
 * known only while running, a text written in place, or a value known only while running. Nothing where it is not
 * written.
 */
export function sourceAt(
  tag: Tag,
  name: string,
): { asset: string } | { asset: undefined } | { text: string } | { running: true } | undefined {
  const prop = tag.props.get(name)
  if (!prop?.value) return undefined
  if (prop.literal.known)
    return typeof prop.literal.value === 'string' ? { text: prop.literal.value } : { running: true }
  const value = written(prop.value)
  if (value.type === 'CallExpression') {
    const callee = child(value, 'callee')
    if (callee.type === 'Identifier' && callee.name === 'asset') {
      const [first] = kids(value, 'arguments')
      const named = literalOf(first)
      return named.known && typeof named.value === 'string' ? { asset: named.value } : { asset: undefined }
    }
  }
  return { running: true }
}
