import type { Opened } from '../opened.ts'
import type { Client } from './clients.ts'
import { cliClient, returnsTo, untrusted } from './clients.ts'
import { scopesOf } from './described.ts'

/** What a client asks for at `/_t/oauth/authorize`, as it was sent. */
export interface Asking {
  client: string
  redirect: string
  challenge: string
  method: string
  state: string
  scope: string
  resource: string
  type: string
}

/** What a client asks for, read from the fields of the address of `/_t/oauth/authorize`. */
export function askingIn(query: URLSearchParams): Asking {
  const field = (name: string): string => query.get(name) ?? ''
  return {
    client: field('client_id'),
    redirect: field('redirect_uri'),
    challenge: field('code_challenge'),
    method: field('code_challenge_method'),
    state: field('state'),
    scope: field('scope'),
    resource: field('resource'),
    type: field('response_type'),
  }
}

/** Whether a value read from a text of the engine is what a client asks for. */
export const isAsking = (value: Record<string, unknown>): value is Record<string, unknown> & Asking =>
  ['client', 'redirect', 'challenge', 'method', 'state', 'scope', 'resource', 'type'].every(
    (name) => typeof value[name] === 'string',
  )

/** What the engine makes of an asking that it trusts: the scopes, what the token is for, and the word of the proof. */
export interface Trusted {
  scopes: string[]
  for: 'mcp' | 'app'
  resource: string
  word: string
}

/**
 * Holds what a client asks for to the rules: a return address that it lists, the standard's code way, the proof
 * with SHA-256, and the address the token is for: `/mcp`, or the app for a client that may ask for it, which any
 * other client that asks for it, and one that states nothing, is given `/mcp` in place of. A word that is no scope
 * is left out, and a client that asks for none is given `read`; the command line asks for both. Throws T0002 for
 * anything that cannot be trusted, which no return is made to.
 */
export function trusted(o: Opened, client: Client, asking: Asking, origin: string): Trusted {
  if (!returnsTo(client, asking.redirect))
    throw untrusted('The return address is not one that the client lists, letter for letter.')
  if (asking.type !== 'code') throw untrusted('A client asks for a code: `response_type=code`.')
  if (asking.method !== 'S256' || !/^[A-Za-z0-9_-]{43,128}$/.test(asking.challenge))
    throw untrusted('A client sends the proof of the standard, with SHA-256.')
  const app = asking.resource === origin || asking.resource === `${origin}/`
  if (asking.resource !== '' && !app && asking.resource !== `${origin}/mcp`)
    throw untrusted('The token is asked for another site than this app.')
  const forApp = app && client.forApp
  const known = scopesOf(o.description)
  const asked = asking.scope.split(/\s+/).filter((one) => one !== '' && known.includes(one))
  const scopes = client.id === cliClient ? ['read', 'write'] : asked.length ? [...new Set(asked)] : ['read']
  return {
    scopes,
    for: forApp ? 'app' : 'mcp',
    resource: forApp ? origin : `${origin}/mcp`,
    word: asking.challenge.slice(0, 6).toUpperCase(),
  }
}
