import { TentError } from '../core/index.ts'
import { isStored } from '../core/internal.ts'
import type { ConnectEnv, Tokens } from './env.ts'
import { valueOf } from './requestOf.ts'

/**
 * The registration of the app with a provider, as a service with the auth `oauth` states it, or as the service
 * that its `connection` names: `owner` is the service whose connections it uses.
 */
export interface Registration {
  owner: string
  authorizeUrl: string
  tokenUrl: string
  revokeUrl?: string
  clientId: string
  clientSecret?: string
  scopes: string[]
  extra: Record<string, string>
  tokenExtra: Record<string, string>
  basic: boolean
  separator: string
  proof: boolean
}

/** The error of a service that has no auth `oauth`, or names a connection that has none. */
const noOauth = (service: string): TentError =>
  new TentError('T0013', `The service ${service} signs in with no connection of a user's own.`, {
    fix: 'Give the service `auth: { oauth: { ... } }`, or name such a service in `connection`.',
  })

/** The texts of a record, each opened where it is a secret. */
const textsOf = (env: ConnectEnv, written: unknown): Record<string, string> =>
  Object.fromEntries(Object.entries(isStored(written) ? written : {}).map(([name, one]) => [name, valueOf(env, one)]))

/**
 * Takes what the engine hands `connect`, a version and a service. Answers the registration its calls are signed
 * with: its own, or that of the service its `connection` names, whose connections it then uses. Throws T0013 for a
 * service with neither, and T0019 for a secret of the registration that has no value.
 */
export function registrationOf(env: ConnectEnv, version: string, service: string): Registration {
  const { services } = env.description(version)
  const stored = Object.hasOwn(services, service) ? services[service] : undefined
  const owner = typeof stored?.connection === 'string' && stored.connection !== '' ? stored.connection : service
  const held = Object.hasOwn(services, owner) ? services[owner] : undefined
  const auth = isStored(held?.auth) ? held.auth : undefined
  const oauth = isStored(auth?.oauth) ? auth.oauth : undefined
  if (!oauth) throw noOauth(service)
  const found = oauth.discover === true ? env.found?.(owner) : undefined
  const text = (value: unknown): string => (typeof value === 'string' ? value : '')
  return {
    owner,
    authorizeUrl: found?.authorizeUrl ?? text(oauth.authorizeUrl),
    tokenUrl: found?.tokenUrl ?? text(oauth.tokenUrl),
    ...(typeof oauth.revokeUrl === 'string' ? { revokeUrl: oauth.revokeUrl } : {}),
    clientId: found?.clientId ?? valueOf(env, oauth.clientId),
    ...(oauth.clientSecret === undefined ? {} : { clientSecret: valueOf(env, oauth.clientSecret) }),
    scopes: found?.scopes ?? (Array.isArray(oauth.scopes) ? oauth.scopes.map(String) : []),
    // The standard's word for what the token is for travels with a server whose documents named it.
    extra: { ...textsOf(env, oauth.extra), ...(found?.resource ? { resource: found.resource } : {}) },
    tokenExtra: { ...textsOf(env, oauth.tokenExtra), ...(found?.resource ? { resource: found.resource } : {}) },
    basic: oauth.tokenAuth === 'basic',
    separator: typeof oauth.scopeSeparator === 'string' ? oauth.scopeSeparator : ' ',
    proof: oauth.proof !== false || found !== undefined,
  }
}

/**
 * Takes what the engine hands `connect`, the service, the version, the state that travels with the user, the
 * address the provider sends the user back to, and the challenge of the proof. Answers the address the user is
 * sent to: the authorization of the provider, with the registration, the scopes, the state and what `extra` adds.
 */
export function connectAddress(
  env: ConnectEnv,
  o: { service: string; version: string; state: string; redirect: string; challenge?: string },
): string {
  const reg = registrationOf(env, o.version, o.service)
  const url = new URL(reg.authorizeUrl)
  const asked: [string, string][] = [
    ['response_type', 'code'],
    ['client_id', reg.clientId],
    ['redirect_uri', o.redirect],
    ['scope', reg.scopes.join(reg.separator)],
    ['state', o.state],
    ...(o.challenge !== undefined && reg.proof
      ? ([
          ['code_challenge', o.challenge],
          ['code_challenge_method', 'S256'],
        ] as [string, string][])
      : []),
    ...Object.entries(reg.extra),
  ]
  for (const [name, value] of asked) url.searchParams.set(name, value)
  return url.href
}

