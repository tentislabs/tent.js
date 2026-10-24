import type { SqliteFile } from '../data/index.ts'
import type { Change } from './compare/change.ts'
import { readPoint } from './rows.ts'

/** What a point changed against its first parent, as it was kept, or nothing where none is kept. */
export function keptChanges(file: SqliteFile, point: string, parent: string): Change[] | undefined {
  const [row] = file.all('SELECT changes FROM changed WHERE point = ? AND parent = ?', [point, parent])
  const text: unknown = row ? Reflect.get(row, 'changes') : undefined
  return typeof text === 'string' ? JSON.parse(text) : undefined
}

/**
 * Keeps what a point changed against its first parent, in the write that records or marks it, and moves the row
 * of each thing it changed to it: so what changed, and who changed it last, is read and not worked out again.
 * `compared` makes the compare of the two points. A point with no parent, or whose parent holds no files any more,
 * keeps nothing.
 */
export function keepChanges(file: SqliteFile, id: string, compared: (a: string, b: string) => Change[]): void {
  const point = readPoint(file, id)
  const parent = point?.parents[0]
  if (!point?.files || parent === undefined || !readPoint(file, parent)?.files) return
  file.run('DELETE FROM changed WHERE point = ?', [id])
  let changes: Change[]
  try {
    changes = compared(parent, id)
  } catch {
    // A point whose bytes are not all here yet keeps nothing: what it changed is worked out when it is asked.
    return
  }
  file.run('INSERT INTO changed (point, parent, changes) VALUES (?, ?, ?)', [id, parent, JSON.stringify(changes)])
  for (const change of changes)
    file.run(
      'INSERT INTO newest (what, name, point) VALUES (?, ?, ?) ON CONFLICT (what, name) DO UPDATE SET point = excluded.point',
      [change.what, change.name, id],
    )
}

/**
 * Takes away what a point that is gone kept: its list, and the row of each thing that named it as the newest to
 * change it, which names the newest point left that changed that thing, from the kept lists alone.
 */
export function forgetChanges(file: SqliteFile, id: string): void {
  file.run('DELETE FROM changed WHERE point = ?', [id])
  const left = new Set(
    file
      .all('SELECT what, name FROM newest WHERE point = ?', [id])
      .map((row) => JSON.stringify([Reflect.get(row, 'what'), Reflect.get(row, 'name')])),
  )
  if (!left.size) return
  file.run('DELETE FROM newest WHERE point = ?', [id])
  const lists = file.all(
    'SELECT changed.point, changed.changes FROM changed JOIN points ON points.id = changed.point ORDER BY points.at DESC',
    [],
  )
  for (const row of lists) {
    if (!left.size) return
    const point = String(Reflect.get(row, 'point'))
    const changes: Change[] = JSON.parse(String(Reflect.get(row, 'changes')))
    for (const change of changes) {
      const key = JSON.stringify([change.what, change.name])
      if (!left.delete(key)) continue
      file.run('INSERT INTO newest (what, name, point) VALUES (?, ?, ?)', [change.what, change.name, point])
    }
  }
}

/** The newest point that changed a thing of a name, from the row kept for it: of several kinds of that name, the newest. */
export function changedBy(file: SqliteFile, name: string): string | undefined {
  const [row] = file.all(
    'SELECT newest.point FROM newest JOIN points ON points.id = newest.point WHERE newest.name = ? ORDER BY points.at DESC LIMIT 1',
    [name],
  )
  const point: unknown = row ? Reflect.get(row, 'point') : undefined
  return typeof point === 'string' ? point : undefined
}

/**
 * What each point changed from one point to another along the first parents of the later, as it was kept, oldest
 * first: the earlier point left out. Nothing where the earlier is not one of them, or where a point between keeps
 * no list. It reads the kept lists alone.
 */
export function keptBetween(file: SqliteFile, from: string, to: string): Change[][] | undefined {
  const kept = new Map<string, { parent: string; changes: string }>()
  for (const row of file.all('SELECT point, parent, changes FROM changed', []))
    kept.set(String(Reflect.get(row, 'point')), {
      parent: String(Reflect.get(row, 'parent')),
      changes: String(Reflect.get(row, 'changes')),
    })
  const lists: Change[][] = []
  for (let at = to; at !== from; ) {
    const one = kept.get(at)
    if (!one) return undefined
    lists.push(JSON.parse(one.changes))
    at = one.parent
  }
  return lists.reverse()
}
