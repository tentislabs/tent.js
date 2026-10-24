import type { Caller } from '../core/index.ts'
import type { Description } from '../core/internal.ts'
import type { GuardedFetch } from './guardedFetch.ts'
import type { Channel } from './mcp/client.ts'

/** The bytes of a file as the standard stream of them. */
export type Stream = ReadableStream<Uint8Array>

/** The tokens of one connection of a user to a service whose auth is `oauth`. */
export interface Tokens {
  access: string
  refresh?: string
  expiresAt?: number
  scopes: string[]
}

/**
 * An auth of the builder's own, by the name a service gives in `auth: { by }`: it is handed the finished
 * request, whose body can be read more than once, and answers the one that is sent.
 */
export type Signer = (request: Request, o: { service: string; user?: string }) => Request | Promise<Request>

/**
 * A check of a signature of the builder's own, by the name a scheme gives in `{ by }`: it is handed the headers,
 * the exact bytes, the secret and the time, and answers the id and the time of the call where it has them. It
 * throws T7118 for a signature that does not hold.
 */
export type Verifier = (o: {
  headers: Headers
  body: Uint8Array
  secret: string
  now: number
}) => { id?: string; time?: number } | Promise<{ id?: string; time?: number }>

/** How a request and the live connection reach an app, for the runner of its command line. */
export interface Reach {
  request(request: Request): Promise<Response>
  live(
    request: Request,
  ): Promise<{ send(message: object): void; each(fn: (message: object) => void): void; close(): void }>
}

/**
 * What the engine hands `connect`, which reaches nothing of the engine but through it: the description of a
 * version, the guarded fetch, the secrets, the tokens of the connections, the makers of auths and of checks,
 * a stand-in of a service, the once-only key of the call that is being made, the settings, the files, the log, and the time.
 */
export interface ConnectEnv {
  description(version: string): Description
  fetch: GuardedFetch
  // T0019 when the secret has no value.
  secret(name: string): string
  // The engine keeps them, encrypted.
  tokens: {
    read(service: string, user: string, account: string): Tokens | undefined
    write(service: string, user: string, account: string, tokens: Tokens | undefined): void
  }
  // What the engine read of a server with `discover`, for the name the app was reached by, which the engine knows.
  found?(
    service: string,
  ): { authorizeUrl: string; tokenUrl: string; clientId: string; scopes: string[]; resource?: string } | undefined
  signers: Record<string, Signer>
  verifiers: Record<string, Verifier>
  // What `app.standIn` put in place of a service: asked in place of sending.
  standIn?(service: string): object | undefined
  // The once-only key of the call that is being made, inside a step.
  once(): string | undefined
  // The value of a setting of the app, by its name: what a name in curly brackets in `url` is filled with.
  setting?(name: string): unknown
  files: {
    stream(id: string, caller: Caller): Promise<Stream>
    info(id: string, caller: Caller): { name: string; kind: string; size: number }
    put(bytes: Stream, info: { name: string; kind: string }, o: { caller: Caller }): Promise<string>
  }
  logged(row: { service: string; call: string; status?: number; ms: number }): void
  // The channel to the program of an outside MCP server that is one, for a user where it runs one for each.
  channel?(service: string, user?: string): Channel | undefined
  // Whether a tool of an outside MCP server is held back, since it is not as it was approved.
  held?(service: string, tool: string): boolean
  now(): number
  sleep(ms: number): Promise<void>
}
