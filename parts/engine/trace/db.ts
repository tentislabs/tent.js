import type { Traced } from '../../data/index.ts'
import type { Opened } from '../opened.ts'
import { noteTouched } from '../touched.ts'
import type { Span } from './span.ts'
import { endSpan, insideSpan, openSpan, spanNow } from './span.ts'

// The most reads and writes of `db` that one span holds as spans of their own: a call that reads a thousand times
// in a loop counts the rest in a fact of its span, and its trace stays one that a write of the log can hold.
const most = 100

// How many reads and writes of `db` each span holds as spans of their own.
const held = new WeakMap<Span, number>()

/** How many rows an answer of a read holds: a list, a page of rows, one row, or nothing. */
function rowsIn(answer: unknown): number {
  if (Array.isArray(answer)) return answer.length
  const rows: unknown = Reflect.get(Object(answer), 'rows')
  if (Array.isArray(rows)) return rows.length
  return typeof answer === 'object' && answer !== null ? 1 : 0
}

/**
 * Takes an app, a read or a write of `db`, and its work. Carries the work out as a span of the trace under way, with
 * the table it is on and the count of rows it read or wrote: a write is of one row. Where no trace is under way it
 * is carried out as it is, and past the first hundred of one span each is counted in the fact `dbMore` of that span.
 */
export function dbSpan<Answer>(o: Opened, what: Traced, work: () => Answer): Answer {
  // Under `tent test`, the table that the test read or wrote, through whatever work of the app.
  noteTouched(what.kind === 'write' ? 'wrote' : 'read', what.table)
  const parent = spanNow()
  if (!parent) return work()
  const count = held.get(parent) ?? 0
  if (count >= most) {
    parent.facts.dbMore = Number(parent.facts.dbMore ?? 0) + 1
    return work()
  }
  held.set(parent, count + 1)
  const span = openSpan(o, {
    name: what.write ? `${what.table}.${what.write}` : what.table,
    kind: what.kind,
    facts: { table: what.table },
    inside: true,
  })
  if (!span) return work()
  let answer: Answer
  try {
    answer = insideSpan(span, work)
  } catch (error) {
    endSpan(span, error)
    throw error
  }
  span.facts.rows = what.kind === 'write' ? 1 : rowsIn(answer)
  endSpan(span)
  return answer
}
