import { threadMs } from '../counts/cpu.ts'

/** The processor time of the thread of a worker, as each task at work on it is booked its share. */
export interface ThreadShares {
  begin(task: string): void
  // Answers the share of the task, in whole milliseconds, and books it nothing more.
  end(task: string): number
}

/**
 * Takes what reads the clock of the thread, in milliseconds. Answers what shares the time the thread worked among
 * the tasks at work on it: every beginning and every end first books the time since the last one, an even share
 * to each task at work. One task alone is booked the thread's own clock, read before its work and after it, and
 * the tasks of one thread never count more than it worked.
 */
export function threadShares(read: () => number = threadMs): ThreadShares {
  const shares = new Map<string, number>()
  let last = read()
  const advance = (): void => {
    const now = read()
    const spent = now - last
    last = now
    if (spent <= 0 || !shares.size) return
    for (const [task, ms] of shares) shares.set(task, ms + spent / shares.size)
  }
  return {
    begin(task) {
      advance()
      shares.set(task, 0)
    },
    end(task) {
      advance()
      const ms = shares.get(task) ?? 0
      shares.delete(task)
      return Math.round(ms)
    },
  }
}
