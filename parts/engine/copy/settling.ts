import { TentError } from '../../core/index.ts'
import { setHere } from '../../data/index.ts'
import { tell } from './link.ts'
import type { WriterState } from './writerState.ts'
import { beatOf, behindOf } from './writerState.ts'

/** What a writer keeps of the beats of one reader, by its machine id, after its link closed too. */
interface Beats {
  far: boolean
  // The last write that the reader said it applied.
  at: number
  // The beats that were answered `ok`: when, and the number the writer held then.
  oks: { time: number; n: number }[]
}

/** An answer that waits for a write to be held by the readers that are waited for. */
interface Waiting {
  n: number
  all: boolean
  done(): void
  fail(error: Error): void
}

/**
 * What is settled on a writer: which readers a write waits for and for how long, the answers that wait for a
 * write to be settled, the near readers that may be current, and the hold of a writer that opened with some.
 */
export interface Settling {
  /** The newest settled write. */
  settled(): number
  /** Whether the writer still holds its writes and its answers after it opened, for its near readers. */
  holds(): boolean
  /** Ends the hold of the opening at once: what waited for it goes on. */
  holdNoMore(): void
  /** What is kept of the beats of one reader, which is begun where nothing was kept. */
  beatsOf(id: string, far: boolean): Beats
  /** What is kept of the beats of one reader, or nothing where none of its beats was taken. */
  beatsHeld(id: string): Beats | undefined
  /** Whether a machine is one of the near readers that may be current. */
  isNear(id: string): boolean
  /** Notes a near reader that may be current from now on, in a write that has reached the disk. */
  nearFrom(id: string): void
  /** Notes the files whose rows a write added: it is settled for a near reader once that reader holds their bytes. */
  files(write: number, fingerprints: string[]): void
  /** Notes that a reader holds the bytes of a file. */
  has(id: string, fingerprint: string): void
  /**
   * Moves what is settled on as far as it goes, lets the answers leave that waited for it, and waits for the rest.
   * `carried` says that a write which is sent to the readers carries the number, so that none is told it apart.
   */
  settle(carried?: boolean): void
  /** Answers once a write is settled, or with `all` once every reader that is waited for holds it. */
  held(write: number, all: boolean): Promise<void>
  /** Answers once the hold of the opening has ended: at once, but for a writer that opened with near readers. */
  ready(): Promise<void>
  /** Counts every write that the writer holds now as settled. With `forget`, no reader is waited for any more. */
  allSettled(forget: boolean): void
  /** Takes the timer back, and refuses every answer that still waits with T0029. */
  close(): void
}

/**
 * Takes what a writer holds of itself, the near readers that its data names as possibly current, and what has a
 * writer that lost writes go on once it stands back for nobody. Answers what is settled on that writer. A folder
 * that names such readers counts every write as not settled, until each of them has joined and confirmed its
 * newest write, or the time of `behind` and one beat has passed.
 */
