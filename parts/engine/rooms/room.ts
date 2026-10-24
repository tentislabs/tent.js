// The seam where an app's code runs: every call into it goes through the room of the app, which a program makes.
import type { Readable, Writable } from 'node:stream'
import type { Mode } from '../../data/index.ts'
import type { DrawInput, Drawn } from '../../screens/draw.ts'

/** What a room is made with: which app of the program, its mode, the thread or machine it serves, and its ways out. */
export interface RoomInput {
  // The app's name, from its description.
  app: string
  // Which app of the program it is: a host tells apps, and their owners, apart by it.
  dataFolder: string
  mode: Mode
  // The thread, or the machine, the room serves: one room for each.
  where: 'main' | 'query' | 'worker'
  ways: Ways
}

/**
 * Where an app's code runs. `crosses` says whether its code lives in a heap of its own: then each call is numbered
 * and kept open for `ways`. `load` loads the modules of a version and runs their tops, T0011 for one that does not
 * load; `entry` is asked once for each entry when the version is loaded, and the engine keeps what it answers;
 * `draw` answers the draw of the page code for a version; `back` calls a function the room's code handed the engine
 * in an open call; `program` starts a program that runs the app's own code; `unload` lets a version go.
 */
export interface Room {
  readonly crosses: boolean
  load(version: RoomVersion): Promise<void>
  entry(version: string, entry: Entry): Called
  draw(version: string): Draw
  back(call: number, fn: number, args: unknown[], o: CallOptions): unknown
  program(o: ProgramStart): AppProgram
  unload(version: string): void
  close(): void | Promise<void>
}

/** `hold` of a project, as it is stored. */
export type Hold = true | { net?: readonly string[]; programs?: readonly string[]; native?: readonly string[] }

/** One version of an app as a room loads it: each module that holds code with the kinds that need it, and its files. */
export interface RoomVersion {
  id: string
  modules: { path: string; kinds: Kind[] }[]
  // A built server file of the version, by its path: from its bundle, or through the list of a development version.
  read(path: string): Uint8Array
  // The server file of the page code, for a version that holds a screen.
  page?: string
  hold?: Hold
}

/** The kinds of the app's code that the engine calls. */
export type Kind =
  | 'query'
  | 'change'
  | 'action'
  | 'rule'
  | 'flow'
  | 'route'
  | 'identify'
  | 'onRequest'
  | 'seed'
  | 'maker'
  | 'view'

/** One arrow of a module: `path` holds the names from what the module exports to the arrow, as `[<export>, 'options', 'run']`. */
export interface Entry {
  kind: Kind
  module: string
  path: string[]
}

/** A call into the app's code: it answers at once where `o.sync`, and a promise otherwise. */
export type Called = (handed: unknown[], o: CallOptions) => unknown

/** How one call is carried: its number in a room that crosses, whether it answers at once, whether it is pure, and the milliseconds it still has. */
export interface CallOptions {
  call: number
  sync: boolean
  pure: boolean
  left: number
}

/** The draw of the page code for one version: the room loads the views it needs and draws with them. */
export type Draw = (input: Omit<DrawInput, 'views'>, o: CallOptions) => Promise<Drawn>

/** What a program of the app is started with. */
export interface ProgramStart {
  for: 'python' | 'install' | 'mcp'
  command: string
  args: string[]
  folder: string
  env: Record<string, string>
}

/** A program of the app: the runtime's own streams, how it ended, and `end`, which ends it with every program it started. */
export interface AppProgram {
  stdin: Writable
  stdout: Readable
  stderr: Readable
  ended: Promise<number | null>
  end(): void
}

/**
 * How the code of a room that crosses reaches the engine: the runtime slot of `core`, a `db` the call was handed, a
 * function the engine handed the room in that call, and the guarded fetch, each as the call would reach it in the
 * program.
 */
export interface Ways {
  runtime(call: number, word: 'call' | 'handle' | 'start' | 'emit' | 'draw', args: unknown[]): unknown
  db(call: number, db: number, member: 'read' | 'write' | 'sql', args: unknown[]): unknown
  back(call: number, fn: number, args: unknown[]): unknown
  // The request and its answer in the crossing form, each a request and a response with its body as a stream.
  fetch(call: number, request: unknown): Promise<unknown>
}
