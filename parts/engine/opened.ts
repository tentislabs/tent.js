import type { Caller } from '../core/index.ts'
import { TentError } from '../core/index.ts'
import type { Clock, Description } from '../core/internal.ts'
import type { FileName, Files, IdMaker, Mode, RuleCode, Store } from '../data/index.ts'
import type { App } from './app.ts'
import type { Machine } from './copy/machine.ts'
import type { TenantFiles } from './files/face.ts'
import type { RunsRead } from '../flows/index.ts'
import type { Flowing } from './flows/face.ts'
import type { WorkHub } from './work/hub.ts'
import type { WorkerKey } from './work/keys.ts'
import type { Hub } from './hub/hub.ts'
import type { Log } from './log/file.ts'
import type { Sandbox, Workers } from './makers.ts'
import type { Called, Room } from './rooms/room.ts'
import type { QueryThreads } from './threads/pool.ts'
import type { Upkeep } from './upkeep.ts'
import type { OpenCounting } from './counts/options.ts'
import type { Identify } from './open.ts'
import type { Loadable } from './versions.ts'
import type { About, Came } from './web/proxy.ts'

/** What the engine tells whoever listens, by the name of the event. */
export interface Events {
  // `file` names the tenant's data file of a tenant table.
  'change.done': {
    app: App
    name: string
    caller: Caller
    touched: { table: string; ids: string[]; file?: FileName }[]
  }
  'row.changed': { app: App; table: string; id: string; kind: 'added' | 'changed' | 'removed' }
  'call.failed': { app: App; name: string; caller: Caller; error: unknown }
  // Of an app on many machines: a reader joined or left its writer, by its machine id.
  'reader.joined': { app: App; reader: string; far: boolean; n: number }
  'reader.left': { app: App; reader: string; far: boolean; n: number }
  // A reader holds a write that its writer lacks.
  'machine.ahead': { app: App; reader: string; n: number }
  // A reader stopped being current, and started again.
  'machine.behind': { app: App; n: number }
  'machine.current': { app: App; n: number }
  // The epoch of the app moved on: another machine writes. And a writer heard of another writer, and goes on.
  'writer.changed': { app: App; epoch: string }
  'writer.other': { app: App; epoch: string }
  // Another version of the app runs now.
  'version.switched': { app: App; from: string; to: string }
  // A worker joined the writer, left it, said that its machine goes, was released and holds nothing; work began to wait for a kind.
  'worker.joined': { app: App; worker: string; kinds: string[] }
  'worker.left': { app: App; worker: string; kinds: string[] }
  'worker.going': { app: App; worker: string; within: number }
  'worker.idle': { app: App; kind: string; worker: string; since: number }
  'worker.empty': { app: App; worker: string }
  'work.waits': { app: App; kind: string; waiting: number; heldBack: number; oldest: number }
  // A limit of use began to hold work back.
  'work.limit': {
    app: App
    kind: string
    which: 'kind' | 'caller' | 'definition' | 'column'
    name?: string
    caller?: string
    unit: string
    limit: number
    used: number
    reserved: number
  }
  // A step of a run was done, and its result is saved.
  'step.done': { app: App; flow: string; run: string; step: string }
  // A run ended failed, with what a caller would see of its failure, or was stopped.
  'run.failed': {
    app: App
    flow: string
    run: string
    key?: string
    failure: { step?: string; code: string; message: string }
  }
  'run.stopped': { app: App; flow: string; run: string; key?: string; failure?: undefined }
  // A session was started for a user, by the id of its row.
  'session.started': { app: App; user: string }
  // A model call was answered by a model in the `fallback` of the one that was asked, and why.
  'model.fellBack': { app: App; name: string; answeredBy: string; reason: string }
  // An app that nothing used fell asleep, with the moment at which something of it is due; and it woke.
  'app.asleep': { app: App; dueAt?: number }
  'app.woke': { app: App }
  // Public answers went stale: the addresses, each with its host and its language, the keys of what went stale where
  // `cache.keysHeader` names a header, or `all` at a switch; and why: a write, a new version, or the time of an answer.
  'page.stale': { app: App } & Stale
}

/** What went stale of the public answers of an app, as `page.stale` tells it. */
export interface Stale {
  addresses?: { host: string; address: string; language: string }[]
  keys?: string[]
  all?: true
  why: 'write' | 'version' | 'time'
}

/**
 * What the engine holds of one app that is open: its bundle and its data, what the makers made for it, and what
 * was loaded of its code. Every part of the engine that works for an app is handed this record.
 */
