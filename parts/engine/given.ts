import { TentError } from '../core/index.ts'
import type { App } from './app.ts'
import { failureOf } from './door/failure.ts'
import { storedLimit } from './limits.ts'
import type { Link } from './copy/link.ts'
import type { OnRequest } from './onRequest.ts'
import type { Opened } from './opened.ts'

/** A command of the admin channel that a part above the engine gave: its work, which is handed the app and the words of the command. */
interface AdminGiven {
  run(app: App, args: object): unknown
}

/** The share of the daily upkeep that a part above the engine gave. */
interface UpkeepGiven {
  daily(): void | Promise<void>
}

/**
 * What joins the opening of a connection, which a part above the engine gave: it is handed the request of the
 * opening and what the engine knows of it, and answers the other end of the connection, or nothing where it takes
 * none, and the engine's own live connection and links take it.
 */
export type OnLink = (request: Request, about: object) => Promise<Link | undefined>

/** What was given for one app, or for every app of one engine. */
interface Held {
  admin: Map<string, AdminGiven>
  upkeep: Map<string, UpkeepGiven>
  // The working object behind a handle, whose every member is handed the caller of its call first.
  handle: Map<string, object>
  // A function that a request is handed first, in front of the engine's own, in the order they were given.
  onRequest: Map<string, OnRequest>
  // What joins the opening of a connection, in front of the engine's own.
  onLink: Map<string, OnLink>
}

const none = (): Held => ({
  admin: new Map(),
  upkeep: new Map(),
  handle: new Map(),
  onRequest: new Map(),
  onLink: new Map(),
})

// What was given for one app alone, and what was given for every app of an engine, by the token of that engine.
const forApp = new WeakMap<App, Held>()
const forEngine = new Map<string, Held>()

// What stops the timer of each share of the upkeep of each app that is open, by whom it was given for and its name.
const timers = new WeakMap<Opened, Map<string, () => void>>()

const isAdmin = (object: object): object is AdminGiven => typeof Reflect.get(object, 'run') === 'function'
const isUpkeep = (object: object): object is UpkeepGiven => typeof Reflect.get(object, 'daily') === 'function'
const isRequest = (object: object): object is OnRequest => typeof object === 'function'
const isLink = (object: object): object is OnLink => typeof object === 'function'

/**
 * Has one share of the upkeep carried out for an app: at once, as the upkeep of its opening, and then every
 * `upkeepEvery` of its project by the clock of the app, for as long as the app is open. A share that was given
 * before under the same name for the same apps is stopped: the new one takes its place. What it throws is written
 * to the log, and stops nothing.
 */
function keepUp(o: Opened, scope: 'app' | 'all', name: string, share: UpkeepGiven): void {
  const stops = timers.get(o) ?? new Map<string, () => void>()
  timers.set(o, stops)
  stops.get(`${scope} ${name}`)?.()
  const run = (): void => {
    void Promise.resolve()
      .then(() => share.daily())
      .catch((error: unknown) => failureOf(o, `upkeep ${name}`, error))
  }
  let cancel = (): void => undefined
  const next = (): void => {
    cancel = o.clock.setTimer(o.clock.now() + storedLimit(o.description, 'upkeepEvery'), () => {
      if (o.closed) return
      run()
      next()
    })
  }
  run()
  next()
  stops.set(`${scope} ${name}`, () => cancel())
}

/**
 * What an engine holds of the things that the parts above it gave. Takes the token of the engine and what answers
 * its open apps. `give` takes an admin command or a share of the daily upkeep, for one app or for every app of the
 * engine. `opened` and `left` are told each app that opened and each that closed, and `close` forgets what was
 * given for every app.
 */
export function givenBy(token: string, apps: () => Iterable<Opened>) {
  const all = none()
  forEngine.set(token, all)
  return {
    give(kind: 'admin' | 'handle' | 'onRequest' | 'onLink' | 'upkeep', name: string, object: object, app?: App): void {
      const held = app ? (forApp.get(app) ?? none()) : all
      if (app) forApp.set(app, held)
      if (kind === 'admin' && isAdmin(object)) held.admin.set(name, object)
      else if (kind === 'handle' && typeof object === 'object') held.handle.set(name, object)
      else if (kind === 'onRequest' && isRequest(object)) held.onRequest.set(name, object)
      else if (kind === 'onLink' && isLink(object)) held.onLink.set(name, object)
      else if (kind === 'upkeep' && isUpkeep(object)) {
        held.upkeep.set(name, object)
        for (const o of apps()) if (!o.closed && (!app || o.app === app)) keepUp(o, app ? 'app' : 'all', name, object)
      } else
        throw new TentError('T0013', `What was given as the ${kind} \`${name}\` has not the form of one.`, {
          fix: 'Give an admin command as `{ run(app, args) }`, a handle as its working object, an `onRequest` and an `onLink` as a function, and a share of the upkeep as `{ daily() }`.',
        })
    },
    opened(o: Opened): void {
      for (const [name, share] of all.upkeep) keepUp(o, 'all', name, share)
    },
    left(o: Opened): void {
      for (const stop of timers.get(o)?.values() ?? []) stop()
      timers.delete(o)
    },
    // The functions that a request for an app is handed first: those given for it, then those given for every app.
    requests(o: Opened | undefined): OnRequest[] {
      return [...(o ? (forApp.get(o.app)?.onRequest.values() ?? []) : []), ...all.onRequest.values()]
    },
    // What joins the opening of a connection for an app, then for every app of the engine.
    links(o: Opened | undefined): OnLink[] {
      return [...(o ? (forApp.get(o.app)?.onLink.values() ?? []) : []), ...all.onLink.values()]
    },
    close(): void {
      forEngine.delete(token)
    },
  }
}

/** The admin command of a name that was given for an app, or for every app of its engine. Nothing where none was given. */
export const adminGiven = (o: Opened, name: string): AdminGiven | undefined =>
  forApp.get(o.app)?.admin.get(name) ?? forEngine.get(o.token)?.admin.get(name)

/** The working object behind a handle that a part above the engine gave for an app, or for every app of its engine. */
export const handleGiven = (o: Opened, name: string): object | undefined =>
  forApp.get(o.app)?.handle.get(name) ?? forEngine.get(o.token)?.handle.get(name)
