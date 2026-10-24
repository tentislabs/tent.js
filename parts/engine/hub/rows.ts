import { answerMark } from '../mark.ts'
import { isStored } from '../../core/internal.ts'

/** What the hub keeps of a list of rows that it sent: the order of the ids, and a mark of each row. No row itself. */
export interface KeptRows {
  ids: string[]
  marks: Map<string, string>
}

/** A list of rows as an answer holds it: the rows, each written as JSON, and what a page of them names as its next. */
export interface ListedRows {
  kept: KeptRows
  texts: string[]
  // Whether the answer is a page `{ rows, next }`, and the text of its `next` where it has one.
  page: boolean
  next?: string
}

/**
 * Takes an answer. Answers its list where the answer is a list of rows that each hold an `id` of their own, or a
 * page `{ rows, next }` of them, and no two rows hold the same `id`. Nothing for any other answer: one row, a
 * number, a record that code built, a list of other things.
 */
export function listedIn(value: unknown): ListedRows | undefined {
  const page =
    isStored(value) && Array.isArray(value.rows) && Object.keys(value).every((key) => key === 'rows' || key === 'next')
  const rows: unknown = page ? value.rows : value
  if (!Array.isArray(rows)) return undefined
  const ids: string[] = []
  const marks = new Map<string, string>()
  const texts: string[] = []
  for (const row of rows) {
    if (!isStored(row) || typeof row.id !== 'string' || marks.has(row.id)) return undefined
    const text = JSON.stringify(row)
    ids.push(row.id)
    marks.set(row.id, answerMark(text))
    texts.push(text)
  }
  const next = page && value.next !== undefined ? JSON.stringify(value.next) : undefined
  return { kept: { ids, marks }, texts, page, ...(next === undefined ? {} : { next }) }
}

/**
 * Takes a row of numbers. Answers the places of one longest run of them that rises from each to the next, in
 * their order.
 */
function longestRising(values: number[]): number[] {
  // The place of the smallest value that ends a rising run of each length, and for each place the one before it.
  const ends: number[] = []
  const before = new Array<number>(values.length).fill(-1)
  for (let at = 0; at < values.length; at++) {
    let [low, high] = [0, ends.length]
    while (low < high) {
      const middle = (low + high) >> 1
      if (values[ends[middle]] < values[at]) low = middle + 1
      else high = middle
    }
    if (low > 0) before[at] = ends[low - 1]
    ends[low] = at
  }
  const run: number[] = []
  for (let at = ends.length ? ends[ends.length - 1] : -1; at >= 0; at = before[at]) run.push(at)
  return run.reverse()
}

/**
 * Takes what was kept of the list that a page holds, and the list as it is now. Answers what changed: the places,
 * in the new list, of the rows that are new, changed or moved, and the ids of the rows that left. It names enough
 * rows that those it does not name keep their order among themselves: the rows it leaves unnamed are a longest
 * run of unchanged rows that stand in the old order.
 */
export function changedIn(was: KeptRows, now: KeptRows): { put: number[]; removed: string[] } {
  const oldPlace = new Map(was.ids.map((id, place) => [id, place]))
  // The rows that stand in both lists with the same content, by their place in the new list and in the old one.
  const same: { place: number; old: number }[] = []
  now.ids.forEach((id, place) => {
    const old = oldPlace.get(id)
    if (old !== undefined && was.marks.get(id) === now.marks.get(id)) same.push({ place, old })
  })
  const stay = new Set(longestRising(same.map((one) => one.old)).map((at) => same[at].place))
  const put = now.ids.flatMap((_, place) => (stay.has(place) ? [] : [place]))
  const removed = was.ids.filter((id) => !now.marks.has(id))
  return { put, removed }
}
