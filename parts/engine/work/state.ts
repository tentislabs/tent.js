import type { Leave, StepAt, Waiting } from '../../flows/index.ts'
import type { Link } from '../copy/link.ts'
import type { WorkerKey } from './keys.ts'
import type { TasksOut } from './shares.ts'

/** A task that is out to a worker, as the writer holds it. */
export interface OutTask {
  task: string
  kind: string
  version: string
  // The leave of the run of each, where a tool call stands above it: the writer holds the outside calls to it.
  steps: { run: string; step: StepAt; leave?: Leave }[]
  at: number
  // Its `work` message left, its worker said that it began, and other tasks were out to that worker beside it.
  sent: boolean
  started: boolean
  beside: boolean
  // An `alive` or a `started` of its worker named it; the `work` message that was sent, to be sent again where it never arrived.
  seen?: boolean
  work?: object
  // It goes alone: its worker is kept for it, and holds nothing beside it.
  alone?: boolean
  // What its code states that it uses, by name: the writer carries out nothing else that the work asks for.
  uses?: string[]
  // The `may`s the writer answered for it since it handed it out, by their ids, with the key and the place each named,
  // which each `did` is held to. A task taken up again as the writer opened holds none: its `did`s name their calls.
  mays?: Map<string, { key: string; nth: number }>
  // The fingerprints of the files that the task names, and the files the writer made to carry rows and answers to it,
  // that its worker posted with `carry`, and that its work made, by their ids.
  files?: string[]
  made?: string[]
  carried?: string[]
  posted?: string[]
  // The files of the engine's own that keep what the progress of its step names, which its worker may read by their ids.
  kept?: string[]
  // What it reserves against the limits of use while it is out, in ms; its share of the time its worker held it; and
  // the processor time its worker reported.
  reserve?: number
  heldMs?: number
  cpuMs?: number
}

/** A worker that joined the writer, as the writer holds it. */
export interface Joined {
  id: string
  kinds: string[]
  atOnce: number
  key: WorkerKey
  link: Link
  engine: string
  // The versions it said `ready` for, and the definitions it holds loaded.
  ready: Set<string>
  loaded: string[]
  out: TasksOut
  released: boolean
  going?: number
  // When it last sent anything, and when it last sent `alive`; when it joined, and since when its place is free.
  heard: number
  alive: number
  since: number
  freeSince: number
  joined: boolean
  // Whether its link is open.
  open: boolean
  inARow: { failed: number; lost: number }
  // The tasks it is to stop, named in the answer to its next `alive`.
  stopping: Set<string>
}

/** A try of a step that waits for a worker, with the order it came in. */
export interface InQueue {
  w: Waiting
  seq: number
}

/** The key of a step of a run that waits. */
export const queueKey = (run: string, step: StepAt): string => `${run}\n${step.repeat}\n${step.name}`

/** What the project states of a kind, with what holds where it says nothing. */
export interface KindStated {
  atOnce?: number
  wait: number
  queue?: number
  order: 'waited' | 'oldest'
  turns?: 'caller'
  place: 'spread' | 'pack'
  // Whether a worker that holds the `python` of a task loaded goes before the others.
  loaded: 'first' | 'no'
  orHere: boolean | 'busy'
  // How many workers may be kept for the tasks that go alone, or false for a kind that hands them out as any other.
  alone: number | false
  // After how long with no task a worker of this kind is told idle.
  idleAfter: number
}
