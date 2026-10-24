import { randomBytes } from 'node:crypto'
import { later, TentError } from '../core/index.ts'
import type { Opened } from './opened.ts'

/**
 * What a token of the inspect mode holds: the origin of the tool, whether the tool opens the page in a window of
 * its own in place of a frame, and the moment the token ends.
 */
interface Held {
  origin: string
  opener: boolean
  ends: number
}

// A token lives in the memory of the engine alone, as a pass does: it is gone when the app is closed or sleeps.
const held = new WeakMap<Opened, Map<string, Held>>()

// How long a token holds where `for` is left out, in milliseconds.
const hour = 3_600_000

/** 32 random characters that are safe in an address. */
const random = (): string => randomBytes(24).toString('base64url')

const refused = (what: string, fix: string, field: string): TentError =>
  new TentError('T0002', what, { fix, fields: { [field]: 'pattern' } })

// One origin, by the form of its text: http or https, a host - names of letters, digits and hyphens joined by dots,
// or an address of the newer kind in brackets - and a port, and nothing else.
const originForm =
  /^https?:\/\/([a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*|\[[0-9a-f:.]+\])(:[0-9]{1,5})?$/

/** Whether a text is one origin, by its form, and as the runtime reads it: what it writes of the text is the text. */
function isOrigin(text: unknown): text is string {
  if (typeof text !== 'string' || !originForm.test(text)) return false
  try {
    return new URL(text).origin === text
  } catch {
    return false
  }
}

/**
 * Takes what was given as `framedBy`. Answers the origin of the tool, and whether the tool opens the page in a window
 * of its own: one origin - a scheme, a host and a port, and nothing else - or `{ opener: <origin> }`. Throws T0002
 * for anything else.
 */
function toolOf(framedBy: unknown): { origin: string; opener: boolean } {
  if (isOrigin(framedBy)) return { origin: framedBy, opener: false }
  const opened = typeof framedBy === 'object' && framedBy !== null && !Array.isArray(framedBy) ? framedBy : {}
  const origin: unknown = Reflect.get(opened, 'opener')
  if (Object.keys(opened).length === 1 && isOrigin(origin)) return { origin, opener: true }
  throw refused(
    `The inspect mode is given for one origin, and ${JSON.stringify(framedBy)?.slice(0, 80)} is none.`,
    "Name the origin of the tool alone, as 'https://studio.example.com' or 'http://localhost:5173', or { opener: <origin> } for a tool that opens the page in a window of its own.",
    'framedBy',
  )
}

/**
 * Takes an app and what `app.inspect` was given: `{ framedBy, for? }`. Makes a token that puts a page into the
 * inspect mode for a tool of that origin, which holds for `for`, one hour where it is left out, and answers it.
 * Throws T0002 for a `framedBy` that is no origin, and for a `for` that is no length of time.
 */
export function makeInspectToken(o: Opened, given: unknown): string {
  const tool = toolOf(Reflect.get(Object(given), 'framedBy'))
  const asked: unknown = Reflect.get(Object(given), 'for')
  let lasts = hour
  if (asked !== undefined) {
    try {
      lasts = later(new Date(0), String(asked)).getTime()
    } catch {
      lasts = Number.NaN
    }
    if (typeof asked !== 'string' || !(lasts > 0))
      throw refused(
        `The inspect mode holds for a length of time, and ${JSON.stringify(asked)?.slice(0, 80)} is none.`,
        "Write a length of time, as '30 minutes', or leave `for` out for one hour.",
        'for',
      )
  }
  const now = o.clock.now()
  const tokens = held.get(o) ?? new Map<string, Held>()
  held.set(o, tokens)
  // A token whose end has come is forgotten when another is made, so that the tokens of a long day are few.
  for (const [token, one] of tokens) if (one.ends <= now) tokens.delete(token)
  const token = random()
  tokens.set(token, { ...tool, ends: now + lasts })
  return token
}

/**
 * Takes an app and a token as an address carried it. Answers the origin that the token was made for, and whether
 * the tool opens the page in a window of its own, where it is a token of this app and its end has not come, and
 * nothing otherwise.
 */
export function inspectHeld(o: Opened, token: string | null): { origin: string; opener: boolean } | undefined {
  if (token === null || !/^[A-Za-z0-9_-]{32}$/.test(token)) return undefined
  const one = held.get(o)?.get(token)
  if (!one) return undefined
  if (one.ends > o.clock.now()) return { origin: one.origin, opener: one.opener }
  held.get(o)?.delete(token)
  return undefined
}
