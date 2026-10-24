import { TentError } from '../../../core/index.ts'
import { setNote } from '../../fill/notes.ts'
import { metaOf } from '../../held.ts'
import type { Opened } from '../../opened.ts'
import { connectEnvOf } from '../../services/env.ts'
import { privateHostsOf } from '../../fetch/address.ts'
import { isStored } from '../../../core/internal.ts'

/** What the engine read of a server that names where it signs people in, in its own describing documents. */
interface Described {
  authorizeUrl: string
  tokenUrl: string
  registerUrl?: string
  // Whether the server takes a client by the address of a document of its own.
  documents: boolean
  scopes: string[]
  resource: string
  // The host that signs people in, and why no person may be sent there, where the guard refuses it.
  host: string
  refused?: TentError
}

const read = new WeakMap<Opened, Map<string, Described>>()
const registering = new WeakMap<Opened, Set<string>>()

/** The services of an app whose auth is `oauth` with `discover`. */
export function discovering(o: Opened): string[] {
  return Object.entries(o.description.services).flatMap(([name, stored]) =>
    isStored(stored.auth) && isStored(stored.auth.oauth) && stored.auth.oauth.discover === true ? [name] : [],
  )
}

/** A document of JSON at an address, through the guarded fetch: nothing for one that is not there or no JSON. */
async function documentAt(o: Opened, address: string): Promise<Record<string, unknown> | undefined> {
  const answer = await connectEnvOf(o).fetch(address, { headers: { accept: 'application/json' }, size: 65_536 })
  if (!answer.ok) return undefined
  try {
    const body: unknown = await answer.json()
    return isStored(body) ? body : undefined
  } catch {
    return undefined
  }
}

/** Why the guard refuses a person's browser to be sent to an address, or nothing where it may be. */
async function refusalOf(o: Opened, address: string): Promise<TentError | undefined> {
  const { guardedAddress } = await import('../../../connect/index.ts')
  try {
    await guardedAddress(new URL(address).hostname, { privateHosts: privateHostsOf(o.description), mode: o.mode })
    return undefined
  } catch (error) {
    return error instanceof TentError ? error : new TentError('T0022', `The address ${address} is refused.`)
  }
}

/**
 * Reads where a server signs people in, from its own documents: the document of the guarded address names the
 * server of the sign-in, and its document the addresses, the scopes, and whether it takes a client by a document
 * of its own or by registering. The addresses they name are reached through the guarded fetch alone, and the one
 * a person is sent to is held to the same guard before anyone is sent there.
 */
async function described(o: Opened, service: string): Promise<Described | undefined> {
  const url = new URL(String(o.description.services[service]?.url ?? ''))
  const path = url.pathname === '/' ? '' : url.pathname
  const resource =
    (await documentAt(o, `${url.origin}/.well-known/oauth-protected-resource${path}`)) ??
    (await documentAt(o, `${url.origin}/.well-known/oauth-protected-resource`))
  const servers = Array.isArray(resource?.authorization_servers) ? resource.authorization_servers.map(String) : []
  const issuer = servers[0] ?? url.origin
  const server = await documentAt(o, `${issuer.replace(/\/$/, '')}/.well-known/oauth-authorization-server`)
  if (!server || typeof server.authorization_endpoint !== 'string' || typeof server.token_endpoint !== 'string')
    return undefined
  const scopes = Array.isArray(resource?.scopes_supported) ? resource.scopes_supported.map(String) : []
  const refused = await refusalOf(o, server.authorization_endpoint)
  return {
    authorizeUrl: server.authorization_endpoint,
    tokenUrl: server.token_endpoint,
    ...(typeof server.registration_endpoint === 'string' ? { registerUrl: server.registration_endpoint } : {}),
    documents: server.client_id_metadata_document_supported === true,
    scopes,
    resource: typeof resource?.resource === 'string' ? resource.resource : url.href,
    host: new URL(server.authorization_endpoint).host,
    ...(refused ? { refused } : {}),
  }
}

/** The address of the document by which the app names itself to a server, under the name it was reached by. */
export const clientDocument = (origin: string, service: string): string => `${origin}/_t/connect/${service}/client`

/** Whether an origin is one of this computer, where no server can fetch a document of the app. */
const onThisComputer = (origin: string): boolean => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(origin)

/** Whether the app registers with a server for a name it is reached by: where the server takes no document, and on this computer. */
const registers = (found: Described, origin: string): boolean =>
  found.registerUrl !== undefined && (!found.documents || onThisComputer(origin))