/** What a request for tokens posts beside its own fields: the registration, in the body or as the standard line. */
function posted(reg: Registration, fields: Record<string, string>): { body: URLSearchParams; headers: Headers } {
  const body = new URLSearchParams({ ...fields, ...reg.tokenExtra })
  const headers = new Headers({ 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' })
  if (reg.basic) {
    const pair = `${encodeURIComponent(reg.clientId)}:${encodeURIComponent(reg.clientSecret ?? '')}`
    headers.set('authorization', `Basic ${Buffer.from(pair).toString('base64')}`)
  } else {
    body.set('client_id', reg.clientId)
    if (reg.clientSecret !== undefined) body.set('client_secret', reg.clientSecret)
  }
  return { body, headers }
}

/** The tokens that an answer of the provider holds, read as JSON, or as a form where it says it is one. */
async function tokensIn(env: ConnectEnv, reg: Registration, answer: Response, before?: Tokens): Promise<Tokens> {
  const text = await answer.text()
  const kind = (answer.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  let read: Record<string, unknown> = {}
  if (kind === 'application/x-www-form-urlencoded') read = Object.fromEntries(new URLSearchParams(text))
  else
    try {
      read = Object(JSON.parse(text))
    } catch {
      read = Object.fromEntries(new URLSearchParams(text))
    }
  const access = read.access_token
  if (typeof access !== 'string' || access === '')
    throw new TentError('T7115', 'The provider answered no token.', { service: { status: answer.status } })
  const life = Number(read.expires_in)
  const scope = typeof read.scope === 'string' && read.scope !== '' ? read.scope : undefined
  const refresh = typeof read.refresh_token === 'string' ? read.refresh_token : before?.refresh
  return {
    access,
    ...(refresh === undefined ? {} : { refresh }),
    ...(Number.isFinite(life) && life > 0 ? { expiresAt: env.now() + life * 1000 } : {}),
    scopes: scope ? scope.split(/[\s,]+/).filter(Boolean) : (before?.scopes ?? reg.scopes),
  }
}

/** Posts a request for tokens through the guarded fetch. Answers the answer, or throws T7115 where none came. */
async function askTokens(env: ConnectEnv, reg: Registration, fields: Record<string, string>): Promise<Response> {
  const { body, headers } = posted(reg, fields)
  try {
    return await env.fetch(reg.tokenUrl, { method: 'POST', headers, body })
  } catch (error) {
    if (error instanceof TentError && error.code === 'T0022') throw error
    throw new TentError('T7115', 'The provider did not answer the request for tokens.', { service: {} })
  }
}

/**
 * Takes what the engine hands `connect` and the code that the provider sent the user back with. Answers the tokens
 * it is changed for, with the proof where one was made. Throws T7115 where the provider refuses or answers nothing.
 */
export async function tokensFor(
  env: ConnectEnv,
  o: { service: string; version: string; code: string; redirect: string; verifier?: string },
): Promise<Tokens> {
  const reg = registrationOf(env, o.version, o.service)
  const answer = await askTokens(env, reg, {
    grant_type: 'authorization_code',
    code: o.code,
    redirect_uri: o.redirect,
    ...(o.verifier !== undefined && reg.proof ? { code_verifier: o.verifier } : {}),
  })
  if (!answer.ok)
    throw new TentError('T7115', `The provider refused the code with ${answer.status}.`, {
      service: { status: answer.status, body: (await answer.text()).slice(0, 16_384) },
    })
  return tokensIn(env, reg, answer)
}

/**
 * Takes what the engine hands `connect`, a registration and the tokens of a connection. Answers the tokens that the
 * renewal token brings, or `refused` where the provider said no. Throws T7115 where it answered nothing.
 */
export async function renewed(env: ConnectEnv, reg: Registration, tokens: Tokens): Promise<Tokens | 'refused'> {
  if (tokens.refresh === undefined) return 'refused'
  const answer = await askTokens(env, reg, { grant_type: 'refresh_token', refresh_token: tokens.refresh })
  if (answer.status === 400 || answer.status === 401) return 'refused'
  if (!answer.ok)
    throw new TentError('T7115', `The provider answered the renewal with ${answer.status}.`, {
      service: { status: answer.status },
    })
  return tokensIn(env, reg, answer, tokens)
}

/**
 * Takes what the engine hands `connect`, a service, a version and the tokens of a connection. Posts the tokens to
 * `revokeUrl` of the registration, the renewal token and then the access token, each as a form with the
 * registration as `tokenAuth` says, through the guarded fetch. Whatever the provider answers, nothing is thrown
 * but T0022 for an address it may not reach.
 */
export async function revoke(env: ConnectEnv, o: { service: string; version: string; tokens: Tokens }): Promise<void> {
  const reg = registrationOf(env, o.version, o.service)
  const { revokeUrl } = reg
  if (revokeUrl === undefined) return
  // The standard takes back one token in each request (RFC 7009, section 2.1), and the renewal token outlives the other.
  const each = [
    ...(o.tokens.refresh === undefined ? [] : [{ token: o.tokens.refresh, token_type_hint: 'refresh_token' }]),
    { token: o.tokens.access, token_type_hint: 'access_token' },
  ]
  for (const fields of each) {
    const { body, headers } = posted(reg, fields)
    try {
      await (await env.fetch(revokeUrl, { method: 'POST', headers, body })).arrayBuffer()
    } catch (error) {
      if (error instanceof TentError && error.code === 'T0022') throw error
    }
  }
}
