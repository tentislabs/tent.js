import type { Change, History } from '../../history/index.ts'
import { ancestry } from './walk.ts'

/** The path of what one change changed: the definition, then the part inside it, so that one can stand inside another. */
function pathOf(change: Change): string[] {
  const inside = (change.path ?? []).map(String)
  if (change.what === 'file') return [`file:${change.name}`]
  const [owner, ...rest] = change.name.split('.')
  if (change.what === 'column') return [owner, 'columns', rest.join('.'), ...inside]
  if (change.what === 'step') return [owner, 'step', rest.join('.')]
  // A definition that was added, removed, renamed or whose code changed is changed whole.
  return change.change === 'changed' && change.lines === undefined ? [change.name, ...inside] : [change.name]
}

/**
 * The paths of what the points after one point changed, up to another, each against its first parent as the
 * history kept it. A point of a merge brings what its other side changed, which that side's own points name.
 */
export function pathsChanged(history: History, from: string | undefined, to: string): string[][] {
  const before = ancestry(history, from)
  const paths: string[][] = []
  for (const id of ancestry(history, to)) {
    if (before.has(id)) continue
    const point = history.read(id)
    if (point?.parents.length !== 1) continue
    for (const change of history.compare(point.parents[0], id)) paths.push(pathOf(change))
  }
  return paths
}

/** Whether one path is the other, or stands inside it. */
const within = (a: string[], b: string[]): boolean =>
  a.length <= b.length ? a.every((one, k) => b[k] === one) : b.every((one, k) => a[k] === one)

/** A path that both lists touch, or nothing where no path of one is a path of the other or inside it. */
export function touchedByBoth(ours: string[][], theirs: string[][]): string[] | undefined {
  for (const a of ours) for (const b of theirs) if (within(a, b)) return a.length >= b.length ? a : b
  return undefined
}
