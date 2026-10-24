import type { SqliteFile } from '../data/index.ts'

/** What a pointer holds, or nothing where the history holds no pointer of that name. */
export function pointerOf(file: SqliteFile, name: string): string | undefined {
  const [row] = file.all('SELECT value FROM pointers WHERE name = ?', [name])
  const value: unknown = row ? Reflect.get(row, 'value') : undefined
  return typeof value === 'string' ? value : undefined
}

/** Sets a pointer. */
export function setPointer(file: SqliteFile, name: string, value: string): void {
  file.run('INSERT INTO pointers (name, value) VALUES (?, ?) ON CONFLICT (name) DO UPDATE SET value = excluded.value', [
    name,
    value,
  ])
}

/** Every pointer with what it holds, in the order of the names. */
export const allPointers = (file: SqliteFile): Record<string, string> =>
  Object.fromEntries(
    file
      .all('SELECT name, value FROM pointers ORDER BY name', [])
      .map((row) => [String(Reflect.get(row, 'name')), String(Reflect.get(row, 'value'))]),
  )

/** Moves `now` to a point, and with it the branch that `on` names, which `now` follows. */
export function follow(file: SqliteFile, id: string): void {
  setPointer(file, 'now', id)
  const on = pointerOf(file, 'on')
  if (on !== undefined) setPointer(file, on, id)
}

/**
 * The names of the pointers that stand on a point, but for `now` and the branch that follows it. `on` holds the
 * name of a branch and stands on no point.
 */
export function standingOn(file: SqliteFile, id: string): string[] {
  const on = pointerOf(file, 'on')
  return Object.entries(allPointers(file))
    .filter(([name, value]) => value === id && name !== 'now' && name !== 'on' && name !== on)
    .map(([name]) => name)
}

/**
 * The branches with the point each stands on: every pointer but `now`, `on`, and those whose name holds a colon,
 * which say where a target stood.
 */
export const branches = (file: SqliteFile): Record<string, string> =>
  Object.fromEntries(
    Object.entries(allPointers(file)).filter(([name]) => name !== 'now' && name !== 'on' && !name.includes(':')),
  )
