import { date, number, table, text } from '../../core/index.ts'
import { countsLayout } from '../../core/internal.ts'

/** What a program builds a read of the counts from: a filter, a grouping with its sums, a bound. */
export interface CountsPlan {
  readonly plan: object
  where(filter: object): CountsPlan
  group(by: string | readonly string[], sums?: object): CountsPlan
  limit(most: number): CountsPlan
}

/**
 * `counts` of `tentjs/engine`: the engine's table of counts as a table for a program that holds apps, which reads
 * it with `app.read` as the system alone and never writes it: `app.read(counts.where({ day }), { as: 'system' })`.
 */
export const counts: CountsPlan = table(countsLayout.name, {
  columns: {
    day: date(),
    name: text(),
    answeredBy: text(),
    caller: text(),
    user: text({ optional: true }),
    unit: text(),
    amount: number(),
  },
  access: { read: 'nobody' },
})