const metaKey = (service: string, origin: string): string => `mcp.registered.${service}.${origin}`

/** Registers the app with a server once, for a service and the name it was reached by, and keeps the id. */
async function registered(o: Opened, service: string, origin: string, found: Described): Promise<void> {
  const busy = registering.get(o) ?? new Set<string>()
  registering.set(o, busy)
  const key = metaKey(service, origin)
  if (busy.has(key) || !found.registerUrl || typeof metaOf(o.store, key) === 'string') return
  busy.add(key)
  try {
    const answer = await connectEnvOf(o).fetch(found.registerUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        client_name: String(o.description.project.title ?? o.name),
        redirect_uris: [`${origin}/_t/connect/${service}`],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      }),
      size: 65_536,
    })
    const body: unknown = await answer.json().catch(() => undefined)
    if (isStored(body) && typeof body.client_id === 'string') {
      const id = body.client_id
      o.store.write((tx) => setNote(tx, key, id))
    }
  } finally {
    busy.delete(key)
  }
}

/**
 * Reads the documents of every server of an app that discovers its sign-in, when the app opens and once a day, and
 * registers the app with each that needs it, for each name of the app's address.
 */
export async function discoverAll(o: Opened, origins: string[] = []): Promise<void> {
  const kept = read.get(o) ?? new Map<string, Described>()
  read.set(o, kept)
  for (const service of discovering(o)) {
    const found = await described(o, service).catch(() => undefined)
    if (!found) continue
    kept.set(service, found)
    for (const origin of origins)
      if (registers(found, origin)) await registered(o, service, origin, found).catch(() => undefined)
  }
}

/** The host that signs people in at a server, as `tent mcp approve` wrote it into the lock and the build into the description, or nothing. */
function approvedHost(o: Opened, service: string): string | undefined {
  const host: unknown = Reflect.get(Object(o.description.services[service]), 'host')
  return typeof host === 'string' ? host : undefined
}

/** What the engine read of the sign-in of a server, for `tent mcp approve`: the host that signs people in. */
export const signInHost = (o: Opened, service: string): string | undefined => read.get(o)?.get(service)?.host

const originKey = (service: string): string => `mcp.origin.${service}`

/**
 * The name the app was reached by for a server: that of the request under way, which is kept, or, for a renewal
 * that no request carries, as a run does, the one the last connect was made by. So a token is renewed under the
 * client it was given to.
 */
function originHeld(o: Opened, service: string, origin: string): string {
  const kept = metaOf(o.store, originKey(service))
  if (origin === '') return typeof kept === 'string' ? kept : ''
  if (kept !== origin)
    try {
      o.store.write((tx) => setNote(tx, originKey(service), origin))
    } catch {
      // Inside a write of its own the name is kept by the next connect.
    }
  return origin
}

/**
 * What a connect of a server that discovers its sign-in is made with, for the name the app was reached by: the
 * addresses its documents named, and the client: the address of the app's own document, or the id the app was
 * given where it registered, as it must where the server takes no document and on a developer's computer. Where
 * that id is not kept yet, the registering starts and the connect is T7115. A sign-in address that the guard
 * refuses is T0022, and a server whose documents name another host than the approved one is held back, T7112.
 */
export function foundFor(
  o: Opened,
  service: string,
  given: string,
): { authorizeUrl: string; tokenUrl: string; clientId: string; scopes: string[]; resource: string } | undefined {
  const found = read.get(o)?.get(service)
  if (!found) return undefined
  if (found.refused) throw found.refused
  const approved = approvedHost(o, service)
  if (approved !== undefined && approved !== found.host)
    throw new TentError(
      'T7112',
      `The server ${service} now sends people to ${found.host} to sign in, and ${approved} was approved.`,
      { fix: `Look at it again with \`tent mcp approve ${service}\`, and build and run the version that holds it.` },
    )
  const origin = originHeld(o, service, given)
  const asks = registers(found, origin)
  const kept = asks ? metaOf(o.store, metaKey(service, origin)) : undefined
  if (asks && typeof kept !== 'string') {
    void registered(o, service, origin, found).catch(() => undefined)
    throw new TentError('T7115', `The app is registering with ${service} for ${origin}: try again in a moment.`, {
      fix: 'Start the connect again once the registering is done.',
    })
  }
  return {
    authorizeUrl: found.authorizeUrl,
    tokenUrl: found.tokenUrl,
    clientId: typeof kept === 'string' ? kept : clientDocument(origin, service),
    scopes: found.scopes,
    resource: found.resource,
  }
}
