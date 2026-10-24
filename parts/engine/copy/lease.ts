import { here } from '../../data/index.ts'
import type { Lease } from '../makers.ts'
import type { Opened } from '../opened.ts'
import { manyLimit } from '../held.ts'
import { takeOver } from './takeOver.ts'

/**
 * Takes what the engine holds of an app, and the lease that was made for it. Has the lease asked every beat, for
 * as long as the app is open: by the writer, which writes only while its last yes holds, and by a near reader
 * that has not been current for `behind`, which takes over with its first yes. A `hold` that throws, or that has
 * not answered within one beat, is a no. Answers a thing whose `close` takes the timer back, and in `first` a
 * promise of the first asking, which an app that opens waits for.
 */
export function keepLease(o: Opened, lease: Lease): { close(): void; first: Promise<void> } {
  let cancel = (): void => undefined
  let closed = false
  let taking = false
  // Whether the reader was current while it followed its writer: only then does it ask without looking further.
  let wasCurrent = false

  /** Asks the lease once, and answers whether it said yes within one beat. */
  const ask = (): Promise<boolean> =>
    new Promise((done) => {
      const forMs = manyLimit(o.description, 'behind')
      const late = o.clock.setTimer(o.clock.now() + manyLimit(o.description, 'beat'), () => done(false))
      const settle = (yes: boolean): void => {
        late()
        done(yes)
      }
      try {
        const { id } = here(o.store)
        Promise.resolve(lease.hold({ app: o.name, mode: o.mode, machine: id, forMs })).then(
          (yes) => settle(yes === true),
          () => settle(false),
        )
      } catch {
        settle(false)
      }
    })

  /**
   * The number of the newest write that another machine says at its own address it holds, asked within one beat:
   * a machine that does not answer by then, as one that takes the connection and says nothing, holds nothing that
   * this one could wait for.
   */
  const heldAt = (own: string): Promise<number> =>
    new Promise((done) => {
      const stop = new AbortController()
      const late = o.clock.setTimer(o.clock.now() + manyLimit(o.description, 'beat'), () => {
        stop.abort()
        done(Number.NaN)
      })
      const told = (n: number): void => {
        late()
        done(n)
      }
      try {
        o.machine
          .reached(own)
          .request(new Request(`${own}/_t/health`, { signal: stop.signal }))
          .then(
            (answer) => told(Number((answer.headers.get('tent-at') ?? '').split('.')[1])),
            () => told(Number.NaN),
          )
      } catch {
        told(Number.NaN)
      }
    })

  /** Whether another machine that may take over answers at its own address with a higher number than this one holds. */
  async function otherHoldsMore(): Promise<boolean> {
    const reader = o.machine.reader
    if (!reader) return false
    // Every machine is asked at once, so one beat bounds the asking however many there are.
    const held = await Promise.all(reader.takes().map(heldAt))
    return held.some((n) => Number.isFinite(n) && n > reader.applied())
  }

  /** Asks the lease for the writer, and tells the writer what it said. */
  async function renew(): Promise<void> {
    const asked = o.clock.now()
    const yes = await ask()
    o.machine.writer?.leased(yes ? asked + manyLimit(o.description, 'behind') : undefined, renew)
  }

  async function beat(): Promise<void> {
    const { reader, writer } = o.machine
    const asked = o.clock.now()
    if (writer && writer.state() !== 'stopped' && writer.state() !== 'back') {
      await renew()
    } else if (reader && !reader.reads.far && reader.whole() && !taking) {
      const since = reader.since()
      if (reader.current()) wasCurrent = true
      const behind = since.behind !== undefined && asked - since.behind >= manyLimit(o.description, 'behind')
      if (
        behind &&
        (wasCurrent || !(await otherHoldsMore())) &&
        (await ask()) &&
        !closed &&
        o.machine.reader === reader
      ) {
        taking = true
        try {
          await takeOver(o)
          o.machine.writer?.leased(asked + manyLimit(o.description, 'behind'), renew)
        } catch {
          // A reader that cannot take over now asks again at the next beat.
        } finally {
          taking = false
        }
      }
    }
  }

  const next = (): void => {
    if (closed) return
    cancel = o.clock.setTimer(o.clock.now() + manyLimit(o.description, 'beat'), () => {
      void beat().finally(next)
    })
  }
  const first = beat().finally(next)
  return {
    first,
    close() {
      closed = true
      cancel()
    },
  }
}
