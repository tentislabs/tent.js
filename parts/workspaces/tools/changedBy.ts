import { json, text } from '../../core/index.ts'
import type { Point } from '../../history/index.ts'
import { historyOf } from '../state.ts'
import type { ProjectTool } from './face.ts'

/** What a point is as `changedBy` answers it: the point, when, by whom, its kind, and the turn it belongs to. */
const told = (point: Point, turn?: string): object => ({
  point: point.id,
  at: point.at,
  by: point.by,
  kind: point.kind,
  ...(turn === undefined ? {} : { turn }),
})

/** Whether a path of a field lies at or inside another. */
const within = (path: unknown, inside: unknown[]): boolean =>
  Array.isArray(path) && inside.every((part, k) => path[k] === part)

/**
 * `changedBy`: for a definition, or one field of it by its path, the newest point that changed it, with its time,
 * who made it, its kind and the turn it belongs to. A definition is read from the row kept for it; a field from the
 * lists kept with the points, newest first, until one changed it.
 */
export const changedByTool: ProjectTool = {
  name: 'changedBy',
  about:
    'The newest saved point that changed a definition, or one field of it by its path: when, by whom, and in which turn.',
  input: { name: text({ min: 1 }), path: json({ optional: true }) },
  writes: false,
  async run(at, input) {
    const history = historyOf(at.one)
    const name = String(input.name)
    const path = input.path
    if (!Array.isArray(path)) {
      const id = history.changedBy(name)
      const point = id === undefined ? undefined : history.read(id)
      return point ? told(point, turnOf(at, point.id)) : {}
    }
    for (const point of history.list()) {
      const changes = history.changesOf(point.id) ?? []
      if (changes.some((one) => one.name === name && within(one.path ?? [], path)))
        return told(point, turnOf(at, point.id))
    }
    return {}
  },
}

/** The turn whose points take in a point, where one does: its `before` point is older and its `after` not. */
function turnOf(at: Parameters<ProjectTool['run']>[0], point: string): string | undefined {
  const history = historyOf(at.one)
  const when = history.read(point)?.at ?? 0
  return history
    .turns()
    .find(
      (one) =>
        (history.read(one.before)?.at ?? Infinity) < when &&
        (one.after === undefined || (history.read(one.after)?.at ?? 0) >= when),
    )?.id
}
