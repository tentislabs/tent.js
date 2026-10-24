import { moves } from '../moving.ts'
import type { Reach } from '../reach.ts'
import { uploads } from '../upload.ts'

/** One live query that the page watches, as the record of the page holds it: what it asks, and whether it landed. */
interface Watched {
  query: string
  landed: boolean
}

/** What the page tells a test of what it set off: its requests, its watches, and the write it heard of. */
export interface PageRecord {
  /** What the page waits for still, each in words, before what it set off has landed: nothing once it has. */
  waiting(write?: number): string[]
  /** Names what is told each time the record changes, and answers what stops telling it. */
  listen(heard: () => void): () => void
  /** The trace of each call the page made, in order. */
  traces(): string[]
}

/** The number of the write that a mark of `Tent-At` names: its last number. */
const writeOf = (at: unknown): number => (typeof at === 'string' ? Number(at.split('.').pop()) : Number.NaN)

/** A message of the connection, read from JSON, or nothing for one that does not read. */
function read(text: string): Record<string, unknown> | undefined {
  try {
    const told: unknown = JSON.parse(text)
    return typeof told === 'object' && told !== null && !Array.isArray(told) ? Object(told) : undefined
  } catch {
    return undefined
  }
}

/**
 * Takes what a living page reaches its engine through. Answers it with every request, every load and the live
 * connection passing through the record of the page, and the record: so the page tells a test exactly when every
 * call it made was answered, every watch received the answer that holds a write, and its moves loaded their screens.
 */
export function recorded(reach: Reach): { reach: Reach; record: PageRecord } {
  const under = new Map<number, string>()
  const watches = new Map<string, Watched>()
  const traces: string[] = []
  const heard = new Set<() => void>()
  let ids = 0
  let opening = false
  let leaving = false
  let written = Number.NEGATIVE_INFINITY
  const changed = (): void => {
    for (const one of heard) one()
  }
  // An upload goes to the files door by a request of its own, outside what the page reaches the engine through.
  uploads.listen(changed)
  moves.listen(changed)
  /** Holds a request as under way until it is answered or fails. */
  function held<Answer>(what: string, asked: Promise<Answer>): Promise<Answer> {
    const id = ++ids
    under.set(id, what)
    changed()
    return asked.finally(() => {
      under.delete(id)
      changed()
    })
  }
  /** Takes what the page sends over its connection. */
  const sent = (text: string): void => {
    const told = read(text)
    if (!told || typeof told.id !== 'string') return
    if (told.t === 'watch') watches.set(told.id, { query: String(told.query), landed: false })
    if (told.t === 'unwatch') watches.delete(told.id)
    changed()
  }
  /** Takes what the engine sends the page over its connection. */
  const took = (text: string): void => {
    const told = read(text)
    if (!told) return
    if (Number.isFinite(writeOf(told.at))) written = Math.max(written, writeOf(told.at))
    const watch = typeof told.id === 'string' ? watches.get(told.id) : undefined
    if (watch && (told.t === 'result' || told.t === 'rows')) watch.landed = true
    // One watch too many is sent again by the page; any other failure ends the watch.
    if (watch && told.t === 'failed') {
      const error: unknown = told.error
      if (typeof error === 'object' && error !== null && Reflect.get(error, 'code') === 'T0005') watch.landed = false
      else if (typeof told.id === 'string') watches.delete(told.id)
    }
    // Every watch that the engine names here holds the answer it was sent, or held already.
    if (told.t === 'at' && Array.isArray(told.ids))
      for (const id of told.ids) {
        const named = typeof id === 'string' ? watches.get(id) : undefined
        if (named) named.landed = true
      }
    changed()
  }
  const watched: Reach = {
    ...reach,
    post(address, body, headers) {
      const trace = headers?.traceparent?.split('-')[1]
      if (trace && !traces.includes(trace)) traces.push(trace)
      return held(`the call ${address}`, reach.post(address, body, headers))
    },
    go(address, replace) {
      leaving = true
      changed()
      reach.go(address, replace)
    },
    ...(reach.get
      ? { get: (address) => held(`the request ${address}`, reach.get?.(address) ?? Promise.resolve()) }
      : {}),
    ...(reach.load
      ? { load: (files) => held(`the files ${files.join(', ')}`, reach.load?.(files) ?? Promise.resolve([])) }
      : {}),
    ...(reach.part
      ? { part: (name) => held(`the part ${name} of the page code`, reach.part?.(name) ?? Promise.resolve()) }
      : {}),
    ...(reach.socket
      ? {
          socket(address, on) {
            opening = true
            changed()
            const socket = reach.socket?.(address, {
              opened() {
                opening = false
                // The engine is asked first to tell this page the write that the answers of its watches hold.
                socket?.send('{"t":"at"}')
                changed()
                on.opened()
              },
              message(text) {
                on.message(text)
                took(text)
              },
              closed() {
                opening = false
                // The page sends every watch again once a connection stands: what it held of them is gone.
                watches.clear()
                changed()
                on.closed()
              },
            })
            return {
              send(text) {
                sent(text)
                socket?.send(text)
              },
              close: () => socket?.close(),
            }
          },
        }
      : {}),
  }
  const record: PageRecord = {
    waiting(write) {
      const left = [...under.values()]
      if (uploads.under()) left.push('the upload of a file')
      if (moves.under()) left.push('the transition of a move between screens')
      if (leaving) left.push('the load of another page')
      if (opening) left.push('the opening of the live connection')
      for (const [, watch] of watches) if (!watch.landed) left.push(`the answer of the watch of ${watch.query}`)
      if (write !== undefined && watches.size && written < write)
        left.push(
          `the write ${write} on the live connection, which holds ${Number.isFinite(written) ? written : 'none'}`,
        )
      return left
    },
    listen(one) {
      heard.add(one)
      return () => void heard.delete(one)
    },
    traces: () => [...traces],
  }
  return { reach: watched, record }
}
