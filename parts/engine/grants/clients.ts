import { TentError } from '../../core/index.ts'
import { isStored } from '../../core/internal.ts'
import { countedFor } from '../door/rate.ts'
import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { secretKeyAt } from '../values/key.ts'
import { openText, sealText } from '../values/sealing.ts'
import { cliSignsIn } from './programs.ts'

/** Who a client is, as the engine holds it while a person is asked. */
export interface Client {
  id: string
  name: string
  redirects: string[]
  // It registered itself: it has no document, and the person is told so.
  named: boolean
  // The builder states it: it may list a return address of a program's own kind.
  stated: boolean
  // It may ask for a token for the whole app.
  forApp: boolean
  // The host of its document, as the page names it, where it has one.
  host?: string
}

/** The id of the app's own command line, which the engine knows by itself in an app that has commands. */
export const cliClient = 'tent-cli'

/** What a registered id is bound to, so that no other sealed text of the engine opens as one. */
const registered = 'tent.client/1'

/** The documents of clients that were read, by their address, each with the moment it was read. */
const read = new WeakMap<Opened, Map<string, { client: Client; at: number }>>()

/** The failure of a client or a return address that cannot be trusted: no return is made to it. */
export const untrusted = (message: string): TentError =>
  new TentError('T0002', message, { fix: 'Sign in from the program again, as its maker set it up.' })

const textsOf = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((one): one is string => typeof one === 'string') : []

/** The addresses of this computer, which a program on it listens at over plain http. */
const here = ['127.0.0.1', 'localhost', '[::1]']

/** Whether an address is of this computer over plain http, on whatever port. */
const onThisComputer = (url: URL): boolean => url.protocol === 'http:' && here.includes(url.hostname)

const parsed = (address: string): URL | undefined => {
  try {
    return new URL(address)
  } catch {
    return undefined
  }
}

/**
 * Whether a person may be sent back to an address for a client: one that its document lists, letter for letter,
 * which is `https`; or one of this computer over plain http where a listed one fits with any port, on the same
 * path; or, for a client the builder states, any one it lists letter for letter.
 */
export function returnsTo(client: Client, redirect: string): boolean {
  const asked = parsed(redirect)
  if (!asked || asked.username || asked.password || asked.hash) return false
  return client.redirects.some((listed) => {
    if (listed === redirect) return asked.protocol === 'https:' || client.stated || onThisComputer(asked)
    const one = parsed(listed)
    return (
      one !== undefined &&
      onThisComputer(asked) &&
      onThisComputer(one) &&
      one.hostname === asked.hostname &&
      one.pathname === asked.pathname &&
      one.search === asked.search
    )
  })
}

/** Whether every return address a client that registers itself names keeps to the rule: `https`, or this computer. */
export const fairReturns = (redirects: string[]): boolean =>
  redirects.length > 0 &&
  redirects.every((one) => {
    const url = parsed(one)
    return (
      url !== undefined &&
      !url.username &&
      !url.password &&
      !url.hash &&
      (url.protocol === 'https:' || onThisComputer(url))
    )
  })

/** The id of a client that registers itself: its name, its return addresses and the time, sealed with the key of the secrets. */
export function registeredId(o: Opened, name: string, redirects: string[]): string {
  const key = secretKeyAt(o.dataFolder)
  if (!key) throw new TentError('T0019', 'A client registers itself only where the app holds the key of its secrets.')
  return sealText(key, JSON.stringify({ name, redirects, at: o.clock.now() }), registered)
}

/** A client that registered itself, read from its id, or nothing where the id is no such text. */
function registeredOf(o: Opened, id: string): Client | undefined {
  const key = secretKeyAt(o.dataFolder)
  const opened = key ? openText(key, id, registered) : undefined
  if (opened === undefined) return undefined
  try {
    const one = Object(JSON.parse(opened))
    if (typeof one.name !== 'string') return undefined
    return { id, name: one.name, redirects: textsOf(one.redirects), named: true, stated: false, forApp: false }
  } catch {
    return undefined
  }
}

