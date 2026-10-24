import { isStored } from '../../core/internal.ts'
import { byName, named, textOf } from '../compare/records.ts'

/** One field that both sides of a merge changed to different values, by its path inside the thing merged. */
export interface FieldApart {
  // A step of a body is a thing of its own: its word and its name, where the clash is of one.
  what?: string
  name?: string
  path: (string | number)[]
  ours: unknown
  theirs: unknown
  base: unknown
}

const same = (a: unknown, b: unknown): boolean => textOf(a) === textOf(b)

/** The entries of an object the author wrote, in their order, or nothing for any other value. */
function entriesOf(value: unknown): [string, unknown][] | undefined {
  if (!isStored(value) || !Array.isArray(value.object) || Object.keys(value).length !== 1) return undefined
  return value.object.flatMap((entry): [string, unknown][] =>
    Array.isArray(entry) ? [[String(entry[0]), entry[1]]] : [],
  )
}

/**
 * Merges names in order: ours first, each of theirs that ours lacks after the name that stands before it on their
 * side, so a new entry stands where its side wrote it.
 */
function namesInOrder(ours: string[], theirs: string[]): string[] {
  const order = [...ours]
  for (const [k, name] of theirs.entries()) {
    if (order.includes(name)) continue
    const before = theirs
      .slice(0, k)
      .reverse()
      .find((one) => order.includes(one))
    order.splice(before === undefined ? 0 : order.indexOf(before) + 1, 0, name)
  }
  return order
}

/**
 * Merges three stored values: the one the two sides share, ours and theirs. What only one side changed is taken
 * from it. Where both changed it, a record, an object the author wrote and a list whose entries have names merge
 * entry by entry, and anything else is a clash, where ours is kept. Each clash is added to `apart`. Answers the
 * merged value, which is nothing where it is removed.
 */
export function mergeValue(
  base: unknown,
  ours: unknown,
  theirs: unknown,
  apart: FieldApart[],
  path: (string | number)[] = [],
): unknown {
  if (same(ours, theirs) || same(base, theirs)) return ours
  if (same(base, ours)) return theirs
  const [entriesA, entriesB] = [entriesOf(ours), entriesOf(theirs)]
  if (entriesA && entriesB) {
    const was = new Map(entriesOf(base) ?? [])
    const [mine, yours] = [new Map(entriesA), new Map(entriesB)]
    const object: [string, unknown][] = []
    for (const key of namesInOrder([...mine.keys()], [...yours.keys()])) {
      const value = mergeValue(was.get(key), mine.get(key), yours.get(key), apart, [...path, key])
      if (value !== undefined) object.push([key, value])
    }
    return { object }
  }
  if (isStored(ours) && isStored(theirs) && !entriesA && !entriesB) {
    const was = isStored(base) ? base : {}
    const merged: Record<string, unknown> = {}
    for (const key of new Set([...Object.keys(ours), ...Object.keys(theirs)])) {
      const value = mergeValue(was[key], ours[key], theirs[key], apart, [...path, key])
      if (value !== undefined) merged[key] = value
    }
    return merged
  }
  if (named(ours) && named(theirs) && (base === undefined || named(base))) {
    const [was, mine, yours] = [byName(Array.isArray(base) ? base : []), byName(ours), byName(theirs)]
    const list: unknown[] = []
    for (const name of namesInOrder([...mine.keys()], [...yours.keys()])) {
      const value = mergeValue(was.get(name), mine.get(name), yours.get(name), apart, [...path, name])
      if (value !== undefined) list.push(value)
    }
    return list
  }
  apart.push({ path, ours, theirs, base })
  return ours
}
