import type { History, Point } from '../../history/index.ts'
import { oldestFirst } from '../send.ts'

/** Every point that a point comes from, itself among them, as far as the history holds them. */
export function ancestry(history: History, id: string | undefined): Set<string> {
  const seen = new Set<string>()
  const open = id === undefined ? [] : [id]
  for (let at = open.pop(); at !== undefined; at = open.pop()) {
    if (seen.has(at)) continue
    const point = history.read(at)
    if (!point) continue
    seen.add(at)
    open.push(...point.parents)
  }
  return seen
}

/**
 * The points that lead to a point and that are not among those a caller holds, each after its parents: the walk
 * stops at a point the caller holds, since it holds what that point comes from.
 */
export function leadingTo(history: History, head: string, held: ReadonlySet<string>): Point[] {
  const found = new Map<string, Point>()
  const open = [head]
  for (let at = open.pop(); at !== undefined; at = open.pop()) {
    if (found.has(at) || held.has(at)) continue
    const point = history.read(at)
    if (!point) continue
    found.set(at, point)
    open.push(...point.parents)
  }
  return oldestFirst(found)
}

/** Whether a point comes from another, or is it. */
export const comesFrom = (history: History, id: string, from: string): boolean => ancestry(history, id).has(from)
