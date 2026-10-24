import { randomBytes } from 'node:crypto'
import { TentError } from '../core/index.ts'
import type { ToolSource } from '../core/internal.ts'
import { limitDefaults, setRuntime } from '../core/internal.ts'
import { forgetReader, handReader } from './ai/reader.ts'
import { forgetSources, offerSource } from './ai/sources.ts'
import type { App } from './app.ts'
import type { SecureOptions } from './certs/keeper.ts'
import type { ProgramUsed } from './counts/program.ts'
import { keepMeasuring, programUsed } from './counts/program.ts'
import { answerRequest, isUpload, sizeTaken, wrongName } from './door/web.ts'
import { givenBy } from './given.ts'
import { watchKnown } from './knownWatch.ts'
import { limitOf } from './limits.ts'
import { linkTo } from './linkTo.ts'
import { hubOf, liveOpened } from './liveDoor.ts'
import type { Makers } from './makers.ts'
import type { OnRequest } from './onRequest.ts'
import { handedFirst, isHanded, liveAsked } from './onRequest.ts'
import type { OpenOptions } from './open.ts'
import { closeApp, openApp } from './open.ts'
import type { Events, Opened } from './opened.ts'
import type { PartsFrom } from './parts.ts'
import type { ReadOptions } from './read.ts'
import { againFor, waitedAgain } from './reopening.ts'
import type { ServedOptions, ServedRequest } from './served.ts'
import { serveUnder } from './served.ts'
import { using } from './sleep/inUse.ts'
import type { Sleeper } from './sleep/sleeper.ts'
import { slot } from './slot.ts'
import { tooLarge } from './web/body.ts'
import type { About, ProxyOptions } from './web/proxy.ts'
import { proxyRule } from './web/proxy.ts'
import type { Listening } from './web/secureWeb.ts'
import { startSecure } from './web/secureWeb.ts'
import type { Addressed, Serves, Serving, WebOptions } from './web/server.ts'
import { serve } from './web/server.ts'
import { jsonAnswer, wireError } from './wire.ts'
import { msOf } from './words.ts'
import type { Worker, WorkOptions } from './work/worker.ts'
import { unwrapFetch, wrapFetch } from './wrapFetch.ts'

/**
 * What `createEngine` takes. The port is 3000 and the host 127.0.0.1 where they are left out, and the port 0
 * takes a free one. `proxy` names the proxies that stand in front of the engine, and `web` the bounds of its web side.
 */
export interface EngineOptions {
  port?: number
  host?: string
  makers?: Makers
  proxy?: ProxyOptions
  web?: WebOptions
  /**
   * A function of the program that holds the apps, which every request is handed first, before the `onRequest` of
   * the app that it names: it answers itself, or hands the request on with `next`.
   */
  onRequest?: OnRequest
  /**
   * Where the parts that are fetched at their first use come from: `from` is an address of the program's own that
   * serves every part, and `folder` the folder in whose `fetched/` they lie.
   */
  parts?: PartsFrom
  // How often the program measures its memory, and what the data folders of its apps take on the disk.
  countEvery?: string
  levelEvery?: string
  /**
   * The reader of a sequence, which the program that starts the engine hands over where the build tools are
   * installed: an engine that was handed none offers no `sequence` to a model.
   */
  readBody?: ReadBody
  /**
   * Whether the engine reads the list of known problems of its release once a day, and says in its log when its
   * version is on it. True where it is left out; `TENT_NOTICES=off` switches it off too.
   */
  notices?: boolean
  /**
   * The names that the engine serves securely with certificates of its own, which it gets from an authority, and
   * how: on the secure port 443 and the plain port 80 where it names no others.
   */
  secure?: SecureOptions
}

/** The reader of a sequence: its text into the stored form of a body, or the first thing in it that a sequence may not hold. */
export type ReadBody = (text: string, o: { tools: string[]; fill: boolean }) => ReadBodyAnswer | Promise<ReadBodyAnswer>

/** What the reader of a sequence answers: the stored form of the body, or the first thing that a sequence may not hold. */
type ReadBodyAnswer = { body: object[] } | { why: string; line: number }

