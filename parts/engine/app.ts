import type { Caller, Finding } from '../core/index.ts'
import type { CallDone } from './called.ts'
import { TentError } from '../core/index.ts'
import type { Description, Facts } from '../core/internal.ts'
import { list } from './app/list.ts'
import type { Link } from './copy/link.ts'
import type { At } from './copy/machine.ts'
import type { MachineRow } from './copy/writer.ts'
import type { Runner } from '../flows/index.ts'
import type { LiveEnd } from './liveEnds.ts'
import type { Opened } from './opened.ts'
import type { As } from './program.ts'
import { againOf, waitedAgain } from './reopening.ts'
import type { Switched } from './versions.ts'
import type { Gradual } from './gradual/release.ts'

/** A definition as it is handed on: read by its name and by nothing else. */
interface Named {
  readonly definition: string
}

/** One app that an engine holds: a bundle and a data folder. It is everything a program uses of an app. */
export interface App {
  /** The description of the running version. */
  readonly description: Description
  /**
   * Calls a function through steps 5 to 10 of the door, with no web request, as the caller that `as` names, and as
   * nobody where it names none. The promise is refused with the `TentError` of a failure, and with T0009 for an
   * error of the code of the app, which is its `cause`. `version` names a loadable version that is not the running
   * one, which answers in its place: T0007 for one that cannot be loaded.
   */
  call(name: string | Named, input: unknown, o: { as: Caller; version?: string }): Promise<unknown>
  /**
   * Sets, removes or lists the names of the secrets and the settings of this app's mode, as the admin command does:
   * a list answers the names that are set, and of the secrets those that a definition names and that have no value.
   * Never a value. Throws T0002 for a word that does not fit.
   */
  values(o: {
    kind: 'secret' | 'setting'
    name?: string
    value?: unknown
    remove?: boolean
    list?: boolean
    // The value of a setting is the text of a command: of one that is no text it is read as JSON.
    written?: boolean
  }): Promise<unknown>
  /** Who a request is to this app, as step 3 of the door finds it: for a program that serves other apps beside it. */
  caller(request: Request): Promise<Caller>
  /**
   * The rows of the log of this app: its newest calls, errors and slow queries, each in the order they were
   * written. `errors` answers the errors alone, `since`, a length of time, only what was written within it, and
   * `newest` at most that many of each. `trace` answers the tree of that trace as `{ trace, spans }`, `slow` the
   * slowest traces of the time beside its slow queries as `{ traces, slow }`, `callers` how many callers called each
   * function within `since`, as `{ callers }`, and `vitals` the speed visitors saw as `{ vitals }`. Throws T0002 for a `since` that does not read as a length of time, and for a `trace` that is no
   * id of one, and T0001 for a trace that was not kept.
   */
  logs(o?: {
    errors?: boolean
    since?: string
    newest?: number
    trace?: string
    slow?: boolean
    callers?: boolean
    // For each screen and version, the speed its visitors saw over a day, the screens furthest past the line first.
    vitals?: boolean
  }): Promise<Record<string, unknown>>
  /**
   * Answers any request through every step of the door, with no network. `from` is the address it counts as
   * coming from, and this computer where none is given.
   */
  request(request: Request, o?: { from?: string }): Promise<Response>
  /**
   * Opens the live connection, `/_t/live`, with no network. Answers the end that a page holds: `send` hands the
   * engine a message, and `each` names what is handed every message and what is told once the connection is
   * closed. Throws what the opening was refused with: T0004, T0005 and T0017.
   */
  live(request: Request): LiveEnd
  /**
   * Carries a plan out, as a table gives one, under the rules of the caller that `as` names. As the system it
   * answers every row, and only then a `private` column.
   */
  read(plan: object, o: { as: As }): Promise<unknown>
  /**
   * Carries a list of writes out, as a table gives them, as one write under the rules of the caller that `as`
   * names, and answers the row of each.
   */
  write(writes: object[], o: { as: As }): Promise<unknown>
  /**
   * Answers what a `GET` of an address of the app would, as the caller that `as` names: a screen that needs a
   * sign-in answers 302 with the address in `headers.location`, and an unknown address 404 with the `notFound` screen.
   */
  page(path: string, o?: { as?: As }): Promise<{ status: number; headers: Record<string, string>; html: string }>
  /**
   * In the modes `development` and `test`: makes a session for a user as `sessions.start` does, with no request and
   * no address of the app, and answers its cookie, `tent_session.<the app's name>=<the token>`, with which a browser
   * of this computer is that user. The user is named by the id of its row, or as a caller. On a reader its writer
   * writes the session, and a request that carries the cookie there waits until the reader holds it. Throws T0013 in
   * the mode `live`, and T2103 where it names no user of the app.
   */
  session(user: string | Caller): string
  /**
   * Puts a stand-in in place of a service or a model, by its name: for a service an object of its calls, each an
   * answer or a function of the input that gives one. It is asked in place of sending, until the app is closed.
   * Under the name `fetch`, its member `fetch` answers every plain `fetch` of the app's code.
   */
  standIn(name: string, stand: object): void
  /**
   * In the mode `test` alone: carries a piece of work out, as a call of a test, and answers what it answered or
   * threw with each table it read with its rows, each row it wrote as it was before and after, and its trace, at
   * most 50 rows of a table. Throws T0013 in any other mode.
   */
  called<Answer>(work: () => Promise<Answer>): Promise<CallDone<Answer>>
  /** Applies the seed of the running version, as the system. */
  seed(): Promise<void>
  /**
   * A picture of a screen: as nobody, or as the user that `as` names, by a session, at `size` (1280 by 800 where
   * none is given), with `full` the whole height of the page, and with `dark` as a browser set to dark draws it. It is written to
   * `out`, or into `shots/` of the data folder. Answers where it lies, its size, and the status of the screen.
   */
  shot(
    path: string,
    o?: {
      as?: string | Caller
      size?: { width: number; height: number }
      full?: boolean
      dark?: boolean
      out?: string
      wait?: number
    },
  ): Promise<{ file: string; width: number; height: number; status: number }>
  /**
   * Writes the site out as files for any host of files, from the version that `version` names or the running one,
   * which must be a release build, as nobody: each page that anyone may see, under `base` and naming `origin`.
   * Answers the address of each page it wrote, what it left out with the reason, and its warnings.
   */
  export(
    folder: string,
    o?: { base?: string; origin?: string; version?: string; names?: 'plain' | 'any' },
  ): Promise<{ pages: string[]; skipped: { what: string; why: string }[]; findings: Finding[] }>
  /** Writes the data file out to a file, and answers the number of the last write that the snapshot holds. */
  snapshot(toFile: string): Promise<{ writes: number }>
  /** Puts the file of a snapshot back under the running app, and applies the table changes to it. */
  restore(file: string): Promise<void>
  /**
   * Answers what the check needs of the running app: what the table change from its data to a description would
   * be refused for, T2001 to T2004. The description is the one of the running version where none is handed in. Of an
   * app that keeps a data file for each tenant it answers a promise. With `back` the description is that of older
   * files, and it answers what a switch with `back` to them would be refused for.
   */
  facts(description?: Description, o?: { back?: boolean }): Facts | Promise<Facts>
  /** What this app is among the machines that hold its data: the one that writes, or one that follows it. */
  readonly role: 'writer' | 'reader'
  /**
   * Opens the link of a reader, `/_t/copy`, with no network. Answers the end that the reader holds: a frame is a
   * text or bytes, and `each` names what is handed every frame and what is told once the link is closed. Throws
   * what the opening was refused with.
   */
  link(request: Request): Link
  /**
   * Where this machine stands: the last write it holds, the last it knows to be settled, the epoch, its running
   * fingerprint, and whether it may answer. On the writer `current` is true.
   */
  at(): At
  /** Every machine of the app, as this one knows them: on the writer from its links, on a reader what its writer last told it. */
  machines(): MachineRow[]
  /** The workers that joined the writer, each with what it works on; what waits for each kind; and a worker that is handed nothing more, which answers whether it holds no task. */
  workers(): object[]
  work(): object[]
  release(worker: string): boolean
  // For each column that work fills, how many of its values are missing, old and failed.
  filled(): {
    table: string
    column: string
    missing: number
    old: number
    failed: number
    oldest?: number
    lastHour: number
    limits: object | 'none'
  }[]
  /**
   * On a reader: it becomes the writer. Answers the epoch and the number of its last write. Refused with T0030 on
   * the writer, T0029 on a reader that does not hold the whole data, and T0032 on a reader that is current.
   */
  takeOver(): Promise<{ epoch: string; n: number }>
  /**
   * Makes one more version loadable, from the folder of its bundle, and answers its id. The promise is refused
   * with T0011 for a bundle whose description does not pass, or whose code cannot be loaded.
   */
  add(bundleFolder: string): Promise<string>
  /**
   * Makes a loadable version the running one: its table changes are applied inside one write, and a call that
   * names no version is served by it from then on. Answers whether the switch was hard, whether it opened the app
   * again, and the table steps it applied. The promise is refused with T0007 for a version that cannot be loaded,
   * and with the finding of a table change that is refused, T2001 to T2004, with nothing changed. With `dry`
   * everything is checked and nothing is changed. On an app that keeps a data file for each tenant it answers
   * `behind`, the count of files that are not brought up yet, and `refused: 'behind'` where it was not taken for
   * that. With `move` the rows of a table that gains or loses `tenant` are moved from one way to the other. With
   * `back`, a table and a column that the data holds and the version does not know is retired without a statement.
   * With `gradual` the version is given to a share of the callers first, widened step by step or taken back by its
   * watch, and `release` says how it stands; `'widen'` and `'back'` move a release that goes, by hand. With `backup`
   * a backup of the data is taken before the switch also where it changes no table, as before every publish. T9108
   * for a version whose table change is hard. In the mode `development`: `swap` names the files of the bundle that a
   * save of the look alone changed, each by its path, which every open page is told to take in place by Fast Refresh,
   * each with its mark, and the watches of the pages are moved to the new version; with `reload` every open page
   * loads its address anew, also where the version runs already.
   */
  switch(
    version: string,
    o?: {
      dry?: boolean
      move?: boolean
      backup?: boolean
      hard?: 'refuse' | 'stop'
      back?: boolean
      gradual?: Gradual | 'widen' | 'back' | 'status'
      swap?: string[]
      reload?: boolean
    },
  ): Promise<Switched>
  /**
   * Every version that can be loaded. `needed`: a live connection holds a watch that names it, or a run of it has not
   * ended. `share`: while a release goes, the share of the callers that each of its two versions is given.
   */
  versions(): { id: string; running: boolean; needed: boolean; addedAt: number; share?: number }[]
  /** A version that is neither running nor needed can no longer be loaded. Answers whether it was dropped. */
  drop(version: string): Promise<boolean>
  /**
   * In the mode `development`: what open pages show as an overlay, the findings of the build and of the check.
   * An empty list takes the overlay away. Throws T0013 in any other mode.
   */
  show(findings: Finding[]): void
  /**
   * A token that puts a page into the inspect mode for a tool whose pages come from the origin `framedBy`, or for
   * one of that origin that opens the page in a window of its own, `{ opener: <origin> }`. It lives in the memory of
   * the engine for `for`, one hour where it is left out. Throws T0002 for a `framedBy` that is no origin and a `for`
   * that is no length.
   */
  inspect(o: { framedBy: string | { opener: string }; for?: string }): string
  /** Closes this app only, and for good: its names are given up, and what the makers made is told. */
  close(): Promise<void>
  /** Wakes an app that sleeps, and answers when it is open. An app that is awake answers at once. */
  ready(): Promise<void>
  /**
   * Starts a run of a flow as the caller that `as` names, and does not wait. Answers the id of the run, or
   * `{ dropped: true }` for a start that the pace of the flow dropped. The promise is refused with T0001 for a name that is no flow, and with T0002 for an input that does not fit.
   * Of an agent, `limits` make its limits smaller for that run, and `sources` name sources of tools that were
   * offered to the engine, each with what it is handed.
   */
  start(
    name: string | Named,
    input?: unknown,
    o?: {
      as?: As
      limits?: { steps?: number; perRun?: Record<string, number>; time?: string }
      sources?: { name: string; context: unknown }[]
    },
  ): Promise<{ run: string } | { dropped: true }>
  /**
   * The runs of the app: `read` and `find` answer runs with their steps, `wait` a promise of the answer of a run,
   * which is refused with the error of a run that failed and with T5106 for one that was stopped, and `approve`,
   * `refuse` and `stop` answer a step that waits for a person and stop a run. `stopAll` and `replayAll` act on
   * every run that a filter fits, `pause` and `resume` hold a flow and let it go, and `paused` names the flows held.
   */
  readonly runs: Pick<
    Runner,
    'read' | 'find' | 'wait' | 'approve' | 'refuse' | 'stop' | 'stopAll' | 'replayAll' | 'pause' | 'resume' | 'paused'
  >
}

