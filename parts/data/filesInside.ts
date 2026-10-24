import { TentError } from '../core/index.ts'
import type { Change } from './changes.ts'
import type { FileName } from './fileName.ts'
import type { Files } from './files.ts'
import type { Hold } from './metaKeys.ts'
import type { WriteNotes } from './noted.ts'
import type { Bytes, OpenWrite, Store, TableLayout, Tx } from './store.ts'

/** One write of the files that is under way: which file it writes, once its first row has named it, and what is noted of it. */
export interface Frame {
  steps: boolean
  // The write has reached the disk when it answers.
  toDisk?: boolean
  // The file whose write is open: the empty text for the shared file. Nothing until the write is opened.
  key?: string
  file?: FileName
  // The store whose write is open, with nothing around it, and that write.
  store?: Store
  open?: OpenWrite
  // The write as whoever writes is handed it.
  tx?: Tx
  noted: WriteNotes
  // The error of a second file: it undoes the write, whatever the code did with it.
  failed?: unknown
  // The number that the write took, its change where the changes are kept, and its record for a sink that records.
  n?: number
  change?: Change
  record?: Bytes
}

/** What counts the writes of the files of an app, and hands each on: `connected` puts it in place. */
interface Counting {
  // The tables that are a machine's own: a write to them takes no number.
  own: Set<string>
  // The row that a removal takes away is read first, for a sink.
  readsRemoved: boolean
  // A change notes what its row held before and which columns it set, for a sink that records, which an undo reads.
  readsBefore?: boolean
  // The vector columns of each table, where a sink is handed the vector of each with its row.
  vectors?: Map<string, string[]>
  /** The last act of a write that is about to be committed: its number, and its record where the changes are kept. */
  ending(frame: Frame): void
  /** A write was committed. */
  committed(frame: Frame): void
  /** A write was undone. */
  undone(frame: Frame): void
  /** The file of a tenant was opened, or made. */
  opened(file: FileName, store: Store): void
  /** The shared file was opened again, as after a restore. */
  reopened(): void
  /** The shared file is closed. */
  stopped(): void
  /** The changes are kept from now on. */
  keep(): void
  /** The number of the last write of the app that is known here. */
  last(): number
  /** A change that a file thread made is handed on, after the main thread kept it or did not. */
  handOn(change: Change): void
}

/** What the files of an app give the other files of this part, and no part beside it. */
export interface Inside {
  // The shared file, with nothing around it.
  shared: Store
  // The writes that are under way: one at a time, but for a write of another file that the opening of that file runs.
  frames: Frame[]
  counting?: Counting
  // The writes are recorded: the store of each file is told when it is opened.
  keeping: boolean
  // The changes are kept for the readers of the app, and `_t_here` says so: not for a sink that records alone.
  told?: true
  /** The running layout of the app. */
  layouts(): TableLayout[]
  /** The tables of tenants. */
  tenants(): string[]
  /** The store of one tenant's file with nothing around it, opened where it is closed, and made with `make`. */
  plain(file: FileName, o?: { make?: boolean }): Store | undefined
  /** Whether the file of a tenant holds a table: a table is made with its first row. */
  holds(file: FileName, table: string): boolean
  /** The steps that a write of a table of a file is held to, by the holds that count and by a check that stands. */
  heldTo(file: FileName, table: string): Hold['step'][]
  /**
   * Reads one tenant's file alone: through its store where it is open, and otherwise through a store of its own
   * that is told to write nothing and is closed again, which leaves no file beside it.
   */
  alone<T>(file: FileName, read: (store: Store) => T): T
  /**
   * Runs a raw text of one tenant against a store that holds every table of the layout of its file. The tables
   * that the file lacks are made first: in the write of that file where one is under way, and otherwise in a
   * write of its own, in place of which a reader throws `NotReady`. For a tenant with no file the store is an
   * empty one in memory, and nothing is made on the disk. With `asItIs` no table is made: the text meets the
   * file as it stands. With `empty` it meets an empty file in memory of that layout whatever stands on the disk,
   * which tells of a text whether it writes and writes nothing.
   */
  raw<T>(file: FileName, run: (store: Store) => T, how?: 'asItIs' | 'empty'): T
  /** Makes the store's own snapshot of one tenant's file, as `alone` reads one. Answers what `snapshot` answers. */
  snapshot(file: FileName, toFile: string): Promise<{ n: number }>
  /** Runs something once no write is under way: at once where none is. */
  later(run: () => void): void
  /** Tells every file that is open to record its writes. */
  keepOpen(): void
}

const insides = new WeakMap<Files, Inside>()

/** Keeps what the files of an app give this part. */
export function keepInside(files: Files, inside: Inside): void {
  insides.set(files, inside)
}

/** Answers what the files of an app give this part. Throws T0013 for files that `openFiles` did not open. */
export function insideOf(files: Files): Inside {
  const inside = insides.get(files)
  if (!inside)
    throw new TentError('T0013', 'The files of an app are those that `openFiles` answered, and these are not.')
  return inside
}