/** One engine: it holds one or many apps, each a bundle and a data folder. */
export interface Engine {
  /**
   * Opens the bundle of a folder over a data folder, and answers the app. The table changes apply here, and the
   * web side of the engine starts with its first app. The promise is refused where the app does not open: T0011,
   * T0018, T2001 to T2004 and T0013.
   */
  open(bundleFolder: string, o: OpenOptions): Promise<App>
  /**
   * Opens an app as a reader of the writer at `from`, on a data folder of its own, with no bundle: it fetches the
   * running version and the data where the folder is empty, and follows its writer from then on. The promise is
   * refused where the app does not open: T0029 for a writer that an empty folder cannot reach, T0013 and T0011.
   */
  read(o: ReadOptions): Promise<App>
  /**
   * Runs a worker of the writer at `from`: it joins with its key and its kinds, fetches the versions it is told,
   * and carries out the tasks it is handed. It answers once its folder is open, whether the writer is reached or not.
   */
  work(o: WorkOptions & { makers?: Makers }): Promise<Worker>
  /**
   * Hands the engine a thing with a fixed place that a part above it brings: a command of the admin channel, as
   * `{ run(app, args) }`; the working object behind a handle, each of whose members is handed `{ caller }` of
   * the call it is used in before what the code hands it; an `onRequest`, which stands in front of the engine's
   * own; an `onLink`, which is handed the opening of a connection first and answers its other end, or nothing; or a
   * share of the daily upkeep, as `{ daily() }`. For one app, or for every app of the engine where none
   * is named. Throws T0013 for a thing that has not the form of its kind.
   */
  give(kind: 'admin' | 'handle' | 'onRequest' | 'onLink' | 'upkeep', name: string, object: object, app?: App): void
  /**
   * Offers a source of tools under a name, for every app of the engine: a run of an agent that `app.start`
   * names it in `sources` is given its tools. Throws T0013 for a source that has not `tools` and `call`.
   */
  offer(name: string, source: ToolSource): void
  /**
   * Puts addresses of a program under a prefix of `/_t/` for one app, called with a key: the door holds each
   * request to the size, the right, the count and the time that the program states, and logs it, and the handler
   * answers it. Throws T0013 for a prefix outside `/_t/`.
   */
  serve(app: App, prefix: string, o: ServedOptions, handler: (o: ServedRequest) => Promise<Response>): void
  /** The port the engine listens on, once its web side runs: the one that was asked for, or the free one that port 0 took. */
  readonly port: number | undefined
  /** Has a handler called with what each event of that name tells. A handler that throws stops nothing. */
  on<Event extends keyof Events>(event: Event, handler: (told: Events[Event]) => void): void
  /**
   * What this program itself used, counted from its start, for whoever runs it: its processor time and what of it
   * was booked to apps, its memory, the bytes of all its connections, and what the data folders of its apps take.
   */
  program(): ProgramUsed
  /** Closes every app of the engine, its web side, and the engine. A second closing does nothing. */
  close(): Promise<void>
}

// How many engines of this program stand open: the first fills the runtime slot, and the last empties it.
let engines = 0

/** The answer to a request that no app of the engine is named by, or whose body no app would take: in the words of live data. */
const refusal = (error: unknown): Response => {
  const { status, error: sent } = wireError(error, false)
  return jsonAnswer(status, { ok: false, error: sent })
}

/**
 * Takes the options of an engine. Answers the engine, which holds no app yet: `open` gives it one. The first
 * engine of a program fills the runtime slot of `core` and wraps the `fetch` of the runtime, and the last one to
 * close takes both back.
 */
