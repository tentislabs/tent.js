import { isDeepStrictEqual } from 'node:util'
import { join } from 'node:path'
import type { Description } from '../core/internal.ts'
import { openHistory } from '../history/index.ts'

/**
 * Marks `now` of the history of a project with what a check found: whether it passed, and the description it
 * made. Where the files are no longer those of `now` a point is recorded first, so that a coding agent that checks and
 * then pushes is not refused; where they are, `now` stays where it stood, and no point is added.
 */
export function markChecked(folder: string, description: Description, checked: boolean): void {
  const history = openHistory(join(folder, '.tent'))
  try {
    const was = history.pointer('now')
    const on = history.pointer('on')
    const point = history.record(folder, { by: { kind: 'person' }, kind: 'command', checked, description })
    const before = was === undefined ? undefined : history.read(was)
    if (was === undefined || !before || !isDeepStrictEqual(before.files ?? {}, point.files ?? {})) return
    // The files are those of `now`: the point just recorded is left with nothing on it, and `now` is marked.
    history.move('now', was)
    if (on !== undefined) history.move(on, was)
    history.mark(was, { checked, description })
  } finally {
    history.close()
  }
}
