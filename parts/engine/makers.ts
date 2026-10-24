import type { AiEnv, Provider } from '../ai/index.ts'
import type { Signer, Verifier } from '../connect/index.ts'
import type { Secrets, Settings } from '../core/index.ts'
import type { Clock } from '../core/internal.ts'
import type { ChangeSink, Mode, Searcher, Store } from '../data/index.ts'
import type { Driver } from '../flows/index.ts'
import type { Room, RoomInput } from './rooms/room.ts'

/**
 * What names the one writer of an app on many machines. `hold` is asked by the machine that is, or wants to be, the
 * writer, and answers whether it holds the lease for the next `forMs` milliseconds.
 */
export interface Lease {
  hold(o: { app: string; mode: Mode; machine: string; forMs: number }): boolean | Promise<boolean>
}

/**
 * Where the bytes of the files of an app lie. A store keeps bytes under their fingerprint and knows nothing else:
 * ids, names, kinds, and keeping the same bytes once are the engine's. Bytes go in and out as streams. `get`
 * answers the bytes from `from` to `to`, both counted from 0 and both among them, and throws for bytes that are
 * gone. `shared` says that every machine of the app reaches this store.
 */
export interface FileStore {
  shared?: true
  // An address of the store for one upload straight to it, under a name of 64 hex characters, with its size and its
  // kind, that lasts `seconds`.
  direct?(name: string, info: { size: number; kind: string }, seconds: number): Promise<string>
  put(fingerprint: string, bytes: ReadableStream<Uint8Array>, info: { size: number; kind: string }): Promise<void>
  get(fingerprint: string, range?: { from: number; to?: number }): ReadableStream<Uint8Array>
  remove(fingerprint: string): Promise<void>
}

/** One address of a message, with the name beside it where it has one. */
export interface Who {
  address: string
  name?: string
}

/**
 * What sends the mail of an app. It is handed a message with every address as a record and every list as a list,
 * and each attached file read first, since a mailer cannot read a file itself. `refused` of its answer names the
 * addresses that the server did not take. A mailer that throws took the message for nobody.
 */
export interface Mailer {
  send(message: {
    to: Who[]
    from: Who
    subject: string
    text?: string
    html?: string
    replyTo?: Who
    cc?: Who[]
    bcc?: Who[]
    headers?: Record<string, string>
    attach?: { name: string; kind: string; bytes: Uint8Array }[]
  }): Promise<{ refused?: string[] }>
}

/**
 * A reader of a kind of file that ours do not read, or that a builder reads another way. `kinds` lists exact
 * kinds, or a kind that ends in `/*`. It is asked before ours, on the main thread, and held to `limits.readTime`.
 */
export interface TextReader {
  kinds: string[]
  read(bytes: Uint8Array, info: { kind: string; name: string }): Promise<string>
}

/** What a maker is handed: where the data of the app lies, its secrets and settings, and a request to a client of MCP. */
export interface MakerInput {
  dataFolder: string
  secrets: Secrets
  settings: Settings
  mcp: { request(grant: string, method: string, params: object): Promise<unknown> }
}

/**
 * The adapters that a program, or the `engine.ts` of a project, fills: each entry is a function that makes
 * the thing for one app. A made thing may have `close`, which the engine calls when the app is closed.
 */
export interface Makers {
  store?: (o: MakerInput) => Store
  lease?: (o: MakerInput) => Lease
  clock?: (o: MakerInput) => Clock
  files?: (o: MakerInput) => FileStore
  mailer?: (o: MakerInput) => Mailer
  textReaders?: (o: MakerInput) => TextReader[]
  // A text search of the builder's own, in place of the store's.
  search?: (o: MakerInput) => Searcher
  // Is handed every committed write, for a continuous copy.
  changes?: (o: MakerInput) => ChangeSink
  // Is told when heavy work waits for a kind of worker, and when a worker is idle.
  workers?: (o: MakerInput) => Workers
  // The auths of the builder's own, by the name a service gives in `auth: { by }`.
  signers?: (o: MakerInput) => Record<string, Signer>
  // The checks of a signature of the builder's own, by the name a scheme gives in `{ by }`.
  verifiers?: (o: MakerInput) => Record<string, Verifier>
  // The providers of the builder's own, by the name a model gives in `provider`.
  providers?: (o: MakerInput) => Record<string, Provider>
  // The drivers of the builder's own, by the name an agent gives in `driver`: each made from the `env` ours is made from.
  drivers?: (o: MakerInput) => Record<string, (env: AiEnv) => Driver>
  // The closed room that a host connects for code that is not trusted, which workspaces build and run in.
  sandbox?: (o: MakerInput) => Sandbox
  // Where the app's code runs: given by a program alone, never by the bundle's `engine.ts`.
  room?: (o: RoomInput) => Room
}

/** A box: the folder of the project and the folder it may write, each as its path reads inside the box. */
export interface Box {
  id: string
  folder: string
  work: string
}

/** What a command that ran in a box printed, and how it ended. */
export interface Ran {
  code: number
  out: string
  err: string
}

/**
 * A place a host connects where a command runs on a project's files, and nothing else: the build of a project whose
 * code is not the host's, and its installing. `start` is handed the id of a workspace, its owner, the folder of its
 * project, which the box shows and lets nothing write, and a folder the box lets its code write, and answers the
 * box, the same one for an id whose box stands. `run` carries a command out and answers when it ended. `stop` ends
 * the box and all in it; `work` stays. What a box is made of is the host's to choose.
 */
export interface Sandbox {
  start(o: { id: string; owner: string; folder: string; work: string }): Promise<Box>
  run(box: Box, command: string, o?: { signal?: AbortSignal }): Promise<Ran>
  stop(box: Box): Promise<void>
}

/**
 * What starts and stops the machines that heavy work runs on, by what waits and what is idle. `heldBack`: how
 * many of those that wait a limit of use holds back; `oldest`: the age of the oldest waiting task, in ms; `since`:
 * the moment from which the worker held no task. What either throws is logged, and changes nothing.
 */
export interface Workers {
  need(o: {
    app: string
    mode: Mode
    kind: string
    waiting: number
    heldBack: number
    oldest: number
    limits?: { unit: string; limit: number; used: number; reserved: number }[]
  }): void
  idle(o: { app: string; mode: Mode; kind: string; worker: string; since: number }): void
}

// Kept before any query runs, since the clock is swapped for one that fails while the `run` of a query runs.
const realNow = Date.now

// The furthest off that the runtime sets a timer, in milliseconds: one that is asked for beyond it fires at once.
const furthest = 2 ** 31 - 1

/** The clock that ships: the clock of the system, and its timers. A timer is called at its moment and never before. */
export const systemClock: Clock = {
  now: () => realNow(),
  setTimer(at, fn) {
    let timer: NodeJS.Timeout
    // Each time the timer of the runtime fires, the time is held against the moment: no length is trusted.
    const wake = (): void => {
      const left = at - realNow()
      if (left <= 0) fn()
      else timer = setTimeout(wake, Math.min(left, furthest))
    }
    timer = setTimeout(wake, Math.min(Math.max(0, at - realNow()), furthest))
    return () => clearTimeout(timer)
  },
}
