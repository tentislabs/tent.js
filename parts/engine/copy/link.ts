/** One frame of a link: a text, or bytes. */
export type Frame = string | Uint8Array

/**
 * One end of the link between a reader and its writer. `send` hands a frame to the other end. `each` names what
 * is handed every frame that arrives, in order, and what is told once the link is closed, by either end. `close`
 * closes it.
 */
export interface Link {
  send(frame: Frame): void
  each(fn: (frame: Frame) => void, closed?: () => void): void
  close(): void
}

/** One end as its maker holds it: it takes what arrives from the other side, and is told when that side closed. */
interface End extends Link {
  take(frame: Frame): void
  ended(): void
}

/** Makes one end. `out` carries a frame to the other side, and `shut` tells that side that this end closed. */
function endOf(out: (frame: Frame) => void, shut: () => void): End {
  let handler: ((frame: Frame) => void) | undefined
  let closed: (() => void) | undefined
  let open = true
  // What arrived before anybody listened waits here, so that no frame is lost between the opening and `each`.
  const waiting: Frame[] = []
  const end = (): void => {
    if (!open) return
    open = false
    closed?.()
  }
  return {
    send(frame) {
      if (open) out(frame)
    },
    each(fn, whenClosed) {
      handler = fn
      closed = whenClosed
      // What arrived before the other side closed is still handed over, and the closing is told after it.
      for (const frame of waiting.splice(0)) fn(frame)
      if (!open) whenClosed?.()
    },
    close() {
      if (!open) return
      end()
      shut()
    },
    take(frame) {
      if (!open) return
      if (handler) handler(frame)
      else waiting.push(frame)
    },
    ended: end,
  }
}

// How many frames a link with no network hands over in one turn of the program.
const atOnce = 64

/**
 * Makes the two ends of a link that crosses no network: what one end sends, the other is handed, in order and a
 * moment later, as over a connection. Answers both ends.
 */
export function linkPair(): [Link, Link] {
  const queue: (() => void)[] = []
  let draining = false
  // What is carried arrives a turn of the program later, some frames at a time: so a long row of frames, as a
  // reader that catches up is sent, leaves room for everything else the program does.
  const drain = (): void => {
    for (const one of queue.splice(0, atOnce)) one()
    if (queue.length) setImmediate(drain)
    else draining = false
  }
  // One queue for both directions keeps the order of everything the link carries.
  const later = (work: () => void): void => {
    queue.push(work)
    if (draining) return
    draining = true
    setImmediate(drain)
  }
  const ends: End[] = []
  const a = endOf(
    (frame) => later(() => ends[1].take(frame)),
    () => later(() => ends[1].ended()),
  )
  const b = endOf(
    (frame) => later(() => ends[0].take(frame)),
    () => later(() => ends[0].ended()),
  )
  ends.push(a, b)
  return [a, b]
}

/**
 * Takes a promise of a link, as of one whose part is loaded first. Answers a link at once: what is sent before
 * the link is there waits for it, and a link that never comes is told as closed.
 */
export function linkLater(coming: Promise<Link>): Link {
  let link: Link | undefined
  let over = false
  let handler: [(frame: Frame) => void, (() => void) | undefined] | undefined
  const before: Frame[] = []
  const end = (): void => {
    if (over) return
    over = true
    handler?.[1]?.()
  }
  coming.then((made) => {
    if (over) return made.close()
    link = made
    for (const frame of before.splice(0)) made.send(frame)
    if (handler) made.each(handler[0], handler[1])
  }, end)
  return {
    send(frame) {
      if (link) link.send(frame)
      else if (!over) before.push(frame)
    },
    each(fn, closed) {
      handler = [fn, closed]
      if (link) link.each(fn, closed)
      else if (over) closed?.()
    },
    close() {
      if (link) link.close()
      else end()
    },
  }
}

/** Sends one message of the link: a JSON object in a text frame. */
export const tell = (link: Link, message: object): void => link.send(JSON.stringify(message))

/** Reads a text frame as a message: a JSON object that names itself in `t`. Nothing for any other text. */
export function messageOf(frame: string): (Record<string, unknown> & { t: string }) | undefined {
  try {
    const read: unknown = JSON.parse(frame)
    if (typeof read !== 'object' || read === null || Array.isArray(read)) return undefined
    const t: unknown = Reflect.get(read, 't')
    return typeof t === 'string' ? { ...read, t } : undefined
  } catch {
    return undefined
  }
}
