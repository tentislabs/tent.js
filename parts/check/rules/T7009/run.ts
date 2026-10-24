import type { Node } from '../../../build/index.ts'
import { child, kid, kids, unwrap, word } from '../../../build/index.ts'
import type { Finding } from '../../../core/index.ts'
import { answersOf, isFunction } from '../../code.ts'
import type { Rule } from '../../rule.ts'
import { arrowOf, at, writtenIn } from '../../rule.ts'
import { answerUsed } from '../../usedAnswer.ts'

/** Whether an expression plainly answers a record: one written in place, a list that holds one, or a `map` to them. */
function aRecord(node: Node): boolean {
  const value = unwrap(node)
  if (value.type === 'ObjectExpression') return true
  if (value.type === 'ArrayExpression') return kids(value, 'elements').some(aRecord)
  if (value.type === 'AwaitExpression') {
    const awaited = kid(value, 'argument')
    return awaited ? aRecord(awaited) : false
  }
  if (value.type === 'ConditionalExpression' || value.type === 'LogicalExpression')
    return ['consequent', 'alternate', 'left', 'right'].some((side) => {
      const one = kid(value, side)
      return one !== undefined && aRecord(one)
    })
  if (value.type !== 'CallExpression') return false
  const callee = unwrap(child(value, 'callee'))
  const [mapped] = kids(value, 'arguments')
  const made = mapped ? unwrap(mapped) : undefined
  return (
    callee.type === 'MemberExpression' &&
    word(kid(callee, 'property'), 'name') === 'map' &&
    made !== undefined &&
    isFunction(made) &&
    answersOf(made).some(aRecord)
  )
}

// What a query or a change written with `run` answers where it states no `output`, as the engine leaves it.
const left = {
  query: 'answers rows as `db` handed them, or a number',
  change: 'answers nothing',
}

/**
 * A query written with `run` that answers a record and states no `output`, and a change written so whose answer
 * code takes: the engine lets no record of a query's own leave, and a change written so answers nothing.
 */
export const rule: Rule = {
  code: 'T7009',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    for (const one of writtenIn(source)) {
      if (one.word !== 'query' && one.word !== 'change') continue
      const record = Object.hasOwn(description.functions, one.name) ? description.functions[one.name] : undefined
      const arrow = arrowOf(one, 'run')
      if (!record || record.output !== undefined || !arrow || !answersOf(arrow).some(aRecord)) continue
      // What a change answers matters only where code takes it.
      if (one.word === 'change' && !answerUsed(one, source)) continue
      found.push(
        at(
          'T7009',
          one,
          undefined,
          one.word === 'query'
            ? 'the query is written with `run` and answers a record, and states no `output`.'
            : 'the change is written with `run` and answers a record that code takes, and states no `output`.',
          `State \`output\`: the type of what it answers. Without one a ${one.word} written with \`run\` ${left[one.word]}.`,
        ),
      )
    }
    return found
  },
}
