import type { Opened } from '../opened.ts'

/** Who a thing is counted by: only what a limit rests on, the app as a whole, or each caller. */
export type CountBy = 'limits' | 'app' | 'caller'

const order: CountBy[] = ['limits', 'app', 'caller']

/** Whether a value is one of the three ways of counting. */
const isCountBy = (value: unknown): value is CountBy => order.some((one) => one === value)

/** The more of two ways of counting, in the order `'limits'`, `'app'`, `'caller'`. */
const more = (one: CountBy, other: CountBy): CountBy => (order.indexOf(one) >= order.indexOf(other) ? one : other)

/**
 * How a thing of an app is counted: what the definition that it is states, or else the project, or `'app'`. What
 * the host opened the app with is the least that is counted, so no bundle counts less than its host asked.
 */
export function countByOf(o: Opened, definition?: string): CountBy {
  const { functions, flows, project } = o.description
  const record =
    definition === undefined
      ? undefined
      : Object.hasOwn(functions, definition)
        ? functions[definition]
        : Object.hasOwn(flows, definition)
          ? flows[definition]
          : undefined
  const stated = isCountBy(record?.countBy) ? record.countBy : isCountBy(project.countBy) ? project.countBy : 'app'
  const host = o.counting?.countBy
  return host ? more(stated, host) : stated
}
