import { resolve } from 'node:path'
import { TentError } from '../../core/index.ts'
import type { Change, FileName, Files, Misfit, Store, TableLayout, TableStep, Tx } from '../../data/index.ts'
import { applyChange, bringUp as broughtUp, checkAndHold, dropHolds } from '../../data/index.ts'
import type { Failed, RowFields } from './directory.ts'
import { directoryRowIn, saidFields, setRow } from './directory.ts'
import type { Said } from './held.ts'
import type { RaiseJob } from './job.ts'
import { fileKeyOf, sizeOf, sumAt } from './held.ts'
import type { FileThreads } from './threads.ts'
import { fileThreads } from './threads.ts'

/** The error of a request for a file that could not be brought up. */
export const failedFile = (file: FileName, failed: Failed): TentError =>
  new TentError(
    'T0009',
    `The data file of ${file.table} ${file.id} could not be brought up, and answers nothing: ${failed.message}`,
    { fix: `Mend what it names, and try the file again: \`tent data files --retry ${file.id}\`.` },
  )

/** What the work on single files asks of what the engine holds of the files of an app. */
export interface Raised {
  files: Files & { number(): number }
  make(): Store
  // The store is the one that ships, which a file thread can open by itself.
  threads: boolean
  // How many file threads there are at the most.
  atOnce: number
  now(): number
  /** The running layout of the tables of the app. */
  layout(): TableLayout[]
  isBehind(table: string, fingerprint: string | undefined, to?: TableLayout[], writes?: number): boolean
  // The number of the write of the last clean. Left out, the app was never cleaned.
  cleanedAt?(): number
  isOpen(file: FileName): boolean
  peek(file: FileName): Said | undefined
  sharedWrite(work: (tx: Tx) => void, toDisk?: boolean): void
  keeping(): boolean
  epoch(): string
  line(level: string, message: string, data: object): void
  closed(): boolean
  /** Opens a file with no write under way, where it is swept before it answers. */
  open(file: FileName): void
  /**
   * What a file is brought to before the backfills of the running version ran in it, and the walk of them in it.
   * Nothing where none walks a table of the file, or on a reader, which is handed their rows as changes.
   */
  walks?(file: FileName): { layout: TableLayout[]; walk(): Promise<void> } | undefined
  /** Fills the kept columns that a bring-up made in a file, by the one walk of a switch. Nothing on a reader. */
  walkKept?(file: FileName): Promise<void>
}

// The steps of the switch that is gone back on, for each app whose pass turns round, by its files: a file that is
// brought to the running layout meanwhile, by a read among them, goes back by those steps turned round too.
const turns = new WeakMap<object, TableStep[]>()

/** Says that the pass of the files of an app turns round by those steps, or with nothing that it ended. */
export function turnsBack(files: object, steps: TableStep[] | undefined): void {
  if (steps) turns.set(files, steps)
  else turns.delete(files)
}

/** What a file is brought up as. `marked`: its row is marked open already. `to`: the layout, where it is not the running one. */
interface RaiseAs {
  marked?: boolean
  to?: TableLayout[]
  // The file goes back to a layout it held before: what that layout does not know is retired with no statement.
  back?: boolean
  // With `back`: the steps by which the file was brought up, which are turned round.
  turned?: TableStep[]
}

/** What the one write of a file thread does to a file, where it is not brought up to a layout as it stands. */
type Part = Pick<RaiseJob, 'check' | 'drop' | 'back' | 'turned'>

/** The work on single files of an app: one piece at a time for each file, on a file thread where the work is a write of its own. */
export interface Raising {
  /** Brings one file up on a file thread, whatever it says of itself, and writes its row of the directory. */
  bringUp(file: FileName, as?: RaiseAs): Promise<void>
  /**
   * Holds one file against the steps of a check, in one write of a file thread: where every row fits, the file is
   * held to the steps under that version. Answers what does not fit. Every request for the file waits meanwhile.
   */
  checked(file: FileName, steps: TableStep[], version: string, marked?: boolean): Promise<Misfit[]>
  /** Takes the holds of a version away from one file, in one write of a file thread. */
  unheld(file: FileName, version: string, marked?: boolean): Promise<void>
  /** Brings a file up where it is behind. With `unswept` it opens nothing; without, it opens the file, which sweeps it. */
  ready(file: FileName, as?: RaiseAs & { unswept?: boolean }): Promise<void>
  /** Makes a file ready for a call that waits for it, and says in the log which file it was and how long it took. */
  waitedFor(file: FileName): Promise<void>
  /** Carries work on one file out once the work that is under way on it has ended: every request for the file waits meanwhile. */
  queued(file: FileName, work: () => Promise<void>): Promise<void>
  /**
   * Closes a file and marks its row as open, in one write of the shared file that has reached the disk: the file is
   * handed to work that writes it, and a start after a stop reads it.
   */
  handOver(file: FileName): void
  /** Puts one change of a writer into the file it is of, on a file thread, while the file is open to nothing else. */
  applied(file: FileName, change: Change): Promise<void>
  /** Whether work is under way on a file. */
  isBusy(file: FileName): boolean
  /** The file that a file thread writes now, where it stands at that path: nothing else opens it to write meanwhile. */
  working(path: string): FileName | undefined
  /** Answers once no work is under way on any file. */
  idle(): Promise<void>
  /** Ends the file threads. */
  close(): Promise<void>
}

