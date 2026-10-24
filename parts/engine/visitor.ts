import { randomInt } from 'node:crypto'
import { cookieLine, cookieName, cookieOf } from './cookies.ts'
import { storedLimit } from './limits.ts'
import type { Opened } from './opened.ts'
import type { Visit } from './visit.ts'
import { visit } from './visit.ts'
import type { About } from './web/proxy.ts'

// A visitor id is 32 of the letters of the id of a row.
const letters = '0123456789abcdefghjkmnpqrstvwxyz'
const form = /^[0-9a-hjkmnp-tv-z]{32}$/

/**
 * Takes an app, a request and what the engine knows of it. Answers the visitor id that the cookie of the request
 * carries, or nothing where the request carries no visitor cookie, or two. The id is written nowhere as it is:
 * wherever the engine writes a visitor it writes the first 32 characters of the fingerprint of the id.
 */
export function visitorIn(o: Opened, request: Request, about: About): string | undefined {
  const id = cookieOf(request, cookieName(o, about, 'visitor'))
  return id !== undefined && form.test(id) ? id : undefined
}

/**
 * Takes the request of a browser that is being answered. Answers the visitor id of that browser: the one its
 * cookie carries, or a new one, whose cookie the answer then carries for `limits.visitorTime`. It is no session and
 * no user: it ties a visitor to their own files and runs.
 */
export function visitorOf(here: Visit): string {
  const held = visitorIn(here.app, here.request, here.about)
  if (held !== undefined) return held
  const id = Array.from({ length: 32 }, () => letters[randomInt(32)]).join('')
  here.cookies.push(cookieLine(here.app, here.about, 'visitor', id, storedLimit(here.app.description, 'visitorTime')))
  return id
}

/** The visitor id that the request being answered carries, where one is being answered, and nothing elsewhere. */
export function visitorNow(): string | undefined {
  const here = visit()
  return here ? visitorIn(here.app, here.request, here.about) : undefined
}
