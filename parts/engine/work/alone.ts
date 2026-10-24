import type { Joined } from './state.ts'

/** The workers that a writer keeps, for each kind, for the tasks that go alone. */
export interface AloneKeeper {
  /**
   * Takes a kind, how many workers of it may be kept, the workers that could take its work, and how many of its
   * tasks that go alone wait. Answers the workers kept for them: one that holds no task where there is one, and
   * else the one that holds the fewest, as many as may be kept and as such tasks wait. A kept worker that could
   * take nothing any more is let go, and so is one that holds no task that goes alone once none waits.
   */
  keep(kind: string, most: number | false, able: Joined[], waiting: number): Set<string>
}

export function aloneKeeper(): AloneKeeper {
  const kept = new Map<string, Set<string>>()
  return {
    keep(kind, most, able, waiting) {
      const held = kept.get(kind) ?? new Set<string>()
      kept.set(kind, held)
      for (const id of [...held]) {
        const j = able.find((one) => one.id === id)
        const holdsAlone = j !== undefined && [...j.out.values()].some((one) => one.alone)
        if (!j || (waiting === 0 && !holdsAlone)) held.delete(id)
      }
      if (most === false) return held
      while (held.size < Math.min(most, waiting)) {
        const next = able.filter((one) => !held.has(one.id)).sort((a, b) => a.out.size - b.out.size)[0]
        if (!next) break
        held.add(next.id)
      }
      return held
    },
  }
}
