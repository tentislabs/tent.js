import type { Change, FileName, Files, Misfit, Store, TableLayout, TableStep, Tx } from '../../data/index.ts'
import type { Said } from './held.ts'

/** The files of the tenants of one app, as the engine holds them: which are open, where each stands, and what makes one ready. */
export interface TenantFiles {
  readonly files: Files & { number(): number }
  /** The tables of tenants, each with the fingerprint that a file of it holds once it is brought to the running layout. */
  fingerprints(): Record<string, string>
  /** Follows another running version, as a reader does: the files are told its layout, and the fingerprints are worked out anew. */
  follow(to: TableLayout[]): void
  /**
   * Whether a fingerprint that a file of a table holds is not the running one, or with `to` not the one of that
   * layout. With `writes`, the number of the last write of the file, a file that was last written before the
   * last clean is behind too.
   */
  isBehind(table: string, fingerprint: string | undefined, to?: TableLayout[], writes?: number): boolean
  /** The number of the write of the last clean, or 0 where the app was never cleaned. */
  cleanedAt(): number
  /** Carries work out that may name a file which is not ready, until the moment `ends`: see `carriedOver`. */
  carried<Answer>(ends: number, work: () => Answer): Answer | Promise<Awaited<Answer>>
  /** Throws `NotReady` again where the pass of the call under way named a file that is not ready. */
  heldReady(): void
  /** Answers the `db` of an action as one whose promises wait for a file that is not ready. */
  waiting(db: object): object
  /**
   * Brings a file up where it is behind and sweeps it where it is unswept, outside any write, and says so in the
   * log. On a reader it throws the error that hands the request to the writer, and writes nothing.
   */
  ready(file: FileName): Promise<void>
  /**
   * Brings a file up where it is behind, and opens nothing: for the pass. `marked`: its row is marked open already.
   * `to`: the layout it is brought to, where that is not the running one. `back`: the file goes back to a layout it
   * held before.
   */
  raise(
    file: FileName,
    as?: { marked?: boolean; to?: TableLayout[]; back?: boolean; turned?: TableStep[] },
  ): Promise<void>
  /**
   * Holds one file against the steps of a check, on a file thread: where every row fits, the file is held to the
   * steps under that version. Answers what does not fit. `marked`: its row is marked open already.
   */
  checked(file: FileName, steps: TableStep[], version: string, marked?: boolean): Promise<Misfit[]>
  /** Takes the holds of a version away from one file, on a file thread. `marked`: its row is marked open already. */
  unheld(file: FileName, version: string, marked?: boolean): Promise<void>
  /** Brings one file up on a file thread, whatever it says of itself, and writes its row of the directory. */
  bringUp(file: FileName, o?: { marked?: boolean; to?: TableLayout[] }): Promise<void>
  /** Carries out a write of the directory: in the write of the shared file that is under way, or in one of its own. */
  sharedWrite(work: (tx: Tx) => void, toDisk?: boolean): void
  /** What a file says of itself, read with no hook: through its store where it is open, and else to read alone. */
  peek(file: FileName): Said | undefined
  isOpen(file: FileName): boolean
  /** Carries out work that puts the changes of a writer into the files: no file is held back from it. */
  applying<Answer>(work: () => Answer): Answer
  /**
   * Names the tables whose rows move from one way to the other now: a write of one waits until `done` is kept, and
   * is carried out again then. Handed nothing, no table is held any more.
   */
  moving(tables: Set<string> | undefined, done?: Promise<void>): void
  /**
   * Is told that the move takes its last write next: from now on a raw text that writes and states no table waits
   * as a write of a table that moves. Answers whether such a text wrote since the rows were added, or since this
   * was last asked: the rows that the move added may be old then.
   */
  settle(): boolean
  /** Carries out a write of the move itself, which no table is held back from. */
  own<Answer>(work: () => Answer): Answer
  /** Carries work on one file out once the work that is under way on it has ended, and holds every request for the file back meanwhile. */
  queued(file: FileName, work: () => Promise<void>): Promise<void>
  /** Closes a file and marks its row as open, in one write of the shared file that has reached the disk. */
  handOver(file: FileName): void
  /** Puts one change of a writer into the file it is of, on a file thread, while the file is open to nothing else: for a reader. */
  applied(file: FileName, change: Change): Promise<void>
  /** Whether work is under way on a file: its requests are held back. */
  isBusy(file: FileName): boolean
  /** Answers once no work is under way on any file. */
  idle(): Promise<void>
  /** The number of the last write of the app: the highest that its shared file, its directory and its open files hold. */
  number(): number
  /**
   * The first number that the shared file lost to a power cut, while a file kept a later one: no kept change holds
   * it. Nothing where the changes are not kept, and where no number is missing.
   */
  lost(): number | undefined
  /** The place of this machine among the machines of the app: its newest kept change, or what its shared file came with. */
  place(): { n: number; sum: string }
  /** The epoch that the app stands in, as `<number>.<writer id>`, and whether its changes are kept. */
  epoch(): string
  keeping(): boolean
  /** Makes a store as the app makes one, which is not open yet. */
  store(): Store
  /** Writes a line of the log of the app. */
  line(level: string, message: string, data: object): void
  /** Says in the log where the open files of the app may pass the bound of file handles of the program. */
  heldToBound(): void
  /** Makes the tables of the engine that the shared file lacks, as after a backup was put back. */
  made(): void
  /** Closes every file that is open, and writes its row. */
  closeFiles(): void
  /** Stops the threads and the timers, and closes every file. */
  close(): Promise<void>
}
