import { isStored } from '../record.ts'

/** The words a sequence may call by their names: the value words that work on what they are handed alone, and its own. */
const sequenceWordNames = new Set([
  'concat',
  'calc',
  'round',
  'floor',
  'ceil',
  'least',
  'most',
  'lower',
  'upper',
  'trim',
  'startsWith',
  'contains',
  'slice',
  'join',
  'range',
  'where',
  'sum',
  'avg',
  'min',
  'max',
  'later',
  'earlier',
  'between',
  'dayOf',
  'each',
  'fingerprint',
  'sameSecret',
  'chunks',
  'fail',
  'all',
  'fill',
])

/** The forms of a value that a sequence holds, by the member that names each. */
const valueForms = ['name', 'object', 'text', 'op', 'if', 'not', 'minus', 'read', 'await', 'nothing', 'arrow']

/** The misses of one stored value: each form that the shape of a sequence does not hold, in words. */
function valueMisses(node: unknown, shape = false): string[] {
  if (Array.isArray(node)) return node.flatMap((one) => valueMisses(one))
  if (!isStored(node)) return []
  if ('type' in node || 'types' in node) return shape ? [] : ['a type outside the shape of a `fill`']
  if ('call' in node) {
    const call = node.call
    if (!isStored(call) || typeof call.tool !== 'string' || Object.keys(call).length !== 1)
      return ['a call of what is no tool of the agent']
    return valueMisses(node.args)
  }
  if ('fn' in node) {
    const name = String(node.fn)
    if (!sequenceWordNames.has(name)) return [`the word \`${name}\``]
    const args = Array.isArray(node.args) ? node.args : []
    // A word that takes an arrow is handed one written in place, never a value that a read gave.
    const takesArrow = name === 'each' || name === 'all'
    if (takesArrow && !(isStored(args[1]) && 'arrow' in args[1]))
      return [`\`${name}\` handed no arrow written in place`]
    return args.flatMap((one, i) => valueMisses(one, name === 'fill' && i === 0))
  }
  if ('arrow' in node) return statementMisses(node.do)
  const form = valueForms.find((one) => one in node)
  if (!form) return [`the form with ${Object.keys(node).join(', ') || 'no member'}`]
  return Object.entries(node).flatMap(([key, value]) =>
    key === 'name' || key === 'path' ? pathMisses(value) : valueMisses(value),
  )
}

/** The misses of a path of a read: names, places and places that are worked out. */
const pathMisses = (path: unknown): string[] =>
  (Array.isArray(path) ? path : []).flatMap((one) => (isStored(one) ? valueMisses(one) : []))

const statementForms = ['const', 'for', 'if', 'return', 'do']

/** The misses of a list of stored statements. */
function statementMisses(list: unknown): string[] {
  if (!Array.isArray(list)) return ['statements that are no list']
  return list.flatMap((statement) => {
    if (!isStored(statement)) return ['a statement that is no record']
    const form = statementForms.find((one) => one in statement)
    if (!form) return [`the statement with ${Object.keys(statement).join(', ') || 'no member'}`]
    const misses: string[] = []
    if (form === 'const') misses.push(...valueMisses(statement.value))
    if (form === 'for') misses.push(...valueMisses(statement.of), ...statementMisses(statement.do))
    if (form === 'if')
      misses.push(
        ...valueMisses(statement.if),
        ...statementMisses(statement.then),
        ...(statement.else === undefined ? [] : statementMisses(statement.else)),
      )
    if (form === 'return' || form === 'do') misses.push(...valueMisses(statement[form]))
    return misses
  })
}

/**
 * Takes what was read of a sequence. Answers each form in it that the shape of a sequence does not hold, in words:
 * empty where it fits. The shape holds the forms of a body, with a call of a tool, and no named value, no chain, no
 * setting, no reference, no call of a definition and no word that asks the engine.
 */
export const sequenceShape = (body: unknown): string[] => statementMisses(body)
