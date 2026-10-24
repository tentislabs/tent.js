import type { FileName } from '../../data/index.ts'
import type { Closing, Runner, Told } from '../../flows/index.ts'
import { rowsIn } from '../files/directory.ts'
import { fileOfRun } from './fileOf.ts'
import type { Opened } from '../opened.ts'

const keyOf = (file: FileName): string => `${file.table} ${file.id}`

/** What the engine keeps of the runs in the files of tenants: of each closed file what the runner said, and which open file holds work. */
export interface Tenants {
  /** A file was opened: its runs are the runner's from here on. */
  opened(file: FileName): void
  /** A file is about to close: what its row of the directory keeps of its runs. */
  closing(file: FileName): Closing
  /** Whether a run of an open file works now: such a file is held open. */
  holds(file: FileName): boolean
  /** Is told what the runner tells of a run. */
  told(what: Told): void
  /** The versions that the unfinished runs of the closed files are pinned to. */
  versions(): string[]
  /** The earliest moment at which a run of a closed file must wake, by the directory. */
  dueAt(): number | undefined
  /** The closed files of which a run waits for an event of that name. */
  waitingFor(event: string): FileName[]
  /** The closed files that hold a run which has not ended. */
  withRuns(): FileName[]
  /** Opens a file where it is closed, brought up first where it is behind, so that the runner reads its runs. */
  open(file: FileName): Promise<void>
  /** Reads the directory anew, and opens each file whose row is marked open or that closed before the runner ran. */
  start(): Promise<void>
  close(): void
}

/**
 * Takes what the engine holds of an app that keeps a data file for each tenant, and its runner. Keeps one timer
 * over the directory, at the earliest moment a run of a closed file must wake: the file is opened then, and the
 * runner finds what is due in it.
 */
export function tenantsOf(o: Opened, runner: Runner): Tenants {
  const closed = new Map<string, { file: FileName } & Closing>()
  const working = new Map<string, Set<string>>()
  let cancel: (() => void) | undefined
  let armedAt: number | undefined
  let over = false

  const isOpen = (file: FileName): boolean => o.tenantFiles?.isOpen(file) === true

  /** Sets the one timer anew, at the earliest moment a closed file is due. */
  const rearm = (): void => {
    if (over) return
    let at: number | undefined
    for (const one of closed.values())
      if (one.dueAt !== undefined && (at === undefined || one.dueAt < at)) at = one.dueAt
    if (at === armedAt && cancel) return
    cancel?.()
    cancel = undefined
    armedAt = at
    if (at !== undefined) cancel = o.clock.setTimer(at, wake)
  }

  const open = async (file: FileName): Promise<void> => {
    if (over || isOpen(file) || !o.files?.has(file)) return
    try {
      // A file that is behind is brought up first: the runner reads it at the running layout.
      await o.tenantFiles?.ready(file)
      o.files?.of(file)
      // The runner reads a file that was opened once the work that opened it has ended: it has, after this.
      await new Promise<void>((next) => setImmediate(next))
    } catch (error) {
      o.log.write('lines', {
        at: o.clock.now(),
        level: 'error',
        message: 'A data file of a tenant could not be opened for its runs.',
        data: JSON.stringify({ ...file, error: String(error) }),
      })
      // A file that cannot be opened is asked for no more until it closes anew.
      closed.delete(keyOf(file))
    }
  }

  /** The timer fired: each closed file that is due is opened, one after the other. */
  function wake(): void {
    cancel = undefined
    armedAt = undefined
    const now = o.clock.now()
    const due = [...closed.values()].filter((one) => one.dueAt !== undefined && one.dueAt <= now)
    void (async () => {
      for (const one of due) await open(one.file)
      rearm()
    })()
  }

  return {
    opened(file) {
      closed.delete(keyOf(file))
      runner.opened(file)
      rearm()
    },
    closing(file) {
      const said = runner.closing(file)
      working.delete(keyOf(file))
      if (said.dueAt !== undefined || said.versions.length || said.waits.length)
        closed.set(keyOf(file), { file, ...said })
      else closed.delete(keyOf(file))
      rearm()
      return said
    },
    holds: (file) => (working.get(keyOf(file))?.size ?? 0) > 0,
    told(what) {
      if (what.kind !== 'run') return
      const file = fileOfRun(what.run)
      if (!file) return
      const key = keyOf(file)
      const runs = working.get(key) ?? new Set<string>()
      if (what.state === 'running' || what.state === 'queued') runs.add(what.run)
      else runs.delete(what.run)
      if (runs.size) working.set(key, runs)
      else working.delete(key)
    },
    versions: () => [...new Set([...closed.values()].flatMap((one) => one.versions))].sort(),
    waitingFor: (event) => [...closed.values()].filter((one) => one.waits.includes(event)).map((one) => one.file),
    withRuns: () => [...closed.values()].filter((one) => one.versions.length > 0).map((one) => one.file),
    open,
    async start() {
      over = false
      closed.clear()
      const rows = rowsIn(o.store)
      const unread = o.unreadFiles ?? []
      delete o.unreadFiles
      for (const row of rows) {
        if (isOpen(row.file)) continue
        const said = { versions: row.versions ?? [], waits: row.waits ?? [] }
        if (row.dueAt !== undefined || said.versions.length || said.waits.length)
          closed.set(keyOf(row.file), {
            file: row.file,
            ...said,
            ...(row.dueAt === undefined ? {} : { dueAt: row.dueAt }),
          })
      }
      // After a stop the directory is not to be trusted for the files that were open: each is opened, and read.
      const marked = rows.filter((row) => row.open).map((row) => row.file)
      for (const file of [...marked, ...unread]) await open(file)
      rearm()
    },
    dueAt() {
      let at: number | undefined
      for (const one of closed.values())
        if (one.dueAt !== undefined && (at === undefined || one.dueAt < at)) at = one.dueAt
      return at
    },
    close() {
      over = true
      cancel?.()
      cancel = undefined
      armedAt = undefined
    },
  }
}
