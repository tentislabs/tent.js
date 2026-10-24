import type { Clock } from '../../core/internal.ts'

/** One line that the work of a task wrote with `log`, as it crosses to the writer. */
export interface LogLine {
  at: number
  level: 'info' | 'warn' | 'error'
  message: string
  data?: unknown
}

/** The `log` of the work of one task on a worker: what it writes is gathered, and sent once a beat at the most. */
export interface GatheredLog {
  handle: object
  flush(): void
}

/**
 * Takes the clock of the worker, its beat, and what sends the lines of the task. Answers the `log` handle of its
 * work, whose members answer at once, as on every machine, and what sends what was gathered before the task ends.
 */
export function gatheredLog(clock: Clock, beat: () => number, sent: (lines: LogLine[]) => void): GatheredLog {
  let held: LogLine[] = []
  let cancel: (() => void) | undefined
  const flush = (): void => {
    cancel?.()
    cancel = undefined
    if (!held.length) return
    const lines = held
    held = []
    sent(lines)
  }
  const line =
    (level: LogLine['level']) =>
    (message: string, data?: unknown): void => {
      held.push({ at: clock.now(), level, message: String(message), ...(data === undefined ? {} : { data }) })
      cancel ??= clock.setTimer(clock.now() + beat(), flush)
    }
  return { handle: { info: line('info'), warn: line('warn'), error: line('error') }, flush }
}
