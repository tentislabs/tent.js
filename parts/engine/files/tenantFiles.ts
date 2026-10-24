import { TentError } from '../../core/index.ts'
import type { Connections, FileName, Store, TableLayout, TableStep, Tx, Writing } from '../../data/index.ts'
import {
  applySteps,
  beforeWalks,
  connected,
  filledBy,
  here,
  layoutFingerprint,
  NotReady,
  openFiles,
  rowIds,
  sweep,
} from '../../data/index.ts'
import { metaOf } from '../held.ts'
import type { Opened } from '../opened.ts'
import { cacheWrote } from '../pages/cache.ts'
import { forgetFed, mayRemember } from '../remember/kept.ts'
import { fillNotesOf, setFillNotes } from '../fill/fileNotes.ts'
import { countFrom, filesOutside } from './outsideFiles.ts'
import { fillTx } from '../fill/marks.ts'
import { sealed } from '../values/seal.ts'
import { noteFile, watchFile } from '../watched.ts'
import { carriedOver, heldReady, noteNotReady } from './attempt.ts'
import { needsFlows } from '../flows/needs.ts'
import { budgetOf, freeHandle } from './budget.ts'
import type { RowFields } from './directory.ts'
import { directoryTable as directory, removeRow, directoryRowIn, rowsIn, saidFields, setRow } from './directory.ts'
import type { TenantFiles } from './face.ts'
import type { Moving } from './gate.ts'
import { gated, waitsForMove } from './gate.ts'
import { refusedHandle } from './handles.ts'
import type { Said } from './held.ts'
import {
  fileLimit,
  firstMissing,
  fileKeyOf,
  liesElsewhere,
  newestKept,
  placeSaid,
  saidBy,
  setAside,
  sizeOf,
  toldCount,
} from './held.ts'
import { failedFile, raisingOf } from './raising.ts'
import { tenantWaitingDb } from './waiting.ts'

/** One write of the files that the engine began: the write of the shared file once it is open, or the tenant's file it writes. */
interface Frame {
  shared?: Tx
  file?: FileName
}

const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)

/** The tables of tenants, in a layout: each table that a `tenant` column links to. */
const tenants = (to: TableLayout[]): string[] => [
  ...new Set(
    to.flatMap((one) => {
      const type = one.tenant === undefined ? undefined : one.columns[one.tenant]
      return type?.kind === 'link' ? [type.table] : []
    }),
  ),
]

/**
 * Takes what the engine holds of an app that keeps a data file for each tenant, what makes a store, the layout
 * of the app with the tables of the engine, what is connected to the data, and whether the app is opened as a
 * reader. Opens the shared file and makes the tables of the engine that it lacks, connects the files, and answers
 * what the engine holds of them. A file is opened when it is asked for and closed when it is quiet, under one
 * budget; each stands in the directory; and one that is behind or unswept is made ready before anything reads it.
 */
