import type { Node } from '../build/index.ts'
import { keyOf, kid, kids, nameOf } from '../build/index.ts'

/**
 * Takes an arrow and a key of what it is handed. Answers the name under which its code holds that member: `user` of
 * `{ user }`, `u` of `{ user: u }`, and `cx.user` where it takes what it is handed whole as `cx`. Nothing where it
 * takes no such member.
 */
export function handedAs(code: Node, key: string): string | undefined {
  const [first] = kids(code, 'params')
  if (first?.type === 'Identifier') {
    const whole = nameOf(first)
    return whole === undefined ? undefined : `${whole}.${key}`
  }
  if (first?.type !== 'ObjectPattern') return undefined
  const taken = kids(first, 'properties').find((one) => one.type === 'Property' && keyOf(one) === key)
  const value = kid(taken, 'value')
  return nameOf(value?.type === 'AssignmentPattern' ? kid(value, 'left') : value)
}
