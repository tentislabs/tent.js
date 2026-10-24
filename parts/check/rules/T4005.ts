import type { Node } from '../../build/index.ts'
import { unwrap } from '../../build/index.ts'
import type { Finding } from '../../core/index.ts'
import { callsIn } from '../code.ts'
import { viewOf } from '../ofViews.ts'
import type { Rule, Written } from '../rule.ts'
import { arrowOf, at, inside, writtenIn } from '../rule.ts'
import { statedAt } from '../stated.ts'
import { isView } from '../tags.ts'
import { isStored } from '../../core/internal.ts'

/** Whether a stored value holds an `each` whose arrow was written `async`. */
function waits(stored: unknown): boolean {
  let found = false
  inside(stored, (record) => {
    const arrow = record.fn === 'each' && Array.isArray(record.args) ? record.args[1] : undefined
    if (isStored(arrow) && arrow.waits === true) found = true
  })
  return found
}

const each = (one: Written, where: string): Finding =>
  at(
    'T4005',
    one,
    undefined,
    `${where} hands \`each\` an arrow that is written \`async\`, where nothing may be waited for.`,
    'Take `async` away: the arrow answers its value at once.',
  )

/** Whether a piece of code hands `each` an arrow that is written `async`. */
const waitsIn = (code: Node | undefined): boolean =>
  (code ? callsIn(code) : []).some(
    (call) => call.name === 'each' && call.args[1] !== undefined && unwrap(call.args[1]).async === true,
  )

/**
 * An `async` `run` on a query or a change, and an `async` arrow handed to `each` in a query, a change, a rule, and
 * the `data` and the view of a screen and of a component.
 */
export const rule: Rule = {
  code: 'T4005',
  needs: ['description', 'source'],
  run: ({ description, source }) =>
    writtenIn(source).flatMap((one) => {
      const found: Finding[] = []
      const stored = description.functions[one.name]
      const table = Object.hasOwn(description.tables, one.name) ? description.tables[one.name].access : undefined
      const rules = [stored?.access, ...Object.values(isStored(table) ? table : {})]
      if (one.word === 'table' || one.word === 'query' || one.word === 'change' || one.word === 'action')
        if (waits(rules)) found.push(each(one, 'a rule'))
      if (isView(one))
        for (const option of ['data', 'view'])
          if (waits(viewOf(description, one)[option]) || waitsIn(statedAt(one, [option])))
            found.push(each(one, `the \`${option}\` of a ${one.word}`))
      if (one.word !== 'query' && one.word !== 'change') return found
      const run = arrowOf(one, 'run')
      if (run?.async === true)
        found.push(
          at(
            'T4005',
            one,
            run,
            `the \`run\` of a ${one.word} is written \`async\`. A ${one.word} answers at once, and waits for nothing.`,
            `Take \`async\` away. What must be waited for belongs in an action, which calls the ${one.word}.`,
          ),
        )
      if (waits(stored?.body) || (stored?.form === 'code' && waitsIn(run)))
        found.push(each(one, `the \`run\` of a ${one.word}`))
      return found
    }),
}
