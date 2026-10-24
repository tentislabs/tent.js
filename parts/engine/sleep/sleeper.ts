import { resolve } from 'node:path'
import { TentError } from '../../core/index.ts'
import type { Clock } from '../../core/internal.ts'
import type { App } from '../app.ts'
import { isUpload } from '../door/web.ts'
import { beginEngineFile, removeEngineFile } from '../engineFile.ts'
import { limitOf, storedLimit } from '../limits.ts'
import { systemClock } from '../makers.ts'
import type { OpenOptions } from '../open.ts'
import { claimed, closeApp, openApp, readBundle } from '../open.ts'
import type { Opened } from '../opened.ts'
import type { Program } from '../opening/frame.ts'
import type { Upkept } from '../upkeep.ts'
import { namesOf } from '../web/names.ts'
import type { Addressed } from '../web/server.ts'
import { jsonAnswer, okAnswer, wireError } from '../wire.ts'
import { msOf } from '../words.ts'
import type { Plan } from '../../core/internal.ts'
import { countsReadAlone } from '../counts/readAlone.ts'
import type { About } from '../web/proxy.ts'
import type { AsleepHeld } from './asleepAdmin.ts'
import { asleepAdmin } from './asleepAdmin.ts'
import type { Asleep } from './asleepFile.ts'
import { readAsleep, removeAsleep, writeAsleep } from './asleepFile.ts'
import { inUse, lastUse, usedAt } from './inUse.ts'
import { sleepingMembers } from './members.ts'
import { ownDue } from './ownDue.ts'

/** An app that sleeps, as the engine holds it: what finds it by a name, and what wakes it. */
export interface Sleeper {
  names(host: string, scheme: string): boolean
  // What a request for `/_t/health` is answered while it sleeps: ready, or the error of the waking that failed.
  health(): Response
  // The most bytes that the body of a request for it may hold.
  size(asked: Addressed): number
  wake(): Promise<void>
  // The answer of a command of the admin channel that wakes nothing, or nothing for every other request.
  admin(request: Request, about: About): Promise<Response | undefined>
  // The moment at which something of it is due, as `asleep.json` holds it, or nothing.
  due(): number | undefined
  // The program ends: what is due stays in `asleep.json`, and the folder is let go.
  stop(): void
}

/** What the members of an app that may sleep are handed: the open app where it is awake, and what wakes it. */
export interface Sleeping {
  awake(): App | undefined
  opened(): Opened | undefined
  // A member wakes the app; one that is no use lets it fall asleep again at its end, where nothing else used it.
  wake(byMember?: boolean): Promise<App>
  // A member that is no use ended.
  ended(): void
  // What a request of a member is answered without waking the app, where it is a command that wakes nothing.
  admin(request: Request, about: About): Promise<Response | undefined>
  // The rows of a plan of the counts, read without waking the app.
  counts(plan: Plan): unknown
  close(): Promise<void>
  description: App['description']
  versions(): ReturnType<App['versions']>
}

// How soon an app that was in use when it could have fallen asleep is looked at again, in milliseconds.
const recheck = 1000

// The waits after which a waking for a due moment that failed is tried again: those of a step's tries, and then
// the last of them each time, in milliseconds.
const retries = [5_000, 30_000, 180_000]

/** The error of a member of an app that sleeps which answers at once, and which what was kept does not answer. */
export const asleepError = (name: string): TentError =>
  new TentError('T0013', `The app ${name} sleeps, and this member answers only an app that is open.`, {
    fix: 'Call `await app.ready()` first: it wakes the app, and answers when it is open.',
  })

/**
 * Takes what the engine hands an opening, the folder of a bundle, the options of `engine.open` and `sleepAfter`.
 * Answers an app that falls asleep when nothing used it for that long: its store, its threads, its timers and what
 * its makers made but its clock are given back, `asleep.json` holds what is due, and a request for one of its
 * names, its due moment or a member that needs it opens it again. A folder that holds `asleep.json` for this bundle,
 * whose due moment has not come, is taken as asleep without opening its store.
 */
