import { closeSync, openSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Reach } from '../env.ts'
import { keepTokens, keptApp } from './keys.ts'

/** The id that the app's own command line names itself by. */
export const cliClient = 'tent-cli'

// How long a lock on the file of the keys may stand before it is taken as left over by a program that ended.
const staleLock = 30_000

const pause = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

/**
 * Carries work out under a lock on the file of the keys, so that two commands that run side by side renew once:
 * the second waits for the first, and finds what it brought.
 */
async function underLock<Answer>(home: string, work: () => Promise<Answer>): Promise<Answer> {
  const lock = join(home, 'keys.json.lock')
  for (let tries = 0; ; tries++) {
    try {
      closeSync(openSync(lock, 'wx'))
      break
    } catch {
      let left = false
      try {
        left = Date.now() - statSync(lock).mtimeMs > staleLock
      } catch {
        left = false
      }
      if (left) rmSync(lock, { force: true })
      else if (tries > 400) throw new Error('The file of the keys stayed locked by another command.')
      else await pause(25)
    }
  }
  try {
    return await work()
  } finally {
    rmSync(lock, { force: true })
  }
}

/** The tokens that the token address answered, read from its body, or nothing for a refusal. */
export async function tokensOf(
  answer: Response,
): Promise<{ access: string; refresh: string; expiresAt: number } | undefined> {
  const read: unknown = await answer.json().catch(() => undefined)
  const access: unknown = Reflect.get(Object(read), 'access_token')
  const refresh: unknown = Reflect.get(Object(read), 'refresh_token')
  const life: unknown = Reflect.get(Object(read), 'expires_in')
  if (!answer.ok || typeof access !== 'string' || typeof refresh !== 'string') return undefined
  return { access, refresh, expiresAt: Date.now() + (typeof life === 'number' ? life * 1000 : 3_600_000) }
}

/** A request of the token address, as a form, through a reach that adds no sign-in of its own. */
export const tokenRequest = (fields: Record<string, string>): Request =>
  new Request('http://localhost/_t/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  })

/**
 * Renews the tokens of a server under the lock of the file of the keys, where they are still the ones that failed:
 * another command that renewed first leaves the ones it brought, which are taken. Answers the access token to send,
 * or nothing where the grant does not renew.
 */
async function renewed(reach: Reach, home: string, address: string, failed: string): Promise<string | undefined> {
  return underLock(home, async () => {
    const kept = keptApp(home, address)
    if (!kept?.access || !kept.refresh) return undefined
    if (kept.access !== failed) return kept.access
    const tokens = await tokensOf(
      await reach.request(
        tokenRequest({ grant_type: 'refresh_token', refresh_token: kept.refresh, client_id: cliClient }),
      ),
    )
    if (!tokens) return undefined
    keepTokens(home, address, tokens)
    return tokens.access
  })
}

/**
 * A reach that sends the access token that a `login` in the browser kept for a server with each request that names
 * no sign-in of its own, and the live connection. A token that has ended, or is answered 401, is renewed once, and
 * the request is sent again with the new one.
 */
export function tokenReach(reach: Reach, home: string, address: string): Reach {
  const signed = (request: Request, token: string): Request => {
    if (request.headers.has('authorization')) return request
    const headers = new Headers(request.headers)
    headers.set('authorization', `Bearer ${token}`)
    return new Request(request, { headers })
  }
  const current = async (): Promise<string | undefined> => {
    const kept = keptApp(home, address)
    if (!kept?.access) return undefined
    // A token that ends within a minute is renewed before it is sent.
    return (kept.expiresAt ?? 0) - Date.now() < 60_000 ? renewed(reach, home, address, kept.access) : kept.access
  }
  return {
    async request(request) {
      const token = await current()
      if (!token) return reach.request(request)
      const again = request.clone()
      const answer = await reach.request(signed(request, token))
      if (answer.status !== 401 || request.headers.has('authorization')) return answer
      const next = await renewed(reach, home, address, token)
      return next ? reach.request(signed(again, next)) : answer
    },
    async live(request) {
      const token = await current()
      return reach.live(token ? signed(request, token) : request)
    },
  }
}
