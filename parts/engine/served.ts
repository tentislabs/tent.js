import { TentError } from '../core/index.ts'
import type { Mode } from '../data/index.ts'
import type { App } from './app.ts'
import type { Opened } from './opened.ts'

/** What a program states of the addresses it puts under one prefix: the rights, the size, the count and the time. */
export interface ServedOptions {
  // The rights of which a key must hold one for that request.
  right(request: Request): string[]
  // The most bytes that the body of that request may hold.
  size(request: Request): number
  perMinute: number
  time: number
}

/** What the handler of a program is handed: the request, the key that sent it with its rights, and what `onRequest` is handed. */
export interface ServedRequest {
  request: Request
  key: { id: string; rights: string[] }
  about: object
  // The mode of the app, which a program that serves it does not know otherwise.
  mode: Mode
}

/** Addresses that a program serves under a prefix, with what it states of them and what answers them. */
export interface Served {
  prefix: string
  o: ServedOptions
  handler(o: ServedRequest): Promise<Response>
}

// What each app serves for the programs that hold it, by the app that a program holds.
const served = new WeakMap<App, Served[]>()

/**
 * Takes an app, a prefix under `/_t/`, what the addresses under it are held to, and what answers them. Puts them
 * behind the door for that app: a prefix given again takes the place of the first. Throws T0013 for a prefix that
 * is not under `/_t/`, and for options that have not their form.
 */
export function serveUnder(app: App, prefix: string, o: ServedOptions, handler: Served['handler']): void {
  if (!/^\/_t\/[a-z0-9/-]+$/.test(prefix) || prefix.endsWith('/'))
    throw new TentError('T0013', `\`${prefix}\` is no prefix of addresses that a program may serve.`, {
      fix: 'Serve addresses under `/_t/`, as `/_t/sync`, with no `/` at the end.',
    })
  if (typeof o?.right !== 'function' || typeof o.size !== 'function' || !(o.perMinute > 0) || !(o.time > 0))
    throw new TentError('T0013', `What \`engine.serve\` was handed for \`${prefix}\` has not its form.`, {
      fix: 'Hand `{ right(request), size(request), perMinute, time }` and a handler.',
    })
  const all = (served.get(app) ?? []).filter((one) => one.prefix !== prefix)
  served.set(app, [...all, { prefix, o, handler }])
}

/** What a program serves at a path of an app: the prefix that is the path or stands above it, the longest. */
export function servedAt(o: Opened, path: string): Served | undefined {
  const all = served.get(o.app) ?? []
  return all
    .filter((one) => path === one.prefix || path.startsWith(`${one.prefix}/`))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0]
}
