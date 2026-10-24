import { randomFillSync } from 'node:crypto'

/** A trace and a span within it, as the `traceparent` header of the standard names them. */
export interface Parent {
  trace: string
  span: string
}

// The id that the standard holds to be no id: all zeros.
const zeros = /^0+$/

// Random bytes drawn many at once, since every span takes an id: a draw of the system for each would cost a call.
const pool = Buffer.alloc(4096)
let at = pool.length

/** So many random bytes as hex, from the pool. */
function randomHex(bytes: number): string {
  if (at + bytes > pool.length) {
    randomFillSync(pool)
    at = 0
  }
  const hex = pool.toString('hex', at, at + bytes)
  at += bytes
  return hex
}

/** A new id of a trace: 32 hex characters, never all zeros. */
export function newTraceId(): string {
  const id = randomHex(16)
  return zeros.test(id) ? newTraceId() : id
}

/** A new id of a span: 16 hex characters, never all zeros. */
export function newSpanId(): string {
  const id = randomHex(8)
  return zeros.test(id) ? newSpanId() : id
}

/**
 * Reads a `traceparent` header: its version, the trace id, the id of the span it names as parent, and its flags,
 * each as the standard writes them. Answers the trace and the span, or nothing for a header that does not read,
 * names an id of all zeros, or is of the version that the standard keeps as none.
 */
export function readParent(header: string | null | undefined): Parent | undefined {
  if (!header) return undefined
  const found = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})(-.*)?$/.exec(header.trim())
  if (!found) return undefined
  const [, version, trace, span, , more] = found
  // A later version may add fields after the four; version 00 adds none, and ff is no version.
  if (version === 'ff' || (version === '00' && more !== undefined)) return undefined
  if (zeros.test(trace) || zeros.test(span)) return undefined
  return { trace, span }
}

/** The `traceparent` header that names a span of a trace as the parent of what it is sent with, marked as kept. */
export const parentHeader = (parent: Parent): string => `00-${parent.trace}-${parent.span}-01`

/** Whether a text is the id of a trace, as `tent logs --trace` is handed one. */
export const isTraceId = (text: unknown): text is string => typeof text === 'string' && /^[0-9a-f]{32}$/.test(text)
