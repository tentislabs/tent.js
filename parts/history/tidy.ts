import type { SqliteFile } from '../data/index.ts'
import { allPointers, branches } from './pointers.ts'

/** Every point with its parents, by its id. */
export function parentsOf(file: SqliteFile): Map<string, string[]> {
  const all = new Map<string, string[]>()
  for (const row of file.all('SELECT id, parents FROM points', []))
    all.set(String(Reflect.get(row, 'id')), JSON.parse(String(Reflect.get(row, 'parents'))))
  return all
}

/** A point with every point it comes from. */
export function ancestors(parents: Map<string, string[]>, id: string): Set<string> {
  const seen = new Set<string>()
  const open = [id]
  for (let at = open.pop(); at !== undefined; at = open.pop()) {
    if (seen.has(at)) continue
    seen.add(at)
    open.push(...(parents.get(at) ?? []))
  }
  return seen
}

/** The newest points that two points both come from: those that both come from, and that no other such point comes from. */
export function shared(parents: Map<string, string[]>, a: Set<string>, b: Set<string>): string[] {
  const both = [...a].filter((id) => b.has(id))
  const older = new Set(both.flatMap((id) => parents.get(id) ?? []))
  return both.filter((id) => !older.has(id))
}

/**
 * Takes the present moment and how long a point is kept. Drops each point of the kinds `save` and `command` that
 * is older, but for one that a pointer stands on and for the newest point that two branches share: it keeps its
 * row, with its id and its parents, and loses its files, its description and its note. Then removes each blob that
 * no point names any more. Answers how many points were dropped and how many blobs were removed.
 */
export function tidy(file: SqliteFile, now: number, o: { kept: number }): { points: number; blobs: number } {
  return file.write(() => {
    const stays = new Set(Object.entries(allPointers(file)).flatMap(([name, value]) => (name === 'on' ? [] : [value])))
    const parents = parentsOf(file)
    const heads = [...new Set(Object.values(branches(file)))].map((id) => ancestors(parents, id))
    for (const [k, a] of heads.entries())
      for (const b of heads.slice(k + 1)) for (const id of shared(parents, a, b)) stays.add(id)

    const old = file.all(
      "SELECT id FROM points WHERE kind IN ('save', 'command') AND at < ? AND files IS NOT NULL ORDER BY at",
      [now - o.kept],
    )
    let points = 0
    for (const row of old) {
      const id = String(Reflect.get(row, 'id'))
      if (stays.has(id)) continue
      file.run(
        'UPDATE points SET files = NULL, description = NULL, note = NULL, checked = NULL, clashes = NULL WHERE id = ?',
        [id],
      )
      points++
    }

    const named = new Set<string>()
    for (const row of file.all(
      'SELECT files, description FROM points WHERE files IS NOT NULL OR description IS NOT NULL',
      [],
    )) {
      const description: unknown = Reflect.get(row, 'description')
      if (typeof description === 'string') named.add(description)
      const written: unknown = Reflect.get(row, 'files')
      const files: Record<string, string> = typeof written === 'string' ? JSON.parse(written) : {}
      for (const print of Object.values(files)) named.add(print)
    }
    let blobs = 0
    for (const row of file.all('SELECT fingerprint FROM blobs', [])) {
      const print = String(Reflect.get(row, 'fingerprint'))
      if (named.has(print)) continue
      file.run('DELETE FROM blobs WHERE fingerprint = ?', [print])
      blobs++
    }
    return { points, blobs }
  })
}
