import type { Description } from '../../core/internal.ts'
import type { InQueue, Joined, KindStated } from './state.ts'
import { isStored } from '../../core/internal.ts'

// How long work waits for a worker of its kind where the kind states no `wait`: a machine with a card takes 3 to 7 minutes to start.
const waitFor = 15 * 60_000
// After how long with no task a worker is told idle where its kind states no `idleAfter`.
const idleFor = 2 * 60_000

/** Reads what the project of a version states of a kind of worker. `any` runs on a thread here unless it says otherwise. */
export function kindStated(description: Description, kind: string): KindStated {
  const workers: unknown = description.project.workers
  const stated: unknown = isStored(workers) ? workers[kind] : undefined
  const record = isStored(stated) ? stated : {}
  const orHere = record.orHere === undefined ? kind === 'any' : record.orHere
  return {
    ...(typeof record.atOnce === 'number' ? { atOnce: record.atOnce } : {}),
    wait: typeof record.wait === 'number' ? record.wait : waitFor,
    ...(typeof record.queue === 'number' ? { queue: record.queue } : {}),
    order: record.order === 'oldest' ? 'oldest' : 'waited',
    ...(record.turns === 'caller' ? { turns: 'caller' as const } : {}),
    place: record.place === 'pack' ? 'pack' : 'spread',
    loaded: record.loaded === 'no' ? 'no' : 'first',
    orHere: orHere === 'busy' ? 'busy' : orHere === true,
    alone:
      record.alone === false
        ? false
        : typeof record.alone === 'number' && record.alone >= 1
          ? Math.floor(record.alone)
          : 1,
    idleAfter: typeof record.idleAfter === 'number' ? record.idleAfter : idleFor,
  }
}

/**
 * Whether a worker could take work of a kind and version: joined, of that kind, ready for the version, neither
 * released nor going, and heard from within the last two beats.
 */
export const couldTake = (j: Joined, kind: string, version: string, now: number, beat: number): boolean =>
  j.joined &&
  j.kinds.includes(kind) &&
  j.ready.has(version) &&
  !j.released &&
  j.going === undefined &&
  now - j.alive <= 2 * beat

/** Whether a worker has a free place. */
export const hasPlace = (j: Joined): boolean => j.out.size < j.atOnce

/**
 * Lays the tasks that wait for a kind in the order they are handed out: one that a request waits for first,
 * unless the kind states `order: 'oldest'`; among equals the oldest first, or with `turns: 'caller'` the oldest
 * of the caller that has the fewest out, and of those the one whose turn was longest ago.
 */
export function inOrder(
  waiting: InQueue[],
  stated: KindStated,
  waited: (run: string) => boolean,
  outOf: (caller: string) => number,
  callerOf: (run: string) => string,
  // When a caller was last handed a task, as a count that grows; below every other for one that never was.
  turnOf: (caller: string) => number = () => 0,
): InQueue[] {
  const rank = new Map(waiting.map((one) => [one, stated.order === 'waited' && waited(one.w.run) ? 0 : 1]))
  return [...waiting].sort((a, b) => {
    const byWait = (rank.get(a) ?? 1) - (rank.get(b) ?? 1)
    if (byWait !== 0) return byWait
    if (stated.turns === 'caller') {
      const byTurn = outOf(callerOf(a.w.run)) - outOf(callerOf(b.w.run))
      if (byTurn !== 0) return byTurn
      const byLast = turnOf(callerOf(a.w.run)) - turnOf(callerOf(b.w.run))
      if (byLast !== 0) return byLast
    }
    return a.seq - b.seq
  })
}

/**
 * Which of several free workers is handed a task: with `loaded: 'first'`, those that hold the `python` of the task
 * loaded before the others; then with `spread` the one that holds the fewest, and of those the one whose place was
 * free longest; with `pack` the one that holds the most.
 */
export function picked(free: Joined[], stated: KindStated, definition?: string): Joined | undefined {
  const holding = stated.loaded === 'first' && definition !== undefined
  const loadedFirst = holding ? free.filter((j) => j.loaded.includes(definition)) : []
  return [...(loadedFirst.length ? loadedFirst : free)].sort((a, b) =>
    stated.place === 'pack'
      ? b.out.size - a.out.size || a.freeSince - b.freeSince
      : a.out.size - b.out.size || a.freeSince - b.freeSince,
  )[0]
}
