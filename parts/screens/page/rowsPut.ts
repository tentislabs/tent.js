import { isStored } from '../../core/internal.ts'

/**
 * Takes the answer that a page holds, a list of rows or a page `{ rows, next }` of them, and a `rows` message.
 * Answers the answer as the message leaves it: the rows that left and the rows that are named are taken out,
 * then each named row is put after the row that its `after` names, in the order of the message, one with no
 * `after` first. The `next` of a page is the message's, and is gone where the message holds none. Answers
 * nothing where the message does not fit what the page holds: the held answer is no list, or an `after` names a
 * row that the page does not hold.
 */
export function rowsPut(held: unknown, message: Record<string, unknown>): { value: unknown } | undefined {
  const paged = isStored(held) && Array.isArray(held.rows)
  const list: unknown = paged ? held.rows : held
  if (!Array.isArray(list) || !Array.isArray(message.put) || !Array.isArray(message.removed)) return undefined
  const idOf = (row: unknown): unknown => (isStored(row) ? row.id : undefined)
  const put = message.put.filter(isStored)
  const gone = new Set<unknown>([...message.removed, ...put.map((one) => idOf(one.row))])
  const rows: unknown[] = list.filter((row) => !gone.has(idOf(row)))
  // The place of each row is looked up by its id, and kept as the list grows.
  for (const one of put) {
    let at = 0
    if (one.after !== undefined) {
      at = rows.findIndex((row) => idOf(row) === one.after) + 1
      if (at === 0) return undefined
    }
    rows.splice(at, 0, one.row)
  }
  if (!paged) return { value: rows }
  return { value: { rows, ...(message.next === undefined ? {} : { next: message.next }) } }
}
