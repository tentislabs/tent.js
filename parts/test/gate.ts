import type { Frame, Link } from '../engine/index.ts'

/** A link of a test reader, as the test holds it back and lets it go. */
export interface Gate extends Link {
  /** From now on nothing passes, in either direction: what is sent, and that the link was closed, waits. */
  hold(): void
  /** Lets everything that waited pass, in its order, and what follows it. */
  release(): void
}

/**
 * Takes a link, and whether it starts held. Answers the same link behind a gate: while it is held, every frame
 * that either side sends waits, and so does the closing of the other side.
 */
export function gateOf(inner: Link, held: boolean): Gate {
  let handler: ((frame: Frame) => void) | undefined
  let closed: (() => void) | undefined
  let ended = false
  let told = false
  const out: Frame[] = []
  const coming: Frame[] = []
  const pass = (): void => {
    if (held || !handler) return
    for (const frame of coming.splice(0)) handler(frame)
    if (ended && !told) {
      told = true
      closed?.()
    }
  }
  inner.each(
    (frame) => {
      coming.push(frame)
      pass()
    },
    () => {
      ended = true
      pass()
    },
  )
  return {
    send(frame) {
      if (held) out.push(frame)
      else inner.send(frame)
    },
    each(fn, whenClosed) {
      handler = fn
      closed = whenClosed
      pass()
    },
    close() {
      out.length = 0
      inner.close()
    },
    hold() {
      held = true
    },
    release() {
      held = false
      for (const frame of out.splice(0)) inner.send(frame)
      pass()
    },
  }
}
