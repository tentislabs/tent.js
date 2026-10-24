import { isIP } from 'node:net'
import type { Opened } from '../opened.ts'
import type { About } from '../web/proxy.ts'
import type { Parent } from './ids.ts'
import { readParent } from './ids.ts'
import { spanWhole } from './keeping.ts'
import type { SpanOpening, Span } from './span.ts'
import { endSpan, failSpan, openSpan, spanNow } from './span.ts'

/** Whether an address is one of this computer. */
function isHere(address: string): boolean {
  const plain = address.replace(/^::ffff:/i, '')
  if (plain === '::1' || plain === 'localhost') return true
  return isIP(plain) === 4 && plain.startsWith('127.')
}

// The moves of a page that begin a trace, as its page code names them in `tracestate`.
const moves = ['press', 'move', 'load']

// The press of a page that each trace was last seen with, so that the span of the press is kept once.
const pressed = new WeakMap<Opened, Set<string>>()

/**
 * The parent that a request names, where the door trusts its sender with it: this computer, a proxy that the
 * engine was told of, and a reader that handed the request on. From anyone else the header begins nothing.
 */
function trustedParent(request: Request, about: About, handed: string | undefined): Parent | undefined {
  if (handed !== undefined) return readParent(handed)
  if (!about.proxied && !isHere(about.from)) return undefined
  return readParent(request.headers.get('traceparent'))
}

/**
 * Takes an app, a request with what the engine knows of it, and the span a reader of the app handed it on under, as
 * a word of the link that no code of the app is handed. Opens the
 * span of the door's handling of the request: in the trace that the request names where its sender is trusted, and
 * otherwise as the first span of a new trace, with a header that was sent as a fact. A page names the move that
 * made the request in `tracestate`: its span stands at the top of the trace, once.
 */
export function doorSpan(o: Opened, request: Request, about: About, handed: string | undefined): Span | undefined {
  const sent = request.headers.get('traceparent')
  const parent = trustedParent(request, about, handed)
  const opening: SpanOpening = {
    name: 'request',
    kind: 'door',
    facts: {
      method: request.method,
      ...(sent !== null && !parent ? { traceparent: sent.slice(0, 64) } : {}),
    },
    ...(parent ? { under: parent } : {}),
  }
  const span = openSpan(o, opening)
  const state = /(?:^|,)\s*tent=([a-z]+)/.exec(request.headers.get('tracestate') ?? '')?.[1]
  if (span && parent && state && moves.includes(state)) {
    const seen = pressed.get(o) ?? new Set<string>()
    pressed.set(o, seen)
    const key = `${parent.trace}.${parent.span}`
    if (!seen.has(key)) {
      seen.add(key)
      if (seen.size > 10_000) seen.clear()
      const move: Span = {
        o,
        trace: parent.trace,
        id: parent.span,
        name: state,
        kind: 'page',
        at: span.at,
        began: span.began,
        facts: {},
      }
      spanWhole(move, 0)
    }
  }
  return span
}

/**
 * Closes the span of the door with how the request was answered: a status of 500 or more failed it, under the status
 * as its code. A refusal of the caller is the caller's, and keeps no trace whole by itself.
 */
export function doorEnded(span: Span | undefined, answer: Response): void {
  if (!span) return
  span.facts.status = answer.status
  if (answer.status >= 500) failSpan(span, String(answer.status))
  endSpan(span)
}

/** Names the span of the door under way by the address that answers the request. */
export function nameDoor(address: string): void {
  const span = spanNow()
  if (span?.kind === 'door') span.name = address
}