/** Whether the project lets clients register themselves: `anyone(...)` among `mcp.clients`. */
export function registers(o: Opened): boolean {
  const clients: unknown = Reflect.get(Object(o.description.project.mcp), 'clients')
  return Array.isArray(clients) && clients.some((one) => isStored(one) && one.rule === 'anyone')
}

/** Reads the document of a client, through the guarded fetch: its name must be the address it was fetched from. */
async function documentOf(o: Opened, id: string): Promise<Client> {
  const url = parsed(id)
  if (!url) throw untrusted('The client names itself by no address of a document.')
  const { guardedFetch } = await import('../../connect/index.ts')
  const privateHosts = textsOf(o.description.project.privateHosts)
  const fetched = guardedFetch({ mode: o.mode, privateHosts })
  const answer = await fetched(id, {
    headers: { accept: 'application/json' },
    size: storedLimit(o.description, 'clientDocSize'),
    time: 10_000,
    redirects: 0,
  })
  let document: unknown
  try {
    document = answer.ok ? await answer.json() : undefined
  } catch {
    document = undefined
  }
  if (!isStored(document) || document.client_id !== id)
    throw untrusted('The document of the client does not name its own address as the client it is.')
  return {
    id,
    name: typeof document.client_name === 'string' ? document.client_name : url.host,
    redirects: textsOf(document.redirect_uris),
    named: false,
    stated: false,
    forApp: false,
    host: url.host,
  }
}

/**
 * Takes an app, the id that a client names itself by, and the person who signs in. Answers who the client is: the
 * app's own command line, a client the builder states, one that registered itself, or one whose document the
 * engine reads, at most `clientNamesPerMinute` new ones a minute for one person, and keeps for `clientDocKept`.
 * Throws T0002 for a client that cannot be trusted, T0005 for one more new name, and what the guarded fetch throws.
 */
export async function clientOf(o: Opened, id: string, person: string): Promise<Client> {
  if (id === cliClient && cliSignsIn(o.description)) {
    const cli: unknown = Reflect.get(Object(o.description.project.cli), 'name')
    const name = typeof cli === 'string' ? cli : o.description.app.name
    return { id, name, redirects: ['http://127.0.0.1/callback'], named: false, stated: false, forApp: true }
  }
  const clients: unknown = Reflect.get(Object(o.description.project.mcp), 'clients')
  const stated = (Array.isArray(clients) ? clients : []).find((one) => isStored(one) && one.id === id)
  if (isStored(stated))
    return {
      id,
      name: typeof stated.name === 'string' ? stated.name : id,
      redirects: textsOf(stated.redirects),
      named: false,
      stated: true,
      forApp: stated.for === 'app',
    }
  if (registers(o)) {
    const own = registeredOf(o, id)
    if (own) return own
  }
  if (parsed(id) === undefined) throw untrusted('No client of this id is known to the app.')
  const kept = read.get(o) ?? new Map<string, { client: Client; at: number }>()
  read.set(o, kept)
  const now = o.clock.now()
  const held = kept.get(id)
  if (held && now - held.at <= storedLimit(o.description, 'clientDocKept')) return held.client
  const limit = storedLimit(o.description, 'clientNamesPerMinute')
  if (!countedFor(o, `clientNames:${person}`, limit))
    throw new TentError('T0005', `More than ${limit} new programs were named in a minute.`, {
      fix: 'Sign in from fewer programs at once.',
    })
  const client = await documentOf(o, id)
  kept.delete(id)
  kept.set(id, { client, at: now })
  // The oldest is dropped first, so a sender cannot fill the memory of the engine.
  const most = storedLimit(o.description, 'clientDocs')
  for (const oldest of kept.keys()) {
    if (kept.size <= most) break
    kept.delete(oldest)
  }
  return client
}
