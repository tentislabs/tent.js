import { TentError } from '../../core/index.ts'
import { manyLimit } from '../held.ts'
import type { Opened } from '../opened.ts'
import type { ReaderKey } from './keys.ts'
import type { Link } from './link.ts'

/** A reader whose link is open, as its writer holds it. */
export interface JoinedReader {
  id: string
  key: ReaderKey
  far: boolean
  own?: string
  address: string
  link: Link
  since: number
  // The number that the writer held when it answered the beat before, which the next beat is held against.
  beatAt?: number
  // The versions that it said it holds, when each version was first named to it, and what waits for it to hold one.
  ready: Set<string>
  named: Map<string, number>
  waits: { version: string; done(): void }[]
}

/** What a writer says of whether it writes. */
export type Writes = 'writes' | 'back' | 'stopped' | 'no lease'

/** What a writer holds of itself in memory, which the files that make a writer share. */
export interface WriterState {
  readonly o: Opened
  // The machine id of this writer, and the address by which its readers reach it.
  readonly id: string
  readonly own: string | undefined
  readonly opened: number
  readonly links: Map<string, JoinedReader>
  // The number of the last write that it holds, and the epoch it stands in.
  n: number
  epoch: string
  // The first number that its shared file lost to a power cut, while it has not gone on since.
  lost: number | undefined
  // The reader that it stands back for, and what stopped it for good.
  back: { reader: string; n: number } | undefined
  stopped: { epoch: string; own?: string } | undefined
  // The number of the epoch that began with a file that was put back: what a reader held before it was given up on purpose.
  givenUp: number | undefined
  // Whether the app wrote since this writer opened.
  wroteSince: boolean
  closed: boolean
  // The newest other writer that was heard of: kept in memory, until this writer closes.
  other: { epoch: string; own?: string } | undefined
  // Until when its last yes of the lease holds, whether the app has a lease at all, and what asks the lease again.
  leaseUntil: number | undefined
  leaseAsked: boolean
  asks: (() => Promise<void>) | undefined
  // How long a reader could be behind under the version that ran before, and until when a reader that was cut
  // off under it may still answer by itself: the writer waits by the longer of the two times for that long.
  longer?: { behind: number; until: number }
}

/** The length of a beat of an app, and how long a reader of it may be behind, as the running version states them. */
export const beatOf = (w: WriterState): number => manyLimit(w.o.description, 'beat')
export function behindOf(w: WriterState): number {
  const stated = manyLimit(w.o.description, 'behind')
  return w.longer && w.o.clock.now() < w.longer.until ? Math.max(stated, w.longer.behind) : stated
}

/** Writes a line of the log of the app of a writer. */
export const writerLine = (w: WriterState, level: string, message: string, data: object): void =>
  w.o.log.write('lines', { at: w.o.clock.now(), level, message, data: JSON.stringify(data) })

/** Whether a writer writes now, and why not where it does not. */
export const writerWritesNow = (w: WriterState): Writes =>
  w.stopped
    ? 'stopped'
    : w.back
      ? 'back'
      : w.leaseAsked && (w.leaseUntil ?? 0) < w.o.clock.now()
        ? 'no lease'
        : 'writes'

/** The error of a writer that does not write for now, or no longer: T0030 for what writes, and T0029 for anything else. */
export function notWriting(state: Writes, writes: boolean, own: string | undefined): TentError {
  const why =
    state === 'stopped'
      ? 'a machine took over, and this writer was stopped'
      : state === 'back'
        ? 'a reader holds more writes than this writer, which stands back'
        : 'this writer holds no lease'
  const fix =
    state === 'back'
      ? 'Run `tent take-over` on the machine that is to go on.'
      : state === 'stopped'
        ? `Reach the writer${own ? ` at ${own}` : ''}, or start this folder with \`--reads\`.`
        : 'Ask again once this machine holds the lease, or reach the machine that holds it.'
  return new TentError(writes && state !== 'back' ? 'T0030' : 'T0029', `This machine does not write: ${why}.`, { fix })
}
