import type { MessagePort } from 'node:worker_threads'
import type { Change, Misfit, TableLayout, TableStep } from '../../data/index.ts'
import type { Crossed } from '../rooms/crossing.ts'

/** One file that a file thread brings to a layout, in a write whose number the main thread hands out. */
export interface RaiseJob {
  path: string
  layout: TableLayout[]
  // The changes of the app are kept, and the epoch that the app stands in.
  keep: boolean
  epoch: string
  back?: boolean
  // With `back`: the steps by which the file was brought up from the layout it goes back to, which are turned round.
  turned?: TableStep[]
  clean?: boolean
  // The write fails right after it was handed its number: a test asks for that.
  fails?: boolean
  // In place of bringing the file up: it is held against the steps of a check, and where every row fits it is
  // held to them under that version. What does not fit is answered.
  check?: { steps: TableStep[]; version: string }
  // In place of bringing the file up: the holds of that version are taken away.
  drop?: string
}

/** One file that a file thread of a reader puts a change of its writer into, which holds its own number. */
export interface ApplyJob {
  path: string
  apply: Change
}

/** One file that a file thread is handed, with the number of the handing over. */
export type FileJob = (RaiseJob | ApplyJob) & { id: number }

/** What a file thread tells the main thread. */
export type FileTold =
  | { ready: true }
  | { id: number; number: true }
  | { id: number; change?: Change; misfits?: Misfit[] }
  | { id: number; failed: Crossed }

/** What a file thread is started with: its end of the channel, and the memory that it shares with the main thread. */
export interface FileStart {
  port: MessagePort
  // A whole number that says where the write stands, and the number of the write.
  shared: SharedArrayBuffer
}

// What the shared whole number says: the thread waits for a number, the number is handed, the write has ended.
export const waits = 0
export const jobHanded = 1
export const ended = 2

/** The two views of the memory that a file thread shares with the main thread. */
export const viewsOf = (shared: SharedArrayBuffer): { state: Int32Array; number: Float64Array } => ({
  state: new Int32Array(shared, 0, 2),
  number: new Float64Array(shared, 8, 1),
})
