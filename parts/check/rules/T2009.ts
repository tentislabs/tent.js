import type { Finding } from '../../core/index.ts'
import { askedOf } from '../asked.ts'
import { writtenByName } from '../columns.ts'
import type { Rule } from '../rule.ts'
import { at } from '../rule.ts'

/** A plan with `near` that states neither `limit` nor `first()`: it would answer every row of the table, nearest first. */
export const rule: Rule = {
  code: 'T2009',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    const written = writtenByName(source)
    for (const asked of askedOf(description)) {
      const place = written.get(asked.definition)
      if (!asked.near || !place || asked.joins.includes('limit') || asked.joins.includes('first')) continue
      found.push(
        at(
          'T2009',
          place,
          undefined,
          `\`near\` on \`${asked.table}.${asked.near.column}\` states neither \`limit\` nor \`first()\`. A search by meaning answers the nearest rows, and says how many.`,
          'State a `limit`, or end the plan with `first()`.',
        ),
      )
    }
    return found
  },
}
