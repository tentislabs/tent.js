import { number } from '../../core/index.ts'
import { historyOf } from '../state.ts'
import type { ProjectTool } from './face.ts'

// How many points the history answers where it names no `newest`.
const most = 20

/** `history`: the points of the workspace, newest first, each with who made it and what it changed. */
export const historyTool: ProjectTool = {
  name: 'history',
  about:
    'The saved points of the project, the newest first, each with when and by whom it was made, and what it changed.',
  input: { newest: number({ min: 1, max: 200, optional: true }) },
  writes: false,
  async run(at, input) {
    const history = historyOf(at.one)
    const points = history.list({ newest: Number(input.newest ?? most) }).map((point) => ({
      id: point.id,
      kind: point.kind,
      at: point.at,
      by: point.by,
      ...(point.name === undefined ? {} : { name: point.name }),
      ...(point.checked === undefined ? {} : { checked: point.checked }),
      changes: history.changesOf(point.id) ?? [],
    }))
    return { points }
  },
}