export function createEngine(options: EngineOptions = {}): Engine {
  const handlers = new Map<string, Set<(told: never) => void>>()
  const apps = new Set<Opened>()
  // The program measures its memory from its first engine on.
  keepMeasuring(msOf('countEvery', options.countEvery, 60_000))
  const workers = new Set<Worker>()
  // The apps that sleep: a request for one of their names wakes one.
  const sleepers = new Set<Sleeper>()
  const rule = proxyRule(options.proxy)
  let closed = false
  let unwatched: (() => void) | undefined
  let listened: number | undefined
  let web: Promise<Serves> | undefined
  if (engines++ === 0) {
    setRuntime(slot)
    wrapFetch()
  }
  /** The app that a request names, by the names each app was given: where several apps stand in one engine, the name tells them apart. */
  const named = (about: About): Opened | undefined =>
    [...apps].find((o) => !o.closed && o.web.names(about.host, about.scheme)) ??
    // The name of the address that a reader dials finds the app too: the door then holds the request to a reader's key.
    [...apps].find((o) => !o.closed && o.web.own(about.host, about.scheme))
  /** The app that sleeps and that a request names. */
  const sleeperOf = (about: About): Sleeper | undefined =>
    [...sleepers].find((one) => one.names(about.host, about.scheme))
  /** The app that a request is for, by its own host, where it came from and its headers: as a proxy that was named tells it. */
  const askedOf = (
    host: string,
    from: string,
    headers: Headers,
    scheme = 'http',
  ): { about: About; o: Opened | undefined } => {
    const about = rule.about({ from, scheme, host }, headers)
    return { about, o: named(about) }
  }
  /** The same, for a request whose address says its scheme. */
  const requestOf = (request: Request, from: string): { about: About; o: Opened | undefined } => {
    const url = new URL(request.url)
    return askedOf(url.host, from, request.headers, url.protocol === 'https:' ? 'https' : 'http')
  }
  /**
   * The most bytes of a request for a name that no app holds yet, which a part above the engine may answer or open
   * an app for: the sizes that a project holds where it states none. Nothing where no part gave an `onRequest`.
   */
  const handedSize = (asked: Addressed): number | undefined =>
    given.requests(undefined).length
      ? Number(limitDefaults.project[isUpload(asked) ? 'uploadSize' : 'callSize'] ?? 0)
      : undefined
  /** The most bytes that the body of a request may hold: the size of a call of the app it names, and none for no app. */
  const bodySize = (host: string, from: string, headers: Headers, asked: Addressed): number => {
    const { about, o } = askedOf(host, from, headers)
    return o ? sizeTaken(o, asked, headers) : (sleeperOf(about)?.size(asked) ?? handedSize(asked) ?? 0)
  }
  /** Starts the web side: with secure names, on its two ports with their certificates, and else on one. */
  const webOf = (at: Listening | undefined, serving: Serving): Promise<Serves> =>
    options.secure ? startSecure(serving, options.secure, at, options.port) : serve(serving)
  // How long a request waits for an app that is opened, and how long the calls in flight get when one is closed.
  const waits = {
    open: msOf('web.openTime', options.web?.openTime, 10_000),
    stop: msOf('web.stopTime', options.web?.stopTime, 10_000),
  }
  const program = {
    waits,
    listening(at?: Listening): Promise<number> {
      web ??= webOf(at, {
        port: options.port ?? 3000,
        host: options.host ?? '127.0.0.1',
        web: options.web ?? {},
        isProxy: rule.isProxy,
        bodySize,
        streamed: isUpload,
        // A body for a host that names no app is not read at all: the name is refused before anything else.
        tooLarge(host, from, headers, asked) {
          const { about, o } = askedOf(host, from, headers)
          const sleeper = o ? undefined : sleeperOf(about)
          if (sleeper) return refusal(tooLarge(sleeper.size(asked)))
          const handed = o ? undefined : handedSize(asked)
          if (handed !== undefined) return refusal(tooLarge(handed))
          return refusal(o ? tooLarge(sizeTaken(o, asked, headers)) : wrongName(about.host))
        },
        answer(request, from) {
          const { about } = requestOf(request, from)
          /** Hands a request to the app that it names. */
          const door = async (handed: Request): Promise<Response> => {
            const named = requestOf(handed, from)
            const { pathname } = new URL(handed.url)
            const health = pathname === '/_t/health'
            const { o } = named
            // A request for health is no use of an app, which may sleep.
            if (o)
              return health
                ? answerRequest(o, handed, named.about)
                : using(o, () => answerRequest(o, handed, named.about))
            // A request for an app that is being opened again waits for it, as a member of the app does.
            const again = againFor(named.about)
            if (again)
              return waitedAgain(again, waits.open).then(
                () => door(handed),
                (error) => refusal(error),
              )
            const sleeper = sleeperOf(named.about)
            if (!sleeper) return refusal(wrongName(named.about.host))
            if (health) return sleeper.health()
            const own = await sleeper.admin(handed, named.about)
            if (own) return own
            // A request that arrives during the waking waits for it within `web.openTime`, as at an opening again.
            let timer: NodeJS.Timeout | undefined
            const bound = waits.open
            const timeUp = new Promise<never>((_, refuse) => {
              timer = setTimeout(
                () =>
                  refuse(
                    new TentError('T0008', `The app was not woken within ${bound} ms.`, {
                      fix: 'Ask again in a moment.',
                    }),
                  ),
                bound,
              )
            })
            try {
              await Promise.race([sleeper.wake(), timeUp])
            } catch (error) {
              return refusal(error)
            } finally {
              clearTimeout(timer)
            }
            return door(handed)
          }
          // What a part above the engine gave stands in front of the program's own, which stands in front of the door.
          const firsts = [
            ...given.requests(requestOf(request, from).o),
            ...(options.onRequest ? [options.onRequest] : []),
          ]
          if (!firsts.length || !isHanded(request)) return door(request)
          const chained = firsts.reduceRight<(handed: Request) => Promise<Response>>(
            (next, own) => (handed) => handedFirst(own, handed, about, 30_000, next),
            door,
          )
          // The code of the program is held to the time of a call where no app says another, and its error is told to nobody.
          return chained(request).catch((error) =>
            refusal(
              error instanceof TentError && error.code === 'T0008'
                ? error
                : new TentError('T0009', 'An error occurred.'),
            ),
          )
        },
        async joined(request, from) {
          const { about, o } = requestOf(request, from)
          for (const join of given.links(o)) {
            const end = await join(request, about)
            if (end) return end
          }
          return undefined
        },
        link(request, from) {
          const { about, o } = requestOf(request, from)
          // The link of a worker wakes an app that sleeps, and is opened when the worker dials again.
          if (!o)
            void sleeperOf(about)
              ?.wake()
              .catch(() => undefined)
          if (!o) throw wrongName(about.host)
          return linkTo(o, request, about)
        },
        async live(request, from) {
          const { about } = requestOf(request, from)
          // A live connection to an app that sleeps waits for its waking.
          await sleeperOf(about)?.wake()
          const o = named(about)
          if (!o) throw wrongName(about.host)
          const opened = liveOpened(o, request, about)
          const taking: Awaited<ReturnType<Parameters<typeof serve>[0]['live']>> = {
            most: limitOf(o.description, 'callSize'),
            attach: (socket) =>
              void Promise.all([hubOf(o), opened.named]).then(
                ([hub]) => hub.attach(socket, opened),
                () => {
                  opened.release()
                  socket.close()
                },
              ),
            drop: () => opened.release(),
          }
          // The code of the builder may refuse the opening, and is asked before the connection is taken.
          return liveAsked(o, request, about, options.onRequest).then(
            () => taking,
            (error) => {
              opened.release()
              throw error
            },
          )
        },
        refused: (error) => wireError(error, false).status,
      })
      return web.then((serving) => {
        listened = serving.port
        return serving.port
      })
    },
    about: rule.about,
    // The admin token of this engine, which the commands of this computer send: made anew at each start.
    token: randomBytes(32).toString('base64url'),
    makers: options.makers ?? {},
    ...(options.parts ? { parts: options.parts } : {}),
    raise<Event extends keyof Events>(event: Event, told: Events[Event]): void {
      for (const handler of handlers.get(event) ?? [])
        try {
          Reflect.apply(handler, undefined, [told])
        } catch (error) {
          // The handler is the code of the program that holds the engine: its failure ends no call of an app.
          console.error(`A handler of the event ${event} failed:`, error)
        }
    },
    opened(o: Opened): void {
      apps.add(o)
      given.opened(o)
    },
    left(o: Opened): void {
      apps.delete(o)
      given.left(o)
    },
    asleep: (sleeper: Sleeper) => void sleepers.add(sleeper),
    awake: (sleeper: Sleeper) => void sleepers.delete(sleeper),
  }
  const given = givenBy(program.token, () => apps)
  if (options.readBody) handReader(program.token, options.readBody)
  return {
    open(bundleFolder, o) {
      if (closed) return Promise.reject(new TentError('T0013', 'The engine was closed, and opens no app.'))
      // The daily look at the known problems starts with the first app, in an engine that runs for some time.
      if (!unwatched && options.notices !== false && process.env.TENT_NOTICES !== 'off')
        unwatched = watchKnown((line) => console.error(line))
      return openApp(program, bundleFolder, o)
    },
    read(o) {
      if (closed) return Promise.reject(new TentError('T0013', 'The engine was closed, and opens no app.'))
      return import('./read.ts').then(({ readApp }) => readApp(program, o))
    },
    async work(o) {
      if (closed) throw new TentError('T0013', 'The engine was closed, and starts no worker.')
      const { startWorker } = await import('./work/worker.ts')
      const { systemClock } = await import('./makers.ts')
      const input = {
        dataFolder: o.folder,
        secrets: {},
        settings: {},
        mcp: { request: () => Promise.reject(new TentError('T0013', 'No client of MCP is joined to a worker.')) },
      }
      const makers = o.makers ?? options.makers
      const clock = makers?.clock?.(input) ?? systemClock
      // The work on a worker makes its model calls itself, through the providers that the makers of this program make.
      const worker = await startWorker(o, clock, 'live', makers?.providers?.(input), makers?.room)
      workers.add(worker)
      return worker
    },
    get port() {
      return listened
    },
    give: (kind, name, object, app) => given.give(kind, name, object, app),
    program: () =>
      programUsed(() => [...apps].map((one) => one.dataFolder), msOf('levelEvery', options.levelEvery, 3_600_000)),
    offer: (name, source) => offerSource(program.token, name, source),
    serve: (app, prefix, o, handler) => serveUnder(app, prefix, o, handler),
    on(event, handler) {
      const held = handlers.get(event) ?? new Set()
      handlers.set(event, held.add(handler))
    },
    async close() {
      if (closed) return
      closed = true
      unwatched?.()
      for (const worker of workers) await worker.close({ now: true })
      // The web side takes no new request, and the calls in flight get their time, before the apps are closed.
      await (await web?.catch(() => undefined))?.close()
      await Promise.all([...apps].map((o) => closeApp(o)))
      given.close()
      forgetSources(program.token)
      forgetReader(program.token)
      // An app that sleeps keeps what is due in its folder, for the next start.
      for (const sleeper of sleepers) sleeper.stop()
      if (--engines === 0) {
        setRuntime(null)
        unwrapFetch()
      }
    },
  }
}
