import type { Finding } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import { isBare } from '../bare.ts'
import { columnsOf, reached } from '../columns.ts'
import type { Rule } from '../rule.ts'
import { at, writtenIn } from '../rule.ts'
import { isStored } from '../../core/internal.ts'

/** The columns of a table that hold data about a person. */
const personal = (description: Description, table: string): string[] =>
  Object.entries(columnsOf(description, table))
    .filter(([, type]) => type.personal === true)
    .map(([name]) => `${table}.${name}`)

/** The personal columns that a query reads, as far as the description says what it reads. */
function read(description: Description, fn: Record<string, unknown>): string[] {
  const plan = isStored(fn.plan) ? fn.plan : undefined
  // A plan that picks its columns reads those, and no other.
  if (plan && Array.isArray(plan.pick))
    return plan.pick.flatMap((name) => {
      const column = reached(description, String(plan.from), String(name))
      return column?.type.personal === true ? [`${column.table}.${column.column}`] : []
    })
  return (Array.isArray(fn.reads) ? fn.reads : []).flatMap((table) => personal(description, String(table)))
}

const fix = "Write the reason down, `anyone('why')`, or let fewer callers in: 'signedIn', 'owner', `role(...)`."

/** Bare 'anyone' on a read of personal data: on `read` of a table with a personal column, and on a query that reads one. */
export const rule: Rule = {
  code: 'T3003',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    for (const one of writtenIn(source)) {
      if (one.word === 'table' && Object.hasOwn(description.tables, one.name)) {
        const access = description.tables[one.name].access
        const columns = personal(description, one.name)
        if (isStored(access) && isBare(access.read) && columns.length)
          found.push(
            at(
              'T3003',
              one,
              undefined,
              `the rule for "read" is bare 'anyone', and \`${columns.join('`, `')}\` ${columns.length === 1 ? 'is' : 'are'} data about a person.`,
              fix,
            ),
          )
      }
      const fn = Object.hasOwn(description.functions, one.name) ? description.functions[one.name] : undefined
      const columns = fn?.kind === 'query' && isBare(fn.access) ? [...new Set(read(description, fn))] : []
      if (columns.length)
        found.push(
          at(
            'T3003',
            one,
            undefined,
            `the query is open to bare 'anyone', and it reads \`${columns.join('`, `')}\`, data about a person.`,
            fix,
          ),
        )
    }
    return found
  },
}