export function settlingOf(w: WriterState, named: string[], lostNoMore: () => void): Settling {
  const { o } = w
  const beats = new Map<string, Beats>()
  const waiting: Waiting[] = []
  // The files whose rows each write that is not settled yet added, and the bytes that each reader said it holds.
  const filesAt = new Map<number, string[]>()
  const hasOf = new Map<string, Set<string>>()
  // Since when a near reader that holds a write lacks the bytes of a file of it, by the reader and the write.
  const lackSince = new Map<string, number>()
  /** Whether a near reader lacks the bytes of a file whose row a write added. */
  const lacks = (id: string, held: Beats, write: number): boolean =>
    !held.far && (filesAt.get(write) ?? []).some((one) => !hasOf.get(id)?.has(one))
  let near = new Set(named)
  // The near readers that this writer waits for after it opened, before it takes a write or lets an answer leave.
  let openHold = near.size && !w.back ? { ids: new Set(near), until: w.opened + behindOf(w) + beatOf(w) } : undefined
  let settled = openHold ? 0 : w.n
  let readied: (() => void)[] = []
  let cancel = (): void => undefined

  /** Whether a write still waits for one reader, and until when it does. */
  function waitsFor(id: string, held: Beats, write: number, now: number): number | undefined {
    if (held.at >= write && !lacks(id, held, write)) return undefined
    if (held.at >= write) {
      // A near reader that holds the write and not the bytes of its files has `behind` from then to send `has`.
      const key = `${id}\n${write}`
      const since = lackSince.get(key) ?? now
      lackSince.set(key, since)
      if (now < since + behindOf(w)) return since + behindOf(w)
      lackSince.delete(key)
      w.links.get(id)?.link.close()
      if (near.delete(id)) setHere(o.store, { near: [...near] })
      return undefined
    }
    const ok = held.oks.findLast((one) => one.n < write)
    if (!ok) return undefined
    const until = ok.time + behindOf(w) + beatOf(w)
    if (now < until) return until
    // Past that time the reader cannot be current, and a writer that opens again does not wait for it.
    if (near.delete(id)) setHere(o.store, { near: [...near] })
    return undefined
  }

  /** Until when a write waits: for the near readers, or with `all` for every reader. Nothing where it waits no longer. */
  function waitOf(write: number, all: boolean, now: number): number | undefined {
    let until: number | undefined
    for (const [id, held] of beats) {
      if (held.far && !all) continue
      const one = waitsFor(id, held, write, now)
      if (one !== undefined) until = Math.min(until ?? one, one)
    }
    return until
  }

  /** Lets the hold of a writer that opened again go, once each near reader confirmed, or its time has passed. */
  function letGo(now: number): void {
    lostNoMore()
    if (!openHold) return
    for (const id of [...openHold.ids]) if ((beats.get(id)?.at ?? -1) >= w.n && w.links.has(id)) openHold.ids.delete(id)
    if (openHold.ids.size && now < openHold.until) return
    openHold = undefined
    lostNoMore()
    settled = Math.max(settled, w.n)
    for (const done of readied.splice(0)) done()
    readied = []
  }

  function settle(carried = false): void {
    if (w.closed) return
    const now = o.clock.now()
    cancel()
    letGo(now)
    let next: number | undefined = openHold?.until
    const before = settled
    while (!openHold && settled < w.n) {
      const until = waitOf(settled + 1, false, now)
      if (until !== undefined) {
        next = Math.min(next ?? until, until)
        break
      }
      settled++
    }
    for (const one of waiting.splice(0)) {
      const until = one.n > settled ? Number.POSITIVE_INFINITY : one.all ? waitOf(one.n, true, now) : undefined
      if (until === undefined) one.done()
      else {
        waiting.push(one)
        if (Number.isFinite(until)) next = Math.min(next ?? until, until)
      }
    }
    for (const n of [...filesAt.keys()]) if (n <= settled) filesAt.delete(n)
    for (const key of [...lackSince.keys()]) if (Number(key.split('\n')[1]) <= settled) lackSince.delete(key)
    if (settled > before && !carried) for (const one of w.links.values()) tell(one.link, { t: 'settled', n: settled })
    if (next !== undefined) cancel = o.clock.setTimer(next, () => settle())
  }

  return {
    settled: () => settled,
    holds: () => openHold !== undefined,
    holdNoMore() {
      openHold = undefined
      for (const done of readied.splice(0)) done()
    },
    beatsOf(id, far) {
      const held = beats.get(id) ?? { far, at: 0, oks: [] }
      held.far = far
      beats.set(id, held)
      return held
    },
    beatsHeld: (id) => beats.get(id),
    isNear: (id) => near.has(id),
    nearFrom(id) {
      if (near.has(id)) return
      near.add(id)
      setHere(o.store, { near: [...near] }, { toDisk: true })
    },
    settle,
    files(write, fingerprints) {
      if (fingerprints.length) filesAt.set(write, fingerprints)
    },
    has(id, fingerprint) {
      const held = hasOf.get(id) ?? new Set<string>()
      held.add(fingerprint)
      hasOf.set(id, held)
    },
    held(write, all) {
      settle()
      if (write <= settled && (!all || waitOf(write, true, o.clock.now()) === undefined)) return Promise.resolve()
      return new Promise((done, fail) => {
        waiting.push({ n: write, all, done, fail })

        settle()
      })
    },
    async ready() {
      settle()
      if (openHold) await new Promise<void>((done) => void readied.push(done))
    },
    allSettled(forget) {
      settled = w.n
      if (!forget) return
      near = new Set()
      beats.clear()
    },
    close() {
      cancel()
      // An answer that waited for a write to be settled does not leave a writer that is closed: nobody says it was.
      for (const one of waiting.splice(0))
        one.fail(
          new TentError('T0029', 'The writer was closed before a write that this answer rests on was settled.', {
            fix: 'Ask again: the write may have been carried out.',
          }),
        )
      for (const done of readied.splice(0)) done()
    },
  }
}
