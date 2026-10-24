import type { Definition, Marker } from '../definition.ts'
import { calls, record } from '../definition.ts'
import type { ServiceCall } from '../helpers/calls.ts'
import type { Secret } from '../helpers/references.ts'
import type { Services } from '../lists.ts'
import type { Type } from '../type.ts'
import type { InputArgs, Stated } from './shared.ts'

/** A value of a sign-in or of a header: a secret, or a literal. */
type Kept = Secret | string

/** How a service signs what it sends, and how an incoming call is checked. */
export type Scheme =
  | 'standard'
  | 'stripe'
  | 'github'
  | { header: string; encoding?: 'hex' | 'base64'; prefix?: string; id?: string }
  | { by: string }

/** The fields of the auth `oauth`. */
interface Oauth {
  authorizeUrl?: string
  tokenUrl?: string
  revokeUrl?: string
  clientId?: Kept
  clientSecret?: Kept
  scopes?: readonly string[]
  extra?: Record<string, string>
  tokenExtra?: Record<string, string>
  tokenAuth?: 'body' | 'basic'
  scopeSeparator?: string
  proof?: boolean
  discover?: boolean
}

/** How each request of a service says who it is from. */
type Auth =
  | { bearer: Kept }
  | { header: { name: string; value: Kept } }
  | { basic: { user: Kept; password: Kept } }
  | { query: { name: string; value: Kept } }
  | { oauth: Oauth }
  | { by: string }

/** The options of `service`. */
export interface ServiceOptions<Calls> {
  url?: string
  auth?: Auth
  headers?: Record<string, Kept>
  calls?: Calls
  from?: string
  use?: readonly string[] | Record<string, string>
  limits?: {
    perSecond?: number
    perMinute?: number
    atOnce?: number
    size?: string
    error?: string
    redirects?: number
    time?: string
  }
  tries?: number | { max?: number; wait?: string; on?: readonly number[]; first?: string }
  onceOnlyHeader?: string
  webhook?: { scheme: Scheme; secret: Secret }
  connection?: string | Marker
  mcp?:
    | boolean
    | { command: readonly string[]; env?: Record<string, Kept>; per?: string; keep?: string; model?: string | Marker }
  was?: string | readonly string[]
}

/** One call of a service as a function: it takes the input, and whose account it uses. */
type CallFunction<Call> =
  Call extends ServiceCall<infer I, infer Out>
    ? ((
        ...args: [...InputArgs<I>, o?: { account?: string; for?: string }]
      ) => Promise<Out extends Type ? Stated<Out> : unknown>) &
        Marker
    : never

/** What `service` returns: one function for each call, and `signature`, by which an incoming call is checked. */
export type ServiceDefinition<Name extends string, Calls> = Definition<'service', Name, ServiceOptions<Calls>> & {
  readonly [Call in keyof Calls]: CallFunction<Calls[Call]>
} & { readonly signature: Marker } & (Name extends keyof Services ? Services[Name] : unknown)

/**
 * Takes the name of a service and its options. Answers the definition, which only records them, with one marker
 * for each call, whose call is handed to the runtime, and `signature`. A service whose calls the build reads from a
 * published description, or from an outside server, answers a marker for every name that is read from it.
 */
export function service<
  const Name extends string,
  const Calls extends Record<string, ServiceCall> = Record<never, never>,
>(name: Name, o: ServiceOptions<Calls>): ServiceDefinition<Name, Calls>
export function service(name: string, o: ServiceOptions<Record<string, object>>): object {
  const written = Object.keys(Object(o).calls ?? {}).map((call) => [call, calls(`${name}.${call}`)])
  const made = Object.assign(record('service', name, o), Object.fromEntries(written), {
    signature: { definition: `${name}.signature` },
  })
  if (o.from === undefined && !o.mcp) return made
  // The calls of such a service are known only once the build has read them, so a member is answered by its name.
  // `then` is left out, so that a service is never taken for a promise.
  const read = new Map<string, object>()
  return new Proxy(made, {
    get(target, member, receiver) {
      if (typeof member !== 'string' || member in target || member === 'then')
        return Reflect.get(target, member, receiver)
      const kept = read.get(member) ?? calls(`${name}.${member}`)
      read.set(member, kept)
      return kept
    },
  })
}