// Members that every app has, each a function, by which a thing is told for an app: a share of them, and enough.
const members = [
  ...[
    'add',
    'at',
    'call',
    'close',
    'drop',
    'export',
    'facts',
    'inspect',
    'link',
    'live',
    'machines',
    'page',
    'read',
    'request',
    'restore',
    'seed',
    'session',
    'shot',
    'snapshot',
  ],
  ...['show', 'start', 'switch', 'takeOver', 'versions', 'write'],
]

/** Whether a thing holds every member of an app. */
const isApp = (thing: object): thing is App =>
  'description' in thing && 'role' in thing && members.every((name) => typeof Reflect.get(thing, name) === 'function')

// What each app answers through: what the engine holds of it now, and its members. An app is the same object
// when it is opened again, and answers through the new opening from then on.
const behind = new WeakMap<object, { o: Opened; members: Map<string, unknown> }>()

/** What the engine holds of an app now, by the app as a program holds it: nothing for an object that is none. */
export const openedOf = (app: object): Opened | undefined => behind.get(app)?.o

/**
 * Takes what the engine holds of an app, and the app where it is opened again. Answers the app as a program holds
 * it: each member is made from its file in `app/`, handed what the engine holds, so that no member reaches inside
 * the engine by another way. An app that is opened again stays the object it was, and its members are made anew.
 */