export async function sleepingApp(
  program: Program,
  bundleFolder: string,
  options: OpenOptions,
  sleepAfter: string,
): Promise<App> {
  const after = msOf('sleepAfter', sleepAfter, 0)
  // The machines of one app stand ready for each other: an app with readers never sleeps.
  if (options.readers?.length) return openApp(program, bundleFolder, options)
  const { description, version } = readBundle(bundleFolder)
  // The running version as it stood when the app last fell asleep, with the folder it runs from: a switch since
  // the opening moves it, and the waking opens that one.
  let running = { description, version, bundle: bundleFolder }
  const dataFolder = resolve(options.dataFolder)
  const input = {
    dataFolder,
    secrets: {},
    settings: {},
    mcp: { request: () => Promise.reject(new TentError('T0013', 'No client of MCP is joined to an app that sleeps.')) },
  }
  // The one thing of the makers that stays while the app sleeps: the timer of its due moment stands on it.
  let clock: Clock = (options.makers?.clock ?? program.makers.clock)?.(input) ?? systemClock
  const names = [options.address ?? []].flat()
  let opened: Opened | undefined
  let app: App | undefined
  let falling: Promise<void> | undefined
  let waking: Promise<App> | undefined
  let failed: unknown
  let claim: { release(): void } | undefined
  let cancelIdle: (() => void) | undefined
  let cancelDue: (() => void) | undefined
  let versions: ReturnType<App['versions']> = [{ id: version, running: true, needed: true, addedAt: 0 }]
  let closed = false
  let port = 0
  // Where the upkeep stood when the app fell asleep, the number of the last write it held when it opened, whether a
  // member woke it and the moment it woke, and how often a waking for a due moment failed in a row.
  let upkept: Upkept | undefined
  let openedAt = 0
  let byMember = false
  let wokeAt = 0
  let failures = 0
  // The moment at which the app was last used from outside, across its sleeps.
  let used = Number.NEGATIVE_INFINITY
  // The engine is told of each app that opens: the one opened here is kept, to be put to sleep.
  const watching: Program = {
    ...program,
    opened(o) {
      opened = o
      program.opened(o)
    },
  }
  // What answers the commands that wake nothing: the counts are read from the store of its makers, to read alone.
  const held: AsleepHeld = {
    token: program.token,
    dataFolder,
    get size() {
      return limitOf(running.description, 'callSize')
    },
    dueAt: () => readAsleep(dataFolder)?.dueAt,
    counts: (plan) => countsReadAlone(dataFolder, (options.makers?.store ?? program.makers.store)?.(input), plan),
  }
  const sleeper: Sleeper = {
    names: (host, scheme) => namesOf(options.address, port)(host, scheme),
    health: () =>
      failed === undefined
        ? okAnswer({ app: running.description.app.name, version: running.version })
        : jsonAnswer(wireError(failed, false).status, { ok: false, error: wireError(failed, false).error }),
    size: (asked) =>
      isUpload(asked) ? storedLimit(running.description, 'uploadSize') : limitOf(running.description, 'callSize'),
    wake: async () => {
      await wake()
    },
    admin: (request, about) => asleepAdmin(request, about, held),
    due: () => readAsleep(dataFolder)?.dueAt,
    stop() {
      cancelDue?.()
      cancelDue = undefined
      removeEngineFile(dataFolder)
      claim?.release()
      claim = undefined
    },
  }

  /** Arms the timer that puts the app to sleep once nothing used it for `sleepAfter`. */
  const armIdle = (at: number): void => {
    cancelIdle?.()
    cancelIdle = clock.setTimer(at, check)
  }
  /** Puts the app to sleep where nothing used it for `sleepAfter`, or at once with `now`, and else looks again later. */
  function check(now = false): void {
    cancelIdle = undefined
    const o = opened
    if (!o || closed || falling || waking) return
    const at = clock.now()
    // Work of the engine's own for it, as a sweep, is looked at again when it ended.
    if (o.inFlight.size) {
      void Promise.allSettled([...o.inFlight]).then(() => {
        if (!cancelIdle) check(now)
      })
      return
    }
    // What else uses it now may end at any moment: it is looked at again soon, and else from the end of the last use.
    if (inUse(o)) armIdle(at + Math.min(after, recheck))
    else if (!now && lastUse(o) + after > at) armIdle(lastUse(o) + after)
    else
      falling = sleep(o).finally(() => {
        falling = undefined
      })
  }
  /** Gives back what the app holds, and keeps what is due. */
  async function sleep(o: Opened): Promise<void> {
    const awake = app
    if (awake) versions = awake.versions()
    running = { description: o.description, version: o.version, bundle: o.bundle }
    // A request that arrives while the app falls asleep finds it by its names, and waits for the waking.
    program.asleep?.(sleeper)
    app = undefined
    opened = undefined
    // What is due: the runs, and the engine's own upkeep where something since asks for it.
    used = Math.max(used, usedAt(o) ?? used)
    const own = ownDue(o, openedAt, used)
    upkept = own.upkept
    const ran = (await closeApp(o, { asleep: true })).dueAt
    const dueAt = ran === undefined ? own.at : own.at === undefined ? ran : Math.min(ran, own.at)
    claim = await claimed(dataFolder, 'engine.open')
    const held: Asleep = { names, version: running.version, ...(dueAt === undefined ? {} : { dueAt }) }
    writeAsleep(dataFolder, held)
    if (dueAt !== undefined) armDue(dueAt)
    program.raise('app.asleep', { app: wrapper, ...(dueAt === undefined ? {} : { dueAt }) })
  }
  /** Has the due moment wake the app, and a waking that failed tried again after a wait. */
  function armDue(at: number): void {
    cancelDue?.()
    cancelDue = clock.setTimer(at, () => {
      cancelDue = undefined
      void wake().catch(() => armDue(clock.now() + retries[Math.min(failures - 1, retries.length - 1)]))
    })
  }
  /** Opens the app again, once for every request and member that asks for it at the same time. */
  function wake(member = false): Promise<App> {
    if (closed) return Promise.reject(new TentError('T0013', `The app ${description.app.name} was closed.`))
    if (app && !falling) return Promise.resolve(app)
    waking ??= (async () => {
      await falling
      cancelDue?.()
      cancelDue = undefined
      // The file goes first, so that a stop in the middle of the waking opens the app whole at the next start.
      removeAsleep(dataFolder)
      claim?.release()
      claim = undefined
      try {
        const kept = clock
        const opening = await openApp(watching, running.bundle, {
          ...options,
          makers: { ...options.makers, clock: () => kept },
        })
        app = opening
        failed = undefined
        failures = 0
        program.awake?.(sleeper)
        if (opened) {
          // Each piece of the upkeep is due a length of time after it last ran, also across the sleep.
          if (upkept) opened.upkeep?.from(upkept)
          openedAt = opened.machine.at().n
          byMember = member
          wokeAt = lastUse(opened)
          armIdle(wokeAt + after)
        }
        program.raise('app.woke', { app: wrapper })
        return opening
      } catch (error) {
        failed = error
        failures += 1
        console.error(`The app ${description.app.name} could not be woken:`, error)
        claim = await claimed(dataFolder, 'engine.open').catch(() => undefined)
        throw error
      }
    })().finally(() => {
      waking = undefined
    })
    return waking
  }

  const sleeping: Sleeping = {
    awake: () => (falling ? undefined : app),
    opened: () => opened,
    wake,
    admin: (request, about) => (app && !falling ? Promise.resolve(undefined) : asleepAdmin(request, about, held)),
    counts: (plan) => held.counts(plan),
    ended: () => {
      if (!opened) return
      // A member woke it and nothing used it since: it falls asleep again at the end of the member.
      if (byMember && lastUse(opened) <= wokeAt) check(true)
      else armIdle(Math.max(clock.now(), lastUse(opened) + after))
    },
    async close() {
      closed = true
      cancelIdle?.()
      cancelDue?.()
      await falling
      await waking?.catch(() => undefined)
      if (app) {
        await app.close()
        app = undefined
        opened = undefined
        return
      }
      // An app that is closed while it sleeps is gone for good: nothing of it is due, and no request finds it.
      program.awake?.(sleeper)
      removeAsleep(dataFolder)
      removeEngineFile(dataFolder)
      claim?.release()
      claim = undefined
    },
    get description() {
      return app?.description ?? running.description
    },
    versions: () => app?.versions() ?? versions,
  }
  const wrapper = sleepingMembers(sleeping, description.app.name)

  const file = readAsleep(dataFolder)
  if (file && file.version === version && (file.dueAt === undefined || file.dueAt > clock.now())) {
    // Asleep from the start: the store is not opened, and the engine listens for the requests that wake it.
    claim = await claimed(dataFolder, 'engine.open')
    // `engine.json` is closed beside the listening, and written once the engine is reached.
    const begun = beginEngineFile(dataFolder)
    try {
      port = await program.listening({ dataFolder })
    } catch (error) {
      begun.drop()
      throw error
    }
    await begun.write({ port, token: program.token, mode: options.mode ?? 'live' })
    program.asleep?.(sleeper)
    if (file.dueAt !== undefined) armDue(file.dueAt)
    return wrapper
  }
  removeAsleep(dataFolder)
  app = await openApp(watching, bundleFolder, options)
  const first = opened
  if (first) {
    clock = first.clock
    openedAt = first.machine.at().n
    port = await program.listening({ dataFolder })
    armIdle(lastUse(first) + after)
  }
  return wrapper
}
