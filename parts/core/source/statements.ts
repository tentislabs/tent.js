import type { Stored } from '../record.ts'
import { isStored } from '../record.ts'
import type { Doc } from './doc.ts'
import { block, firstSign } from './doc.ts'
import { exprDoc } from './expr.ts'
import type { Writing } from './writing.ts'

/** Whether a stored value is an arrow that was written where it was handed to a word. */
export const isArrow = (value: unknown): value is Stored =>
  isStored(value) && Array.isArray(value.arrow) && Array.isArray(value.do)

/** One stored statement as its lines. */
function statementDoc(w: Writing, statement: unknown): Doc {
  if (!isStored(statement)) return ''
  const s = statement
  if ('const' in s) {
    const names = Array.isArray(s.const) ? `{ ${s.const.join(', ')} }` : String(s.const)
    return [`const ${names} = `, exprDoc(w, s.value)]
  }
  if ('if' in s) {
    const made: Doc[] = ['if (', exprDoc(w, s.if), ') ', blockDoc(w, s.then)]
    if (Array.isArray(s.else)) made.push(' else ', blockDoc(w, s.else))
    return made
  }
  if (typeof s.for === 'string') return [`for (const ${s.for} of `, exprDoc(w, s.of), ') ', blockDoc(w, s.do)]
  if ('return' in s)
    return isStored(s.return) && s.return.nothing === true ? 'return' : ['return ', exprDoc(w, s.return)]
  const value = exprDoc(w, s.do)
  const first = firstSign(value)
  // A record at the start of a line would read as a block, and a bracket or a backtick would go on the line before.
  if (first === '{') return ['(', value, ')']
  return '([`'.includes(first) && first !== '' ? [';', value] : value
}

/** A list of stored statements between curly brackets, each on a line of its own. */
const blockDoc = (w: Writing, statements: unknown): Doc =>
  block(
    '{',
    (Array.isArray(statements) ? statements : []).map((one) => statementDoc(w, one)),
    '}',
  )

/** What an arrow gives, as it is written after `=>`: one value for a body of one `return`, and a block otherwise. */
export function givenDoc(w: Writing, body: unknown[]): Doc {
  const [only] = body
  const answers =
    body.length === 1 && isStored(only) && 'return' in only && !(isStored(only.return) && only.return.nothing)
  if (!answers) return blockDoc(w, body)
  const value = exprDoc(w, isStored(only) ? only.return : undefined)
  return firstSign(value) === '{' ? ['(', value, ')'] : value
}

/**
 * Takes a stored arrow. Answers it as it is written: its names in round brackets, `async` in front of one that
 * waits, and what it gives.
 */
export function arrowDoc(w: Writing, arrow: Stored): Doc {
  const names = (Array.isArray(arrow.arrow) ? arrow.arrow : []).map(String).join(', ')
  return [`${arrow.waits === true ? 'async ' : ''}(${names}) => `, givenDoc(w, Array.isArray(arrow.do) ? arrow.do : [])]
}
