import { isStored } from '../../core/internal.ts'
import type { Change } from './change.ts'

/** A stored value as text with the keys of every map in order: two values are the same where their texts are. */
export function textOf(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(textOf).join(',')}]`
  if (!isStored(value)) return JSON.stringify(value) ?? 'null'
  const keys = Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${keys.map((key) => `${JSON.stringify(key)}:${textOf(value[key])}`).join(',')}}`
}

/** The entries of an object the author wrote, by their keys, or nothing for any other value. */
function written(value: unknown): Map<string, unknown> | undefined {
  if (!isStored(value) || !Array.isArray(value.object) || Object.keys(value).length !== 1) return undefined
  const entries = new Map<string, unknown>()
  for (const entry of value.object) if (Array.isArray(entry)) entries.set(String(entry[0]), entry[1])
  return entries
}

/** The name of an entry of a list: its `id`, where it is a record that holds one as text. */
const nameOf = (entry: unknown): string | undefined =>
  isStored(entry) && typeof entry.id === 'string' ? entry.id : undefined

/** Whether every entry of a list has a name, and no two the same: such a list is compared and merged entry by entry. */
export const named = (list: unknown): list is unknown[] => {
  if (!Array.isArray(list) || !list.length) return false
  const names = list.map(nameOf)
  return names.every((name) => name !== undefined) && new Set(names).size === names.length
}

/** The entries of a list whose entries have names, by their names. */
export const byName = (list: unknown[]): Map<string, unknown> =>
  new Map(list.map((entry) => [nameOf(entry) ?? '', entry]))

/**
 * Compares two stored values field by field, and adds a change for each field that differs, by its path. A map is
 * compared entry by entry, and so is an object the author wrote, whose entries have names: their keys, and a list
 * whose entries have names: their ids. A list with no names is compared as one value. `skip` names the fields of
 * the first level that are not compared.
 */
export function fieldChanges(
  changes: Change[],
  about: { what: string; name: string },
  a: unknown,
  b: unknown,
  path: (string | number)[] = [],
  skip: readonly string[] = [],
): void {
  if (textOf(a) === textOf(b)) return
  const [wroteA, wroteB] = [written(a), written(b)]
  if (wroteA && wroteB) {
    for (const key of new Set([...wroteA.keys(), ...wroteB.keys()]))
      fieldChanges(changes, about, wroteA.get(key), wroteB.get(key), [...path, key])
    return
  }
  if (isStored(a) && isStored(b) && !wroteA && !wroteB) {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)]))
      if (!skip.includes(key)) fieldChanges(changes, about, a[key], b[key], [...path, key])
    return
  }
  if (named(a) && named(b)) {
    const [before, after] = [byName(a), byName(b)]
    for (const key of new Set([...before.keys(), ...after.keys()]))
      fieldChanges(changes, about, before.get(key), after.get(key), [...path, key])
    return
  }
  changes.push({
    change: 'changed',
    ...about,
    path,
    ...(a === undefined ? {} : { from: a }),
    ...(b === undefined ? {} : { to: b }),
  })
}
