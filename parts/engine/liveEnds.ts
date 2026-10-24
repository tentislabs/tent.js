import type { Socket } from './hub/connection.ts'

/**
 * The end of a live connection that a program holds in the place of a page. `send` hands the engine one message.
 * `each` names what is handed every message that arrives, in order, and what is told once the connection is
 * closed, by either side. `close` closes it.
 */
export interface LiveEnd {
  send(message: object): void
  each(fn: (message: Record<string, unknown>) => void, closed?: () => void): void
  close(): void
}

/** One side of the pair: who listens there, what arrived before anybody did, and whether it stands open. */
interface Side {
  handler?: (text: string) => void
  closed?: () => void
  before: string[]
  open: boolean
}

/**
 * Makes the two ends of a live connection that crosses no network: what one end sends, the other is handed, in
 * order and a turn of the program later, as over a connection. Answers the end of the page, and the end that the
 * hub holds.
 */
export function liveEnds(): { page: LiveEnd; hub: Socket } {
  // One queue for both directions keeps the order of everything the connection carries.
  const queue: (() => void)[] = []
  const drain = (): void => {
    for (const one of queue.splice(0)) one()
  }
  const later = (work: () => void): void => {
    if (queue.push(work) === 1) setImmediate(drain)
  }
  const sides: [Side, Side] = [
    { before: [], open: true },
    { before: [], open: true },
  ]
  const send = (to: Side, text: string): void =>
    later(() => {
      if (!to.open) return
      if (to.handler) to.handler(text)
      else to.before.push(text)
    })
  const listen = (mine: Side, fn: (text: string) => void, closed?: () => void): void => {
    mine.handler = fn
    mine.closed = closed
    // What arrived before the other side closed is still handed over, and the closing is told after it.
    for (const text of mine.before.splice(0)) fn(text)
    if (!mine.open) closed?.()
  }
  const close = (mine: Side, other: Side): void => {
    if (!mine.open) return
    mine.open = false
    mine.closed?.()
    later(() => {
      if (!other.open) return
      other.open = false
      other.closed?.()
    })
  }
  const [page, hub] = sides
  return {
    page: {
      send: (message) => void (page.open && send(hub, JSON.stringify(message))),
      each: (fn, closed) => listen(page, (text) => fn(JSON.parse(text)), closed),
      close: () => close(page, hub),
    },
    hub: {
      send: (frame) => void (hub.open && typeof frame === 'string' && send(page, frame)),
      each: (fn, closed) => listen(hub, fn, closed),
      close: () => close(hub, page),
      // With no network nothing waits to be taken: a frame is handed over as it is sent.
      waiting: () => 0,
    },
  }
}
