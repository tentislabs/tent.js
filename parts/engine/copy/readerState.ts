import type { Change } from '../../data/index.ts'
import type { Opened } from '../opened.ts'
import type { FileBytes } from './fileBytes.ts'
import type { Link } from './link.ts'
import type { Reached } from './reach.ts'
import type { Reads } from './reader.ts'
import type { MachineRow } from './writer.ts'

/** One link that a reader opened, with the address it leads to, and whether its place was taken. */
export interface Open {
  link: Link
  address: string
  go: boolean
  // The change whose text arrived, and whose record is the next frame.
  coming?: Omit<Change, 'record'>
  // What the writer said is settled, with that change.
  settledWith?: unknown
  // The epoch that the writer named when it took the place of this reader.
  epoch?: string
  heard: number
}

/** What a reader holds of itself in memory, which the files that make a reader share. */
export interface ReaderState {
  readonly o: Opened
  readonly reads: Reads
  readonly reached: (address: string) => Reached
  // The folder was a writer's, and has not reached a writer of a newer epoch yet.
  returning: boolean
  // The last write that it applied, the epoch it holds it under, and the last write it knows to be settled.
  applied: number
  held: string
  settled: number
  // The link that is open, or that is being opened.
  open: Open | undefined
  // The address that a machine named as the writer's.
  named: string | undefined
  // The machines of the app, as its writer last told them.
  machines: MachineRow[]
  // The addresses of the machines that may take over, as its writer last named them: its data keeps them, so
  // that a reader which is started again still holds them.
  takes: string[]
  // The length of a beat and how long a reader may be behind, as its writer last told them.
  limits: { beat: number; behind: number }
  closed: boolean
  // It fetches the data anew, and it lacks a version that it was sent a change of.
  busy: boolean
  lacking: boolean
  // The bytes of files that a near reader could not fetch yet, with the number of the write that added each, or
  // 0 for a row it held when its link opened: once that write is settled, it is not current while it lacks them.
  readonly bytesLacking: Map<string, { file: FileBytes; n: number }>
  // When each beat that waits for its answer was sent, by the id of the beat.
  readonly sent: Map<number, number>
  // What arrives is taken in order, also where taking one frame waits: a change is applied before the next is read.
  work: Promise<void>
}

/** Writes a line of the log of the app of a reader. */
export const readerLine = (r: ReaderState, level: string, message: string, data: object): void =>
  r.o.log.write('lines', { at: r.o.clock.now(), level, message, data: JSON.stringify(data) })
