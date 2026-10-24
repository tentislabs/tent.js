import { AsyncLocalStorage } from 'node:async_hooks'
import type { Caller } from '../core/index.ts'
import type { Opened } from './opened.ts'
import type { About } from './web/proxy.ts'

/**
 * One request of the web while it is answered: what the engine knows of it, how its caller was named, and what
 * the answer carries beside its body because of what the request did.
 */
export interface Visit {
  app: Opened
  request: Request
  about: About
  // The way that named the caller, by the name of its file in `callers/`: nothing for a caller who is nobody.
  by?: string
  // The fingerprint of the session that the request came with, or that it started.
  session?: string
  // The lines of `Set-Cookie` that the answer carries.
  cookies: string[]
  // A session was started or ended while the request was answered, or its caller is not the one its page names.
  changed: boolean
  // The head of the answer is on its way: no cookie can be set any more.
  answered: boolean
  // On a reader: the session of the request is due to be moved on, which the writer alone does.
  due?: true
  // What the bytes of the request are counted under, and the caller that the door named.
  counted?: { name: string; caller?: Caller }
}

const visits = new AsyncLocalStorage<Visit>()

/** Answers the request of the web that is being answered, or nothing where the work under way belongs to none. */
export const visit = (): Visit | undefined => visits.getStore()

/** Carries the answering of one request out, so that what works for it finds the request. */
export const visiting = <Answer>(one: Visit, work: () => Answer): Answer => visits.run(one, work)

// The ways of naming a caller that stand for a browser: a caller that a key, a token or a program named has no
// cookie to be handed.
const browsers: (string | undefined)[] = [undefined, 'session', 'identify']

/**
 * Answers the request of a browser that is being answered, to which a cookie can still be handed. Nothing where
 * no request is under way, where a program named its caller, and once the head of the answer is sent.
 */
export function browserVisit(): Visit | undefined {
  const one = visit()
  return one && !one.answered && browsers.includes(one.by) ? one : undefined
}
