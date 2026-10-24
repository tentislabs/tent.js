import type { Node } from '../build/index.ts'
import { kid, propertyOf, unwrap } from '../build/index.ts'
import type { Written } from './rule.ts'

/**
 * Takes a definition as its file writes it, and a path of options into it: `['limits', 'perDay']`. Answers the
 * value that the file writes there, where every step of the path is written in place as a record, and nothing
 * otherwise. The description leaves out a record that holds nothing, which this still sees.
 */
export function statedAt(written: Written, path: string[]): Node | undefined {
  let at: Node | undefined = written.declared.options
  for (const name of path) {
    const value = kid(propertyOf(at, name), 'value')
    if (!value) return undefined
    at = unwrap(value)
  }
  return at
}

/** Whether a value that a file writes is a record with nothing in it: `{}`. */
export const isEmptyRecord = (node: Node | undefined): boolean => {
  const properties: unknown = node?.type === 'ObjectExpression' ? Reflect.get(node, 'properties') : undefined
  return Array.isArray(properties) && properties.length === 0
}