/** Takes what the work on single files asks of the engine. Answers that work. No thread is started before the first file needs one. */
export function raisingOf(c: Raised): Raising {
  // The work that is under way on each file, by its key.
  const jobs = new Map<string, Promise<void>>()
  // The files that a file thread writes now, each by the whole path it stands at.
  const working = new Map<string, FileName>()
  let threads: FileThreads | undefined
  const pool = (): FileThreads => {
    threads ??= fileThreads(c.atOnce)
    return threads
  }

  /** Keeps, at a number that a write took and did not use, a change that has the readers fetch the file. */
  const lostWrite = (file: FileName, n: number): void => {
    if (!c.keeping()) return
    const sum = sumAt(c.make, c.files.path(file))
    const change: Change = {
      n,
      epoch: c.epoch(),
      at: c.now(),
      sum,
      record: new Uint8Array(),
      rows: [],
      file,
      fetch: true,
    }
    applyChange(c.files, change, { only: 'kept' })
  }

  /** Writes the row of a file that a thread has written, from what the file says of itself. */
  const written = (file: FileName, path: string, raised: boolean): void => {
    const said: RowFields = { ...saidFields(c.peek(file)), size: sizeOf(path), open: false }
    // A file that was brought up is failed no more.
    const fields: RowFields = raised ? { ...said, failed: null } : said
    c.sharedWrite((tx) => setRow(tx, file, fields))
  }

  const handOver = (file: FileName): void =>
    c.sharedWrite((tx) => {
      // Closing a file writes its row as closed: the mark follows in the same write, so that no stop falls between.
      if (c.isOpen(file)) c.files.close(file)
      setRow(tx, file, { open: true })
    }, true)

  /**
   * Carries one write of one file out on a file thread, while the file is open to nothing else: the file is
   * brought up, or with `check` held against the steps of a check, or with `drop` let go of its holds. Answers
   * what a check found not to fit. The change of the write is kept at the number that the main thread handed out.
   */
  async function threaded(file: FileName, part: Part, as: RaiseAs = {}): Promise<Misfit[]> {
    // The file is open to nothing else while its thread works, and its row is marked before it is handed over.
    if (!as.marked || c.isOpen(file)) handOver(file)
    const path = c.files.path(file)
    const raises = !part.check && part.drop === undefined
    // A file that was last written before the last clean is brought up with what it holds retired dropped.
    const clean = raises && !as.to && !part.back && (c.peek(file)?.writes ?? 0) < (c.cleanedAt?.() ?? 0)
    const job: RaiseJob = {
      path,
      layout: as.to ?? c.layout(),
      keep: c.keeping(),
      epoch: c.epoch(),
      ...part,
      ...(clean ? { clean } : {}),
    }
    const writes = {
      number: () => c.files.number(),
      took(change: Change): void {
        // Where the changes began to be kept after the file was handed over, its write holds no record: the change
        // that is kept at its number has the readers fetch the file, and the sink is handed what was answered.
        const late = !job.keep && c.keeping()
        const kept: Change = late ? { ...change, sum: sumAt(c.make, path), fetch: true } : change
        applyChange(c.files, kept, { only: 'kept' })
      },
      lost: (n: number) => lostWrite(file, n),
    }
    let misfits: Misfit[] = []
    try {
      if (c.threads) {
        working.set(resolve(path), file)
        try {
          misfits = (await pool().bringUp(job, writes)) ?? []
        } finally {
          working.delete(resolve(path))
        }
      } else {
        // A store that a maker of the program made cannot cross to a thread: its file is written here.
        const store = c.make()
        store.open(path)
        try {
          const thread = { number: writes.number, keep: job.keep, epoch: job.epoch }
          const held = part.check ? checkAndHold(store, part.check.steps, part.check.version, { thread }) : undefined
          const change = held
            ? held.change
            : part.drop === undefined
              ? broughtUp(store, job.layout, {
                  thread,
                  ...(part.back ? { back: true } : {}),
                  ...(part.turned ? { turned: part.turned } : {}),
                  ...(clean ? { clean } : {}),
                })
              : dropHolds(store, part.drop, { thread })
          if (change) writes.took(change)
          misfits = held?.misfits ?? []
        } finally {
          store.close()
        }
      }
    } catch (error) {
      const failed: Failed = {
        message: error instanceof Error ? error.message : String(error),
        ...(error instanceof TentError ? { code: error.code } : {}),
      }
      if (!c.closed()) {
        // A file that could not be brought up answers nothing until it is tried again. One that a check or the
        // letting go of its holds failed on is as it was.
        c.sharedWrite((tx) => setRow(tx, file, raises ? { open: false, failed } : { open: false }))
        if (raises) c.line('error', 'A data file of a tenant could not be brought up.', { ...file, ...failed })
      }
      throw error
    }
    written(file, path, raises)
    return misfits
  }

  const bringUp = (file: FileName, as: RaiseAs = {}): Promise<void> => {
    const turned = as.back ? as.turned : as.to ? undefined : turns.get(c.files)
    const back = as.back === true || turned !== undefined
    return threaded(file, back ? { back: true, ...(turned ? { turned } : {}) } : {}, as).then(() => undefined)
  }

  /** Notes the work that is under way on a file, until it has ended and no later work took its place. */
  const under = (key: string, work: Promise<void>): Promise<void> => {
    const job = work.finally(() => {
      if (jobs.get(key) === job) jobs.delete(key)
    })
    jobs.set(key, job)
    return job
  }

  function ready(file: FileName, as: RaiseAs & { unswept?: boolean } = {}): Promise<void> {
    const key = fileKeyOf(file)
    const before = jobs.get(key)
    if (before) return before.then(() => ready(file, as))
    const job = under(
      key,
      (async () => {
        if (!c.files.has(file)) return
        const failed = directoryRowIn(c.files.shared, file)?.failed
        if (failed) throw failedFile(file, failed)
        const said = c.peek(file)
        if (!c.isBehind(file.table, said?.layout, as.to, said?.writes)) return
        // A column that a backfill fills is required in the file once the backfill ran in it, and not before.
        const walks = as.to ? undefined : c.walks?.(file)
        if (walks) {
          if (c.isBehind(file.table, said?.layout, walks.layout)) await bringUp(file, { ...as, to: walks.layout })
          await walks.walk()
        }
        await bringUp(file, walks ? { ...as, marked: false } : as)
        if (!as.to) await c.walkKept?.(file)
      })(),
    )
    return job.then(() => {
      // Opened with no write under way, the file is swept before it answers.
      if (!c.closed() && !as.unswept && c.files.has(file)) c.open(file)
    })
  }

  const queued = (file: FileName, work: () => Promise<void>): Promise<void> => {
    const key = fileKeyOf(file)
    const before = jobs.get(key)
    return under(key, before ? before.then(work, work) : work())
  }

  return {
    bringUp,
    ready,
    async waitedFor(file) {
      const began = performance.now()
      await ready(file)
      const ms = Math.round(performance.now() - began)
      c.line('info', 'A call waited for a data file of a tenant to be brought up or swept.', { ...file, ms })
    },
    queued,
    async checked(file, steps, version, marked = false) {
      let misfits: Misfit[] = []
      await queued(file, async () => {
        if (c.files.has(file)) misfits = await threaded(file, { check: { steps, version } }, { marked })
      })
      return misfits
    },
    unheld: (file, version, marked = false) =>
      queued(file, async () => {
        if (c.files.has(file)) await threaded(file, { drop: version }, { marked })
      }),
    handOver,
    async applied(file, change) {
      handOver(file)
      const path = c.files.path(file)
      if (c.threads) return pool().apply({ path, apply: change })
      const store = c.make()
      store.open(path)
      try {
        applyChange(store, change, { only: 'file' })
      } finally {
        store.close()
      }
    },
    isBusy: (file) => jobs.has(fileKeyOf(file)),
    working: (path) => working.get(resolve(path)),
    async idle() {
      while (jobs.size) await Promise.allSettled([...jobs.values()])
    },
    close: async () => threads?.close(),
  }
}
