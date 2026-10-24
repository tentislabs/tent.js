import type { ReaderState } from './readerState.ts'

/** Whether a reader is current: what the beats that its writer answered let it answer by itself, and since when it may not. */
export interface Currency {
  /** Whether the reader may answer by itself, as the beats it was answered say. It tells whoever listens when that changes. */
  current(): boolean
  /** Since when it was not current, or nothing while it is; and when its writer last answered it a beat. */
  since(): { behind?: number; beat?: number }
  /** Notes that the writer answered a beat just now. */
  beatAnswered(): void
  /** Notes a beat that was answered `ok`: when it was sent, and the number that the writer held when it answered. */
  ok(sentAt: number, n: number): void
  /** Nothing that was answered counts any more: the data was fetched anew. */
  forget(): void
}

/** Takes what a reader holds of itself. Answers what says whether it is current. A reader that starts is not. */
export function currencyOf(r: ReaderState): Currency {
  const { o } = r
  // The beats that were answered `ok`, and that make the reader current once it has applied their number.
  let oks: { sentAt: number; n: number; behind: number }[] = []
  let lastBeat: number | undefined
  let currentUntil = Number.NEGATIVE_INFINITY
  let wasCurrent = false
  let behindSince: number | undefined = o.clock.now()

  function current(): boolean {
    for (const ok of oks.filter((one) => one.n <= r.applied))
      currentUntil = Math.max(currentUntil, ok.sentAt + ok.behind)
    oks = oks.filter((one) => one.n > r.applied)
    const now = o.clock.now()
    const lacksBytes = [...r.bytesLacking.values()].some((one) => one.n <= r.settled)
    const is = !r.busy && !r.lacking && !lacksBytes && now <= currentUntil
    if (is !== wasCurrent) {
      wasCurrent = is
      behindSince = is ? undefined : now
      o.raise(is ? 'machine.current' : 'machine.behind', { app: o.app, n: r.applied })
      // A reader that is not current answers nothing itself: its live connections are closed.
      if (!is) o.hub?.behind()
    }
    return is
  }

  return {
    current,
    since() {
      current()
      return {
        ...(behindSince === undefined ? {} : { behind: behindSince }),
        ...(lastBeat === undefined ? {} : { beat: lastBeat }),
      }
    },
    beatAnswered() {
      lastBeat = o.clock.now()
    },
    ok(sentAt, n) {
      oks.push({ sentAt, n, behind: r.limits.behind })
    },
    forget() {
      oks = []
      currentUntil = Number.NEGATIVE_INFINITY
    },
  }
}
