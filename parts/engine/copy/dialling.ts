import { here } from '../../data/index.ts'
import { manyLimit, placeOf, sameAddress } from '../held.ts'
import type { Frame, Link } from './link.ts'
import { tell } from './link.ts'
import type { Open, ReaderState } from './readerState.ts'

/** How a reader finds its writer: the addresses it dials, in rounds, and the wait between two rounds. */
export interface Dialling {
  /** Dials the addresses anew, from the first, where no link is open. */
  round(): void
  /** Dials the next address of the round, and waits for the next round where none is left. */
  next(): void
  /** Has the next round made after the wait of this kind of reader. */
  again(): void
  /** Closes the link that is open, and has the reader look for its writer anew from the number it holds. */
  reopen(): void
  /**
   * Is told the address that a machine named as the writer's, and the address of that machine: it is dialled next
   * in this round. An address that leads to this machine itself, and one by which a machine names itself after it
   * said that it is not the writer, lead to no writer: neither is kept, and neither is dialled.
   */
  namedWriter(address: string, by: string): void
  /** A link took the place of the reader: the wait of a far reader begins anew. */
  joined(): void
  /** Takes the timer of the next round back. */
  close(): void
}

/**
 * Takes what a reader holds of itself, and what takes a frame of a link that it opened. Answers what dials its
 * writer: its `from` address, then the address that a machine named, then the address of each machine that may
 * take over. A near reader tries again every beat, and a far one after a wait that is drawn and doubled.
 */
export function diallingOf(r: ReaderState, taken: (mine: Open, frame: Frame) => void): Dialling {
  const { o, reads } = r
  const near = !reads.far
  let tries: string[] = []
  // The addresses that this round has dialled: none is dialled twice in one round, whoever names it.
  let dialled = new Set<string>()
  let wait = 0
  let cancelDial = (): void => undefined
  let cancelSilent = (): void => undefined

  /** The addresses that a try dials, in order: its writer, the one a machine named, and each machine that may take over. */
  const addresses = (): string[] => [...new Set([reads.from, ...(r.named ? [r.named] : []), ...r.takes])]

  function again(): void {
    if (r.closed || r.busy) return
    cancelDial()
    // A near reader tries every beat. A far one waits a moment that is drawn, and twice as long after each try that failed.
    wait = near
      ? r.limits.beat
      : wait === 0
        ? 500 + Math.floor(Math.random() * 1000)
        : Math.min(wait * 2, manyLimit(o.description, 'dial'))
    cancelDial = o.clock.setTimer(o.clock.now() + wait, round)
  }

  function round(): void {
    if (r.closed || r.busy || r.open) return
    tries = addresses()
    dialled = new Set()
    next()
  }

  function next(): void {
    if (r.closed || r.busy || r.open) return
    const address = tries.shift()
    if (address === undefined) {
      again()
      return
    }
    dialled.add(address)
    let link: Link
    try {
      const headers = { authorization: `Bearer ${reads.key}` }
      link = r.reached(address).link(new Request(`${address}/_t/copy`, { headers }))
    } catch {
      next()
      return
    }
    const mine: Open = { link, address, go: false, heard: o.clock.now() }
    r.open = mine
    const { engine, layout } = o.store.version()
    const { id } = here(o.store)
    const place = { id, n: r.applied, epoch: r.held, sum: placeOf(o).sum, far: reads.far, engine, layout }
    tell(link, { t: 'from', ...place, ...(reads.own ? { own: reads.own } : {}) })
    // A machine that takes a connection and says nothing holds no reader: a link that has heard nothing within a
    // beat, for a near reader, or within the time a reader may be behind, is closed, and the next address dialled.
    let heard = false
    cancelSilent()
    const [time, since] = [near ? r.limits.beat : r.limits.behind, performance.now()]
    let waits: NodeJS.Timeout | undefined
    const look = (): void => {
      if (r.open !== mine || heard) return
      // The time is counted by the clock of the app and by the time that really passed: a clock that jumps, as
      // after a pause of the whole program, closes no link whose answer the program has not had the time to read.
      const left = time - (performance.now() - since)
      if (left > 0) waits = setTimeout(look, left)
      else link.close()
    }
    const cancelTimer = o.clock.setTimer(o.clock.now() + time, look)
    cancelSilent = () => {
      cancelTimer()
      clearTimeout(waits)
    }
    link.each(
      (frame) => {
        heard = true
        taken(mine, frame)
      },
      () => {
        // The closing is taken after every frame that arrived before it, so that what the writer said last is heard.
        r.work = r.work.then(() => {
          if (r.open !== mine) return
          r.open = undefined
          r.sent.clear()
          // A link that never took the place of the reader tries the next address: one that was open looks anew at once.
          if (mine.go) round()
          else next()
        })
      },
    )
  }

  return {
    round,
    next,
    again,
    reopen() {
      const mine = r.open
      r.open = undefined
      mine?.link.close()
      round()
    },
    namedWriter(address, by) {
      // A reader that has not yet seen that its writer is gone names the old writer, which may be this machine,
      // started again as its reader: dialled, it would name itself, and be dialled without end.
      if (sameAddress(address, reads.own) || sameAddress(address, by)) return
      r.named = address
      // Two machines that each name the other, as two readers of a writer that is gone may, are each dialled once
      // in a round, and the next round waits its time.
      if (!tries.includes(address) && !dialled.has(address)) tries.unshift(address)
    },
    joined() {
      wait = 0
    },
    close() {
      cancelDial()
      cancelSilent()
    },
  }
}
