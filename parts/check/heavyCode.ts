import type { Node } from '../build/index.ts'
import { keyOf, kid, kids, unwrap } from '../build/index.ts'
import type { Description } from '../core/internal.ts'
import { answersOf, callsIn } from './code.ts'
import type { Written } from './rule.ts'
import { arrowOf, inside } from './rule.ts'
import { isStored } from '../core/internal.ts'

/** The names that the first parameter of an arrow takes from what it is handed: `({ entries, db })`. */
function handedNames(arrow: Node): string[] | undefined {
  const [first] = kids(arrow, 'params')
  const at = first ? unwrap(first) : undefined
  if (at?.type !== 'ObjectPattern') return undefined
  return kids(at, 'properties').flatMap((property) => {
    const key = keyOf(property)
    return key === undefined ? [] : [key]
  })
}

/** Whether an expression is plainly no list: a value written in place, a sum, a field of a record or a length. */
function plainlyNoList(node: Node): boolean {
  const at = unwrap(node)
  if (at.type === 'AwaitExpression') {
    const argument = kid(at, 'argument')
    return argument ? plainlyNoList(argument) : false
  }
  if (at.type === 'ConditionalExpression')
    return [kid(at, 'consequent'), kid(at, 'alternate')].every((one) => one !== undefined && plainlyNoList(one))
  return [
    'Literal',
    'ObjectExpression',
    'TemplateLiteral',
    'BinaryExpression',
    'UnaryExpression',
    'MemberExpression',
  ].includes(at.type)
}

/** What is wrong with the code of a definition that states `batch`: it takes no list of entries, or plainly answers no list. */
export function batchMisfits(written: Written): string[] {
  const arrow = arrowOf(written, 'run')
  if (!arrow) return []
  const wrong: string[] = []
  const names = handedNames(arrow)
  if (names && !names.includes('entries')) wrong.push('its code takes no list: it reads no `entries`')
  const answers = answersOf(arrow)
  if (answers.length && answers.every(plainlyNoList))
    wrong.push('its code answers no list, one entry for each it is handed')
  return wrong
}

/**
 * What an action that states `changes: false` does that writes: a change it calls, a run it starts or a flow it
 * calls, and an event it emits, in its body where it was read, and in its code by the names that code calls.
 */
export function writesOf(description: Description, written: Written, body: unknown): string[] {
  const found = new Set<string>()
  const ofName = (name: string): void => {
    const fn = Object.hasOwn(description.functions, name) ? description.functions[name] : undefined
    if (fn?.kind === 'change') found.add('calls a change')
    if (Object.hasOwn(description.flows, name)) found.add('starts a run')
  }
  inside(body, (record) => {
    if (record.fn === 'start') found.add('starts a run')
    if (record.fn === 'emit') found.add('emits an event')
    const call = isStored(record.call) ? record.call : undefined
    if (typeof call?.function === 'string') ofName(call.function)
    if (typeof call?.flow === 'string') found.add('starts a run')
  })
  const arrow = arrowOf(written, 'run')
  for (const call of arrow ? callsIn(arrow) : []) {
    const word = written.words.get(call.name)
    if (word === 'start') found.add('starts a run')
    else if (word === 'emit') found.add('emits an event')
    else ofName(call.name)
  }
  return [...found]
}