export async function appOf(o: Opened, again?: App): Promise<App> {
  const members = new Map<string, unknown>()
  for (const { name, load } of list) members.set(name, (await load()).member(o))
  const held = again ? behind.get(again) : undefined
  if (again && held) {
    held.o = o
    held.members = members
    return again
  }
  const now = { o, members }
  const app = Object.defineProperty({}, 'description', { get: () => now.o.description, enumerable: true })
  Object.defineProperty(app, 'role', { get: () => now.o.machine.role(), enumerable: true })
  // A member that is a record of its own, as `runs`, is the record of the app as it stands now.
  for (const [name, made] of members)
    if (typeof made !== 'function')
      Object.defineProperty(app, name, { get: () => now.members.get(name), enumerable: true })
    else
      Object.defineProperty(app, name, {
        value: (...args: unknown[]): unknown => {
          const call = (): unknown => {
            const member = now.members.get(name)
            if (typeof member !== 'function') throw new TentError('T0009', `The app has no member ${name}.`)
            return Reflect.apply(member, app, args)
          }
          // A call that arrives while the app is opened again waits for the new opening, within `web.openTime`.
          const again = againOf(app)
          return again ? waitedAgain(again, now.o.waits.open).then(call) : call()
        },
        enumerable: true,
      })
  behind.set(app, now)
  if (!isApp(app)) throw new TentError('T0009', 'The engine could not make every member of an app.')
  return app
}
