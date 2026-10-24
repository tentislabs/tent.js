import { TentError } from '../core/index.ts'
import type { Description } from '../core/internal.ts'
import type { History, Kind, Point, Writer } from '../history/index.ts'
import { branchWork } from './historyBranches.ts'
import { keptImpact } from '../publish/index.ts'

/** Who writes a point that a command of a person's own computer records. */
export const person: Writer = { kind: 'person' }

const kinds: readonly Kind[] = ['save', 'command', 'named', 'published', 'back', 'merge', 'turn']

/** A point as a command answers it: what it is, and how many files it holds. */
interface ShownPoint {
  id: string
  at: number
  by: Writer
  kind: Kind
  name?: string
  checked?: boolean
  note?: string
  files?: number
}

/** A point as a command answers it. */
export const shown = (point: Point): ShownPoint => ({
  id: point.id,
  at: point.at,
  by: point.by,
  kind: point.kind,
  ...(point.name !== undefined ? { name: point.name } : {}),
  ...(point.checked !== undefined ? { checked: point.checked } : {}),
  ...(point.note !== undefined ? { note: point.note } : {}),
  ...(point.files ? { files: Object.keys(point.files).length } : {}),
})

/** A word of a command that must be a text which holds something. Throws T0002 where it is not. */
function wordOf(args: object, name: string): string {
  const word: unknown = Reflect.get(args, name)
  if (typeof word !== 'string' || word === '')
    throw new TentError('T0002', `The command takes a text as \`${name}\`.`, { fields: { [name]: 'type' } })
  return word
}

/**
 * Takes an open history, the folder of its project, and the words of a command of `tent history` by their names:
 * `what` is `list`, `save`, `command`, `compare` or `export`. Carries the command out, and answers its value:
 * the newest points, the named point or the point of a command that was recorded, the changes between two points, or the count of commits. `found` is
 * what a session of development found of the files as they stand, which a named point is recorded with: with no
 * session, a command records the files alone. Throws T0002 for a word that is missing, and what the history throws.
 */
export function historyWork(
  history: History,
  folder: string,
  args: object,
  found: { checked?: boolean; description?: Description } = {},
): unknown {
  const what: unknown = Reflect.get(args, 'what')
  if (what === 'branch' || what === 'merge') return branchWork(history, folder, args)
  if (what === 'save')
    return {
      point: shown(history.record(folder, { by: person, kind: 'named', name: wordOf(args, 'name'), ...found })),
    }
  if (what === 'command') return { point: shown(history.record(folder, { by: person, kind: 'command', ...found })) }
  if (what === 'compare') {
    // A publish keeps its impact with its point, which is printed beside what changed.
    const to = history.find(wordOf(args, 'b'))
    const impact = to ? keptImpact(history, to.id) : undefined
    return { changes: history.compare(wordOf(args, 'a'), wordOf(args, 'b')), ...(impact ? { impact } : {}) }
  }
  if (what === 'export') {
    const named: unknown = Reflect.get(args, 'kinds')
    const asked = Array.isArray(named) ? kinds.filter((kind) => named.includes(kind)) : undefined
    return {
      ...history.exportGit(wordOf(args, 'out'), asked ? { kinds: asked } : {}),
      note: 'Git holds the files of each point. The marks of the check and the changes in the terms of the app are not in it.',
    }
  }
  const newest: unknown = Reflect.get(args, 'newest')
  const points = history.list({ newest: typeof newest === 'number' && newest > 0 ? newest : 30 })
  return { now: history.pointer('now') ?? null, points: points.map(shown) }
}