export function tenantFilesOf(
  o: Opened,
  makeStore: () => Store,
  given: TableLayout[],
  connections: Connections,
  how: { reads: boolean; threads: boolean },
): TenantFiles {
  // The directory is a table of this machine alone, among the tables of the engine.
  const layout = [...given.filter((one) => one.name !== directory.name), directory]
  const stack: Frame[] = []
  const running = new Map<string, string>()
  let appLayout = layout.filter((one) => !one.name.startsWith('_t_'))
  let applyDepth = 0
  // The files that the backfills of the version walk now: nothing but their own writes reads them meanwhile.
  const walking = new Set<string>()
  const applying = <Answer>(work: () => Answer): Answer => {
    applyDepth++
    try {
      return work()
    } finally {
      applyDepth--
    }
  }
  /** Tells whoever asks for a file that a backfill walks now that it is not ready. */
  const unwalked = (file: FileName): void => {
    if (applyDepth > 0 || !walking.has(fileKeyOf(file))) return
    noteNotReady(file)
    throw new NotReady(file)
  }
  // The tables whose rows move now, and how deep the writes of the move itself are, which no table is held back from.
  let moved: Moving | undefined
  let ownDepth = 0
  let closed = false

  let refusals = 0

  const line = (level: string, message: string, data: object): void =>
    o.log.write('lines', { at: o.clock.now(), level, message, data: JSON.stringify(data) })

  /**
   * Makes a store. Where the system refuses the file handle of its opening, the file that was used longest ago
   * among the open files of every app of the program is closed, and the opening is tried again, once.
   */
  // The file that a file thread writes now at a path, once the work on single files is made.
  let threadAt: (path: string) => FileName | undefined = () => undefined
  const make = (): Store => {
    const store = makeStore()
    const open = store.open.bind(store)
    store.open = (where, how) => {
      // A file that a file thread writes now is opened to write by nothing else: an opening may write, to let go
      // of holds that count no more. Whoever asks is told that the file is not ready, and asks again once it is.
      const busy = how?.readOnly || applyDepth > 0 ? undefined : threadAt(where)
      if (busy) {
        noteNotReady(busy)
        throw new NotReady(busy)
      }
      try {
        open(where, how)
      } catch (error) {
        if (!refusedHandle(error) || !freeHandle()) throw error
        if (!refusals++)
          line('warn', 'The system refused a file handle: the data file that was used longest ago was closed.', {
            fix: 'Raise the bound of open files of the system for this program, or lower `openFiles` in `project.limits`.',
          })
        open(where, how)
      }
    }
    return store
  }

  /** What the app is among its machines, or nothing while it opens. */
  const machine = (): Opened['machine'] | undefined => {
    try {
      return o.machine
    } catch {
      return undefined
    }
  }
  /** Whether this machine is a reader: it writes no file of its own accord. While the app opens it is what it was opened as. */
  const reads = (): boolean => {
    const mine = machine()
    return mine ? mine.reader !== undefined : how.reads
  }

  // The number of the write of the last clean: a file whose own last write is older still holds what it dropped.
  const cleanedAt = (): number => Number(metaOf(files.shared, 'clean') ?? 0)

  const isBehind = (table: string, fingerprint: string | undefined, to?: TableLayout[], writes?: number): boolean => {
    if (fingerprint === undefined) return false
    if (to) return tenants(to).includes(table) && layoutFingerprint(to, table) !== fingerprint
    if (!running.has(table)) return false
    return running.get(table) !== fingerprint || (writes !== undefined && writes < cleanedAt())
  }

  const isOpen = (file: FileName): boolean => files.open().some((one) => fileKeyOf(one) === fileKeyOf(file))

  /** Whether a file is held open: a write of it is under way, or a piece of work on it. */
  const isHeld = (file: FileName): boolean =>
    raising.isBusy(file) ||
    stack.some((frame) => frame.file !== undefined && fileKeyOf(frame.file) === fileKeyOf(file)) ||
    // A file with a run that is queued or working is held open too.
    o.flows?.holds(file) === true

  const budget = budgetOf({
    description: o.description,
    clock: o.clock,
    open: () => files.open(),
    close: (file) => files.close(file),
    isHeld,
    line,
  })

  const told = (wrote: { table: string; kind: 'added' | 'changed' | 'removed'; row: { id?: unknown } }): void => {
    try {
      o.raise('row.changed', { app: o.app, table: wrote.table, id: String(wrote.row.id), kind: wrote.kind })
    } catch {
      // While the app opens nobody listens yet.
    }
  }

  /** Sweeps one file that stands open, where it stands at another count of removals than the shared file tells. */
  const sweepNow = (file: FileName): void => void sweep(files, file, o.description, { wrote: told, ...sealed(o) })

  const hooks = {
    store: make,
    before(file: FileName, store: Store): 'ready' | 'wait' {
      if (applyDepth > 0) return 'ready'
      const wait = (): 'wait' => {
        noteNotReady(file)
        return 'wait'
      }
      if (raising.isBusy(file)) return wait()
      // Before anything reads a file, it is held against its place: one that names another table or another
      // tenant is not opened. Whoever waits for it moves it aside, once the store that looked at it is closed.
      if (liesElsewhere(placeSaid(store), file)) return wait()
      const failed = directoryRowIn(files.shared, file)?.failed
      if (failed) throw failedFile(file, failed)
      const last = Number(metaOf(store, 'n') ?? 0)
      const behind = isBehind(file.table, text(metaOf(store, 'fingerprint')), undefined, last)
      const unswept = metaOf(store, 'tenant') !== undefined && metaOf(store, 'swept') !== toldCount(files.shared)
      if (!behind && !unswept) return 'ready'
      // A file is brought up on its thread, and swept outside the write that found it unswept.
      if (behind || stack.length || reads()) return wait()
      sweepNow(file)
      return 'ready'
    },
    writing: (file: FileName): void => sharedWrite((tx) => setRow(tx, file, { open: true }), true),
    opened(file: FileName): void {
      budget.touch(file)
      budget.trim(file)
      // The runs of a file that opens are the runner's from here on.
      o.flows?.fileOpened(file)
    },
  }

  const plain = openFiles(o.dataFolder, layout, hooks)
  /** The number of the last write that a file holds, read from the file alone: nothing where it is not there. */
  const writesIn = (file: FileName): number => {
    if (!plain.has(file)) return 0
    const store = make()
    store.open(plain.path(file), { readOnly: true, lazy: true })
    try {
      return Number(metaOf(store, 'n') ?? 0)
    } finally {
      store.close()
    }
  }
  /** Makes the tables of the engine that the shared file lacks: the directory is among them. */
  const made = (): void => {
    const there = new Set(plain.shared.layout().map((one) => one.name))
    const lacking = layout.filter((one) => one.name.startsWith('_t_') && !there.has(one.name))
    if (!lacking.length) return
    const steps: TableStep[] = lacking.map((one) => ({ do: 'addTable', table: one.name, layout: one }))
    plain.shared.write((tx) => applySteps(tx, plain.shared, steps), { steps: true })
  }
  // They are made first, before the files are connected: a reader holds them as its writer made them.
  if (!how.reads) made()
  const listed = plain.shared.layout().some((one) => one.name === directory.name)
  // The files that are marked open are read before the first write: what the directory says of them is not trusted.
  const rows = listed ? rowsIn(plain.shared) : []
  // An id is made above every id that a file of the directory holds, whatever the clock says.
  for (const row of rows) if (row.lastId !== undefined) rowIds.above(row.lastId)
  const above = Math.max(0, ...rows.filter((row) => !row.open).map((row) => row.writes))
  // A file that a stop left marked open may hold writes past what its row says: its own number is read, so the
  // sinks are told where the data stands, and an archive that missed those writes finds them as a gap.
  const markedOpen = Math.max(0, ...rows.filter((row) => row.open).map((row) => writesIn(row.file)))
  const files = connected(plain, layout, { ...connections, above, markedOpen })
  const [innerOf, innerWrite, innerClose, innerRemove] = [files.of, files.write, files.close, files.remove]

  function sharedWrite(work: (tx: Tx) => void, toDisk = false): void {
    const under = stack.findLast((frame) => frame.shared !== undefined)
    if (under?.shared) work(under.shared)
    else files.shared.write((tx) => work(tx), toDisk ? { toDisk: true } : {})
  }

  /** What follows a write of the shared file that removed a row which a file may link to: every open file is swept at once. */
  let lastTold = toldCount(files.shared)
  const settled = (frame: Frame): void => {
    if (!frame.shared || reads()) return
    const now = toldCount(files.shared)
    if (now === lastTold) return
    lastTold = now
    for (const file of files.open())
      try {
        sweepNow(file)
      } catch (error) {
        line('error', 'An open data file could not be swept after a removal.', { ...file, error: String(error) })
      }
  }
  files.of = (file, how) => {
    unwalked(file)
    const store = innerOf(file, how)
    // A live group follows each table that its run read in a file, and the file of a tenant that has none yet.
    if (store) watchFile(countFrom(store), file)
    else noteFile(file)
    if (store) budget.touch(file)
    return store
  }
  files.write = <T>(fn: (w: Writing) => T, how?: { steps?: boolean }) => {
    const frame: Frame = {}
    stack.push(frame)
    let answer: ReturnType<typeof innerWrite<T>>
    try {
      answer = innerWrite((w) => {
        const mine: Writing = {
          files,
          tx(file) {
            if (file) unwalked(file)
            const tx = w.tx(file)
            if (file) {
              frame.file = file
              budget.touch(file)
              filesOutside(o, innerOf(file))
            } else frame.shared = tx
            // While rows move, a write of a table that moves waits for the move: its own writes pass. Each marks the
            // values of the columns that work fills.
            return fillTx(o, moved && !ownDepth && !applyDepth ? gated(tx, moved) : tx)
          },
        }
        return fn(mine)
      }, how)
    } finally {
      stack.pop()
    }
    if (!stack.length) settled(frame)
    // The hub is told a write of a tenant's file by its file: the store of such a file is watched by nothing.
    const { file } = answer
    if (file) {
      const touched = answer.touched.length
        ? answer.touched.map((one) => ({ ...one, file }))
        : [{ table: '', ids: [], file }]
      o.hub?.wrote(touched, false)
      cacheWrote(o, touched, false)
    }
    // The remembered answers that rows of this file fed go in a write of the shared file right after this commit.
    if (file && answer.touched.length && mayRemember(o)) forgetFed(o, answer.touched)
    return answer
  }
  files.close = (file) => {
    const store = isOpen(file) ? innerOf(file) : undefined
    const said = store ? saidBy(store) : undefined
    // What the runner says of the runs of the file is kept in its row; one that closes before the runner runs is read by it later.
    const runs = store ? o.flows?.fileClosing(file) : undefined
    // When a value of the file that work fills is due, the counts of its values, and what they rest on.
    const fillNotes = store ? fillNotesOf(o, store) : undefined
    if (store && !o.flows && needsFlows(o.description)) o.unreadFiles = [...(o.unreadFiles ?? []), file]
    innerClose(file)
    budget.forget(file)
    if (!said) return
    const fields: RowFields = {
      ...saidFields(said),
      size: sizeOf(files.path(file)),
      closedAt: o.clock.now(),
      open: false,
      ...(runs ? { dueAt: runs.dueAt ?? null, versions: runs.versions, waits: runs.waits } : {}),
    }
    sharedWrite((tx) => {
      setRow(tx, file, fields)
      setFillNotes(tx, file, fillNotes)
    })
  }
  files.remove = (file) => {
    innerRemove(file)
    budget.forget(file)
    sharedWrite((tx) => removeRow(tx, file))
  }

  const peek = (file: FileName): Said | undefined => {
    if (isOpen(file)) {
      const open = innerOf(file)
      return open ? saidBy(open) : undefined
    }
    if (!files.has(file)) return undefined
    const store = make()
    store.open(files.path(file), { readOnly: true, lazy: true })
    try {
      return saidBy(store)
    } finally {
      store.close()
    }
  }

  const epoch = (): string => {
    const [number, writer] = [metaOf(files.shared, 'epoch'), metaOf(files.shared, 'writer')]
    return `${typeof number === 'number' ? number : 1}.${text(writer) ?? here(files.shared).id}`
  }
  const keeping = (): boolean => here(files.shared).kept === true

  const raising = raisingOf({
    files,
    make,
    threads: how.threads,
    atOnce: fileLimit(o.description, 'filesAtOnce'),
    now: () => o.clock.now(),
    layout: () => appLayout,
    isBehind,
    cleanedAt,
    isOpen,
    peek,
    sharedWrite,
    keeping,
    epoch,
    line,
    closed: () => closed,
    open: (file) => void innerOf(file),
    walks(file) {
      if (reads()) return undefined
      const layout = beforeWalks(appLayout, file.table, filledBy(o.description))
      if (!layout) return undefined
      const walk = async (): Promise<void> => {
        walking.add(fileKeyOf(file))
        try {
          await (await import('../backfilled.ts')).walkTenant(o, file, applying)
        } finally {
          walking.delete(fileKeyOf(file))
        }
      }
      return { layout, walk }
    },
    async walkKept(file) {
      if (reads()) return
      walking.add(fileKeyOf(file))
      try {
        await (await import('../keptWalk.ts')).walkKept(o, file, applying)
      } finally {
        walking.delete(fileKeyOf(file))
      }
    },
  })
  threadAt = raising.working

  /**
   * Moves a file aside that names another table or another tenant than the place it lies at, as the upkeep moves
   * it, and says so in the log: that tenant is one with no file. Answers whether it did.
   */
  const setAsideWhereElsewhere = (file: FileName): boolean => {
    if (isOpen(file) || !files.has(file)) return false
    const said = peek(file)
    if (!said || !liesElsewhere(said, file)) return false
    setAside(files.path(file))
    sharedWrite((tx) => removeRow(tx, file))
    line('error', 'A data file names another tenant than the one it stands under, and was moved aside.', {
      ...file,
      names: said.tenant,
    })
    return true
  }

  /**
   * Makes a file ready for what waits for it. A reader writes no file of its own accord: it throws the error that
   * hands the request to its writer, whose sweep and whose bringing up reach it as changes.
   */
  const awaited = async (file: FileName): Promise<void> => {
    // A write that waited for a move asks again once the move has ended.
    if (file.table === waitsForMove.table) return moved?.done
    if (reads()) machine()?.writes('a data file that is fetched, unswept or behind')
    if (setAsideWhereElsewhere(file)) return
    await raising.waitedFor(file)
  }

  const fingerprinted = (): void => {
    running.clear()
    for (const one of tenants(appLayout)) running.set(one, layoutFingerprint(appLayout, one))
  }
  fingerprinted()

  const closeFiles = (): void => {
    for (const file of files.open()) files.close(file)
  }

  return {
    files,
    fingerprints: () => Object.fromEntries(running),
    follow(to) {
      appLayout = to.filter((one) => !one.name.startsWith('_t_'))
      files.layout(appLayout)
      fingerprinted()
    },
    isBehind,
    cleanedAt,
    carried: (ends, work) =>
      carriedOver(
        awaited,
        ends,
        (file) =>
          new TentError('T0008', `A call waited for the data file of ${file.table} ${file.id} past its time.`, {
            fix: 'Ask again: the file is being brought up. `tent data files --behind` shows where the files stand.',
          }),
        work,
      ),
    heldReady,
    waiting: (db) => tenantWaitingDb(db, awaited),
    ready: awaited,
    raise: (file, as) => raising.ready(file, { ...as, unswept: true }),
    bringUp: raising.bringUp,
    checked: raising.checked,
    unheld: raising.unheld,
    queued: raising.queued,
    handOver: raising.handOver,
    applied: raising.applied,
    isBusy: raising.isBusy,
    idle: raising.idle,
    sharedWrite,
    peek,
    isOpen,
    moving(tables, done) {
      moved = tables ? { tables, done: done ?? Promise.resolve(), again: false, settled: false } : undefined
    },
    settle() {
      if (!moved) return false
      const { again } = moved
      moved.again = false
      moved.settled = true
      return again
    },
    own(work) {
      ownDepth++
      try {
        return work()
      } finally {
        ownDepth--
      }
    },
    applying,
    number: () =>
      Math.max(
        Number(metaOf(files.shared, 'n') ?? 0),
        newestKept(files.shared)?.n ?? 0,
        here(files.shared).keptFrom?.n ?? 0,
        ...rowsIn(files.shared).map((row) => row.writes),
        ...files.open().map((file) => Number(metaOf(innerOf(file) ?? files.shared, 'n') ?? 0)),
      ),
    lost: () => (keeping() ? firstMissing(files.shared) : undefined),
    place() {
      const mine = here(files.shared)
      return newestKept(files.shared) ?? mine.keptFrom ?? { n: Number(metaOf(files.shared, 'n') ?? 0), sum: mine.sum }
    },
    epoch,
    keeping,
    store: make,
    line,
    heldToBound: () => budget.heldToBound(),
    made,
    closeFiles,
    async close() {
      closed = true
      budget.close()
      await raising.close()
      closeFiles()
    },
  }
}
