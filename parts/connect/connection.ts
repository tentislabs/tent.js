import type { Caller } from '../core/index.ts'
import { TentError } from '../core/index.ts'
import type { ConnectEnv, Tokens } from './env.ts'
import type { Registration } from './oauth.ts'
import { registrationOf, renewed } from './oauth.ts'

/** The renewals that are under way, by the connection they renew: one at a time for a service and a user. */
export type Renewals = Map<string, Promise<Tokens>>

/** The access token of a call with the auth `oauth`, and what renews it once after an answer of 401. */
export interface Connected {
  access: string
  again(): Promise<string | undefined>
}

/** T7117: a call of a service whose auth is `oauth`, for no user, or for a user with no connection. */
const notConnected = (service: string, words: string): TentError =>
  new TentError('T7117', `The service ${service} is called ${words}.`, {
    fields: { service },
    fix: 'Have the user connect their account first, with `connections.start`.',
  })

// A token that ends within this many milliseconds is renewed before the call.
const soon = 60_000

/**
 * Takes what the engine hands `connect`, the renewals under way, and a call: its service, its version, its caller,
 * and whose account it names. Answers the access token of the connection the call uses, renewed first where it ends
 * within a minute, and what renews it after a 401. One renewal runs at a time for a connection: a second call that
 * needs one waits for it and uses what it brought. A renewal that the provider refuses removes the connection.
 * Throws T7117 for a call for no user or with no connection, and T7115 where a renewal got no answer.
 */
export async function connectionOf(
  env: ConnectEnv,
  renewals: Renewals,
  o: { service: string; version: string; caller: Caller; for?: string; account?: string },
): Promise<Connected> {
  const reg = registrationOf(env, o.version, o.service)
  const user = o.for ?? o.caller.user?.id
  if (user === undefined) throw notConnected(o.service, 'for no user')
  const account = o.account ?? ''
  const key = `${reg.owner}\n${user}\n${account}`
  const held = (): Tokens => {
    const tokens = env.tokens.read(reg.owner, user, account)
    if (!tokens)
      throw notConnected(o.service, `for a user who has no connection to it${account ? ` as ${account}` : ''}`)
    return tokens
  }
  /** Renews the tokens of the connection, or waits for the renewal that is under way. */
  const renew = (tokens: Tokens, r: Registration): Promise<Tokens> => {
    const under = renewals.get(key)
    if (under) return under
    const made = (async () => {
      const answer = await renewed(env, r, tokens)
      if (answer === 'refused') {
        env.tokens.write(r.owner, user, account, undefined)
        throw notConnected(o.service, 'for a user whose connection the provider no longer takes')
      }
      env.tokens.write(r.owner, user, account, answer)
      return answer
    })().finally(() => renewals.delete(key))
    renewals.set(key, made)
    return made
  }
  let tokens = held()
  if (renewals.has(key) || (tokens.expiresAt !== undefined && tokens.expiresAt - env.now() < soon))
    tokens = await renew(tokens, reg)
  const sent = tokens
  return {
    access: tokens.access,
    async again() {
      const now = held()
      // Another call renewed it meanwhile: its token is used.
      if (now.access !== sent.access) return now.access
      // With no renewal token the 401 stands, as the failure of the call.
      if (now.refresh === undefined) return undefined
      return (await renew(now, reg)).access
    },
  }
}
