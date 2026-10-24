import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import { screenRequestCounted } from '../pages/count.ts'
import type { Opened } from '../opened.ts'
import { visit } from '../visit.ts'
import { bodyOf } from '../web/body.ts'
import { signsInPrograms } from './programs.ts'

// The ways of naming a caller that stand for a person at a browser: a key, a token and a program are nobody here.
const people = ['session', 'identify']

/** The person at an address of sign-in for programs: the user that a session or `identify` names. */
export function personOf(caller: Caller): string | undefined {
  const by = visit()?.by
  return caller.kind === 'user' && caller.user && by !== undefined && people.includes(by) ? caller.user.id : undefined
}

/** Whether a request is for an address of sign-in for programs, in an app that has them. */
export function programsAt(request: Request, path: string): boolean {
  const o = visit()?.app
  return new URL(request.url).pathname === path && o !== undefined && signsInPrograms(o.description)
}

/** Step 4 of the door at these addresses: one request is counted for its address, like a request for a screen. */
export const countedHere = (o: Opened, from: string): void => screenRequestCounted(o, from)

/** An answer of JSON in the standard's form, which no cache keeps. */
export const standardJson = (status: number, body: unknown, lines: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...lines,
    },
  })

/** A refusal of the token address in the standard's form: its word, and what is wrong in plain words. */
export const refusedAs = (error: string, description: string, status = 400): Response =>
  standardJson(status, { error, error_description: description })

/** The fields of a body that is a form, read within the size of a call. Throws T0002 for a body of another kind. */
export async function formOf(request: Request, size: number): Promise<URLSearchParams> {
  const type = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (type !== 'application/x-www-form-urlencoded')
    throw new TentError('T0002', 'The body is a form, as `application/x-www-form-urlencoded`.', {
      fix: 'Send the fields as a form.',
    })
  return new URLSearchParams(new TextDecoder().decode(await bodyOf(request, size)))
}
