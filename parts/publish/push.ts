import type { GuardedFetch } from '../connect/index.ts'
import { TentError } from '../core/index.ts'
import type { History } from '../history/index.ts'
import { lackingThere, sendPoints } from './send.ts'
import { seenAt } from './seen.ts'
import type { Target } from './target.ts'

/** The branch that `now` follows, and the point it stands on. Throws T9107 where the history holds none. */
function headOf(history: History): { branch: string; head: string } {
  const branch = history.pointer('on') ?? 'main'
  const head = history.pointer(branch) ?? history.pointer('now')
  if (head === undefined)
    throw new TentError('T9107', 'The history holds no point to send.', { fix: 'Record a point first.' })
  return { branch, head }
}

/**
 * Sends the points of the branch that `now` follows that the target lacks, oldest first, each after its own
 * blobs, and asks the target to move its pointer of that branch's name where it still stands where this computer
 * last saw it. Where it does not, the target merges, or refuses with T9103. Answers how many points and blobs were
 * sent. Throws T9101 for a head that is unsettled or that did not pass the check here, unless `unchecked`.
 */
export async function push(o: {
  history: History
  to: Target
  fetch: GuardedFetch
  unchecked?: boolean
}): Promise<{ points: number; blobs: number }> {
  const { branch, head } = headOf(o.history)
  const point = o.history.read(head)
  if (point?.unsettled || (point?.checked === false && o.unchecked !== true))
    throw new TentError(
      'T9101',
      `The point ${head} ${point.unsettled ? 'is a merge with clashes that are not settled' : 'did not pass the check on this computer'}, and is not pushed.`,
      {
        fields: { point: head, reason: point.unsettled ? 'unsettled' : 'not-checked' },
        fix: 'Mend what the check finds, or push with `--unchecked` to share work that does not pass yet.',
      },
    )
  const seen = seenAt(o.to.address, branch)
  const reaching = { to: o.to, fetch: o.fetch }
  const points = await lackingThere(reaching, o.history, head)
  const move = { pointer: branch, to: head, was: o.history.pointer(seen) ?? null }
  const sent = await sendPoints(reaching, o.history, points, { move })
  // Where the target merged, its point is not here yet: what this computer saw it hold is its own head.
  o.history.move(seen, head)
  return { points: points.length, blobs: sent.blobs }
}
