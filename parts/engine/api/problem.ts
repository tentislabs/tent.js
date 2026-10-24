import { TentError } from '../../core/index.ts'
import { failureOf } from '../door/failure.ts'
import type { Opened } from '../opened.ts'
import { everyAnswer, wireError } from '../wire.ts'

/** The seconds until a count by the minute lets a caller in again. */
const untilNextMinute = (now: number): number => Math.max(1, Math.ceil((60_000 - (now % 60_000)) / 1000))

/**
 * Takes an app, the name of what failed, and the error. Answers the failure in the standard form of a problem,
 * by the rule of what a caller sees, with the status of its code. A 401 names the bearer sign-in, and a refusal by
 * a count says when to come back.
 */
export function problemAnswer(o: Opened, name: string, error: unknown): Response {
  const { ref } = failureOf(o, name, error)
  const { status, error: sent } = wireError(error, o.mode !== 'live', { ...(ref ? { ref } : {}) })
  const body = {
    type: 'about:blank',
    title: sent.name,
    status,
    code: sent.code,
    message: sent.message,
    ...(sent.fields ? { fields: sent.fields } : {}),
    ...(sent.ref ? { ref: sent.ref } : {}),
    ...(sent.fix ? { fix: sent.fix } : {}),
  }
  const headers: Record<string, string> = { ...everyAnswer, 'content-type': 'application/problem+json; charset=utf-8' }
  if (status === 401) headers['www-authenticate'] = 'Bearer'
  if (error instanceof TentError && error.code === 'T0005')
    headers['retry-after'] = String(untilNextMinute(o.clock.now()))
  return new Response(JSON.stringify(body), { status, headers })
}

/** Answers what a function answered: the value itself as JSON with 200, or 204 and no body where it answers nothing. */
export function valueAnswer(value: unknown, more: Record<string, string> = {}): Response {
  if (value === undefined) return new Response(null, { status: 204, headers: { ...everyAnswer, ...more } })
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { ...everyAnswer, 'content-type': 'application/json; charset=utf-8', ...more },
  })
}
