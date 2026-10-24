import type { ReaderState } from './readerState.ts'

/** What waits on a reader for a write to be applied there, or to be told settled. */
export interface Waiters {
  /** Answers whether the reader has applied a write, or was told that it is settled, within that time. */
  until(of: 'applied' | 'settled', n: number, ms: number): Promise<boolean>
  /**
   * Answers once the reader holds a write, or has applied the number in the answer to a beat that it sent after
   * the beat of that id, whichever comes first: a number that no write has costs one beat.
   */
  seen(n: number, lastBeat: number): Promise<void>
  /** Notes the number that the writer answered a beat with. */
  beaten(id: number, n: number): void
  /** Answers each that waited for what the reader holds now. */
  woken(): void
  /** Answers each that still waits that its write did not arrive: the reader is closed. */
  close(): void
}

/** Takes what a reader holds of itself. Answers what waits on it for a write, by the clock of its app. */
export function waitersOf(r: ReaderState): Waiters {
  const { o } = r
  const waiters: { n: number; of: 'applied' | 'settled'; done(held: boolean): void }[] = []
  // What waits with no end to its time: a watch, which cannot be handed to the writer.
  let watching: { n: number; after: number; beat?: number; done(): void }[] = []
  const at = (of: 'applied' | 'settled'): number => (of === 'applied' ? r.applied : r.settled)
  const woken = (): void => {
    for (const one of waiters.splice(0)) {
      if (at(one.of) >= one.n) one.done(true)
      else waiters.push(one)
    }
    const held = watching.filter((one) => r.applied >= one.n || (one.beat !== undefined && r.applied >= one.beat))
    watching = watching.filter((one) => !held.includes(one))
    for (const one of held) one.done()
  }
  return {
    until(of, n, ms) {
      if (at(of) >= n) return Promise.resolve(true)
      return new Promise((done) => {
        const waiter = {
          n,
          of,
          done(holds: boolean) {
            cancel()
            done(holds)
          },
        }
        const cancel = o.clock.setTimer(o.clock.now() + ms, () => {
          const place = waiters.indexOf(waiter)
          if (place >= 0) waiters.splice(place, 1)
          done(false)
        })
        waiters.push(waiter)
      })
    },
    seen(n, lastBeat) {
      if (r.applied >= n) return Promise.resolve()
      return new Promise((done) => void watching.push({ n, after: lastBeat, done }))
    },
    beaten(id, n) {
      for (const one of watching) if (one.beat === undefined && id > one.after) one.beat = n
      woken()
    },
    woken,
    close() {
      for (const one of waiters.splice(0)) one.done(false)
      for (const one of watching.splice(0)) one.done()
    },
  }
}
