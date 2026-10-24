import type { Rule } from '../rule.ts'
import { at, writtenIn } from '../rule.ts'
import { isStored } from '../../core/internal.ts'

/** A live query whose plan states no limit: every change of its table sends every row again. */
export const rule: Rule = {
  code: 'T4004',
  needs: ['description', 'source'],
  run: ({ description, source }) =>
    writtenIn(source)
      .filter((one) => one.word === 'query')
      .flatMap((query) => {
        const stored = description.functions[query.name]
        const plan = isStored(stored?.plan) ? stored.plan : undefined
        // One row, a count and the groups of a plan are bounded by what they are.
        const bounded =
          !plan || plan.limit !== undefined || plan.one !== undefined || plan.count === true || plan.group !== undefined
        if (stored?.live === false || bounded) return []
        return [
          at(
            'T4004',
            query,
            undefined,
            'the query is live and its plan states no limit, so a page that watches it is sent every row of the table.',
            'State a `limit`, or `live: false`.',
          ),
        ]
      }),
}