export interface Opened {
  name: string
  mode: Mode
  dataFolder: string
  // The folder that the running version is run from, and its id.
  bundle: string
  version: string
  description: Description
  store: Store
  // Of an app that keeps a data file for each tenant: its files, of which `store` is the shared one, and what
  // the engine holds of them.
  files?: Files & { number(): number }
  tenantFiles?: TenantFiles
  // Of a reader that keeps no file yet: opens the files of tenants, once the version that runs has a tenant table.
  toFiles?: () => Promise<void>
  // The files of tenants that closed before the runner of the app ran: it reads their runs when it starts.
  unreadFiles?: FileName[]
  clock: Clock
  // The source of numbers of the app, where the program gave one: a test app's, from its random seed.
  random?: () => number
  // The maker of the ids of the app's rows, by its clock and its source.
  ids: IdMaker
  log: Log
  // The host of the machines of heavy work, where the program gave one.
  workersHost?: Workers
  // The pass of the columns that work fills, on the writer.
  filling?: { poke(): void; switched(): void; close(): void }
  // The room the app's code runs in, on this thread or machine: every call into the code goes through it.
  room: Room
  // The `run` of each function and flow that is code, by its name, as the room answered it.
  runs: Map<string, Called>
  // Each rule made with `allow` that is code, by the name of its function, as the room answered it.
  allows: Map<string, Called>
  // The `where` rules of the tables that are code, by the name of their export.
  rules: Record<string, RuleCode>
  // The working object behind each handle that this engine has, by its name.
  handles: Map<string, object>
  // What the makers made that is told when the app is closed.
  made: object[]
  // What works on the data of the app by a timer of its own, and is stopped before the data is closed.
  before: { close(): void }[]
  // The calls of actions that are under way, which a closing waits for.
  inFlight: Set<Promise<unknown>>
  closed: boolean
  // The query threads of the app, where it has them: a heavy query is carried out there.
  threads?: QueryThreads
  // The upkeep of the app, which is stopped before its data is closed.
  upkeep?: Upkeep
  // The live hub of the app, from its first live connection on: it is told each committed write.
  hub?: Hub
  // Every version of the app that can be loaded, by its id, once a second one was asked for: the running one is
  // among them.
  versions?: Map<string, Loadable>
  // What the build and the check found, which the open pages of an app in development show as an overlay.
  findings?: object[]
  // The admin token of the engine that holds the app, which a command of this computer sends.
  token: string
  // The names the app was given to answer on, each with its port where that is not the usual one.
  named?: string[]
  // How long the engine waits for an app that is opened, and gives the calls in flight when it is closed, in ms.
  waits: { open: number; stop: number }
  // The web side of the app: whether a request names it, and what the engine knows of a request.
  web: {
    names(host: string, scheme: string): boolean
    // Whether a name is that of the address by which the other machines of the app reach this one.
    own(host: string, scheme: string): boolean
    about(came: Came, headers: Headers): About
  }
  // What the app is as one machine among those that hold its data: the writer, or a reader.
  readonly machine: Machine
  readonly app: App
  raise<Event extends keyof Events>(event: Event, told: Events[Event]): void
  // Tells the engine that the app is closed, so that it holds it no longer.
  left(): void
  // The flows of the app, where it holds any: its runner, and the work behind the words that reach it.
  flows?: Flowing
  // On a reader of an app that holds flows: the runs in its data, which its writer carries out.
  runsRead?: RunsRead
  // What the host opened the app with for its counts, which no bundle counts less than.
  counting?: OpenCounting
  // The keys of the workers that the app lets join, and the hub that hands work to them.
  workerKeys?: WorkerKey[]
  work?: WorkHub
  // Opens the app again on the version that a folder holds, as the same app: where it does not open, it is opened
  // again on the version it ran, and the error is thrown.
  again?(bundleFolder: string): Promise<void>
  // The closed room that the makers of the app made, for the workspaces of a program.
  sandbox?: Sandbox
  // What the program that holds the app opened it with: the `identify` that names its callers in place of the
  // project's, and the sites that may show every screen of it in a frame.
  identify?: Identify
  framedBy?: string[] | 'anyone'
  // In the mode `development`, the rows past the time their table keeps them are removed, as `tent dev --keep` asks.
  keepRows?: true
}

/** Holds a member of an app to an app that is open. Throws T0013 for one that was closed. */
export function heldOpen(o: Opened): void {
  if (o.closed)
    throw new TentError('T0013', `The app ${o.name} was closed, and nothing opens it again.`, {
      fix: 'Open the bundle again with `engine.open`, and use the app that it answers.',
    })
}
