import type { SqliteFile } from '../data/index.ts'
import { missing } from './missing.ts'
import type { Kind, Point } from './point.ts'
import { pointerOf } from './pointers.ts'
import { pointsWhere, readPoint } from './rows.ts'

/**
 * Takes a word. Answers the point it names: `now`, a pointer, the newest point of that name, or the one point
 * whose id starts with it, where the word is 8 or more characters of an id, tried in that order. Answers nothing
 * where it names none.
 */
export function find(file: SqliteFile, word: string): Point | undefined {
  const pointed = pointerOf(file, word)
  // `on` holds the name of a branch, which is a pointer itself.
  const stands =
    pointed === undefined ? undefined : readPoint(file, word === 'on' ? (pointerOf(file, pointed) ?? '') : pointed)
  if (stands) return stands
  const [named] = pointsWhere(file, 'WHERE name = ? ORDER BY at DESC LIMIT 1', [word])
  if (named) return named
  if (!/^[0-9a-f]{8,32}$/.test(word)) return undefined
  // Two points that start alike are told apart by no word that fits both.
  const starting = pointsWhere(file, 'WHERE id >= ? AND id < ? LIMIT 2', [word, `${word}g`])
  return starting.length === 1 ? starting[0] : undefined
}

/** The point that a word names. Throws T9107 where it names none. */
export function found(file: SqliteFile, word: string): Point {
  const point = find(file, word)
  if (!point) throw missing('point', word, `The history holds no point that \`${word}\` names.`)
  return point
}

/**
 * Answers the points along the first parents, newest first, from the point that a pointer stands on, which is
 * `now` where none is named: all of them, those of the named kinds, and of those the newest ones where a number is
 * given.
 */
export function list(file: SqliteFile, o: { pointer?: string; kinds?: Kind[]; newest?: number } = {}): Point[] {
  const points: Point[] = []
  const seen = new Set<string>()
  let at = pointerOf(file, o.pointer ?? 'now')
  while (at !== undefined && !seen.has(at) && (o.newest === undefined || points.length < o.newest)) {
    seen.add(at)
    const point = readPoint(file, at)
    if (!point) break
    if (!o.kinds || o.kinds.includes(point.kind)) points.push(point)
    at = point.parents[0]
  }
  return points
}
