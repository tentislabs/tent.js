import type { Description } from '../../core/internal.ts'
import type { Clock } from '../../core/internal.ts'
import type { FileName } from '../../data/index.ts'
import { handleBound } from './handles.ts'
import { fileLimit, fileKeyOf } from './held.ts'

/** What the budget of an app asks of its files, and of what the engine holds of them. */
export interface BudgetFiles {
  description: Description
  clock: Clock
  open(): FileName[]
  close(file: FileName): void
  /** Whether a file is held open: a write of it is under way, or a piece of work on it. */
  isHeld(file: FileName): boolean
  line(level: string, message: string, data: object): void
}

/** The budget of the open files of one app: a file is closed when it is quiet, and when too many are open. */
export interface Budget {
  /**
   * Holds three file handles for each of `limits.openFiles` against the bound of the system, and says in the log
   * where they pass it. It is asked once the log of the app is open.
   */
  heldToBound(): void
  /** Notes that a file was used now. */
  touch(file: FileName): void
  /** Forgets a file that was closed. */
  forget(file: FileName): void
  /** Closes the files that were used longest ago, once more are open than `limits.openFiles`, but the one that is being opened. */
  trim(opening: FileName): void
  /** Takes the timer back, and takes the app out of the budgets of the program. */
  close(): void
}

/** One file that may be closed, by when it was last used. */
interface Oldest {
  tick: number
  close(): void
}

// The bound of file handles is the program's: the open files of every app of the program count against it.
const budgets = new Set<() => Oldest | undefined>()

// A count that orders the uses of the files of every app of the program.
let ticks = 0

/**
 * Closes the file that was used longest ago among the open files of every app of this program, where one may be
 * closed, and answers whether it closed one: the system then has three file handles more to give.
 */
export function freeHandle(): boolean {
  let oldest: Oldest | undefined
  for (const of of budgets) {
    const one = of()
    if (one && (!oldest || one.tick < oldest.tick)) oldest = one
  }
  oldest?.close()
  return oldest !== undefined
}

/**
 * Takes what the budget of an app asks of its files. Answers the budget.
 */
export function budgetOf(c: BudgetFiles): Budget {
  const most = fileLimit(c.description, 'openFiles')
  const closeAfter = fileLimit(c.description, 'fileCloseAfter')
  // When each open file was last used: by the clock of the app, and by the count of the program.
  const used = new Map<string, { at: number; tick: number }>()
  let closed = false
  let warned = false
  let cancelQuiet: (() => void) | undefined

  const heldToBound = (): void => {
    const bound = handleBound()
    if (bound !== undefined && 3 * most > bound)
      c.line(
        'warn',
        'An open data file of a tenant holds three file handles, and `limits.openFiles` of them are more than the system gives this program.',
        {
          openFiles: most,
          handles: bound,
          fix: 'Raise the bound of open files of the system for this program, or lower `openFiles` in `project.limits`.',
        },
      )
  }

  const tickOf = (file: FileName): number => used.get(fileKeyOf(file))?.tick ?? 0
  const closeOne = (file: FileName): boolean => {
    try {
      c.close(file)
      return true
    } catch {
      // A file with a write under way is held open.
      return false
    }
  }

  /** Closes the files that nothing used for `fileCloseAfter`, and waits for the next one that falls quiet. */
  function quiet(): void {
    cancelQuiet = undefined
    if (closed) return
    const now = c.clock.now()
    for (const file of c.open()) {
      const last = used.get(fileKeyOf(file))?.at ?? 0
      if (now - last >= closeAfter && !c.isHeld(file)) closeOne(file)
    }
    const left = c.open().map((file) => used.get(fileKeyOf(file))?.at ?? now)
    if (left.length) cancelQuiet = c.clock.setTimer(Math.max(now + 1, Math.min(...left) + closeAfter), quiet)
  }

  /** The file of this app that was used longest ago and is not held. */
  const oldest = (): Oldest | undefined => {
    const [file] = c
      .open()
      .filter((one) => !c.isHeld(one))
      .sort((a, b) => tickOf(a) - tickOf(b))
    return file ? { tick: tickOf(file), close: () => void closeOne(file) } : undefined
  }
  budgets.add(oldest)

  return {
    heldToBound,
    touch(file) {
      used.set(fileKeyOf(file), { at: c.clock.now(), tick: ++ticks })
      if (!cancelQuiet && !closed) cancelQuiet = c.clock.setTimer(c.clock.now() + closeAfter, quiet)
    },
    forget: (file) => void used.delete(fileKeyOf(file)),
    trim(opening) {
      if (c.open().length <= most) return
      const order = c
        .open()
        .filter((file) => fileKeyOf(file) !== fileKeyOf(opening) && !c.isHeld(file))
        .sort((a, b) => tickOf(a) - tickOf(b))
      for (const file of order) {
        if (c.open().length <= most) return
        closeOne(file)
      }
      if (c.open().length > most && !warned) {
        warned = true
        c.line(
          'warn',
          'More data files of tenants are held open than `limits.openFiles` allows: the limit is too low.',
          {
            open: c.open().length,
            openFiles: most,
          },
        )
      }
    },
    close() {
      closed = true
      cancelQuiet?.()
      budgets.delete(oldest)
    },
  }
}
