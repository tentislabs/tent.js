import type { GuardedFetch } from '../connect/index.ts'
import type { Change, Clash, History, Point, Writer } from '../history/index.ts'
import { fetchedFrom } from './fetchedFrom.ts'
import { seenAt } from './seen.ts'
import type { Target } from './target.ts'

/**
 * Fetches the points of the branch that `now` follows from a target and merges them into the files of the
 * project: a pull is always a merge, and never an overwrite. Where this computer has nothing of its own since the
 * last pull, the merge is the target's point itself. Answers what the merge answers.
 */
export async function pull(o: {
  project: string
  history: History
  from: Target
  fetch: GuardedFetch
  by: Writer
}): Promise<{ point?: Point; changes: Change[]; clashes: Clash[] }> {
  const branch = o.history.pointer('on') ?? 'main'
  const seen = seenAt(o.from.address, branch)
  const have = [...new Set([o.history.pointer(seen), o.history.pointer('now'), o.history.pointer(branch)])].filter(
    (one): one is string => one !== undefined,
  )
  const head = await fetchedFrom({ to: o.from, fetch: o.fetch }, o.history, branch, have)
  if (head === undefined) return { changes: [], clashes: [] }
  // A history that holds nothing yet records the files as they are first, as before every pull: so what the
  // target holds is merged with them, and no change of them is written over.
  if (o.history.pointer('now') === undefined) {
    const own = o.history.record(o.project, { by: o.by, kind: 'command' })
    // Files that are the target's own, with nothing of this computer's, take the target's point itself.
    if (!o.history.compare(own.id, head).length) {
      o.history.move('now', head)
      o.history.move(seen, head)
      const point = o.history.read(head)
      return { ...(point ? { point } : {}), changes: [], clashes: [] }
    }
  }
  const merged = o.history.merge(o.project, head, o.by)
  o.history.move(seen, head)
  return merged
}
