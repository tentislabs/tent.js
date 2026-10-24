import { AsyncLocalStorage } from 'node:async_hooks'
import type { FileName } from '../../data/index.ts'
import { NotReady } from '../../data/index.ts'

/** One pass of a call over the files of tenants: the file that it found not ready, if any. */
interface Attempt {
  notReady?: FileName
}

const attempts = new AsyncLocalStorage<Attempt>()

/** Whether an error says that a file must be made ready before the call that named it is carried out. */
export const isNotReady = (error: unknown): error is NotReady => error instanceof NotReady

/** Notes, for the pass of the call that is under way, that it named a file which is not ready. */
export function noteNotReady(file: FileName): void {
  const attempt = attempts.getStore()
  if (attempt) attempt.notReady ??= file
}

/**
 * Holds the pass of the call that is under way to files that were ready: where it named one that is not, it
 * throws `NotReady` again, whatever the code of the app did with the error. So the pass is undone, and nothing
 * of it is answered or logged.
 */
export function heldReady(): void {
  const file = attempts.getStore()?.notReady
  if (file) throw new NotReady(file)
}

/**
 * Takes what makes a file ready, the moment past which a call waits no longer, what says so, and a piece of work
 * that may name files of tenants. Carries the work out. Where it named a file that is not ready, the file is
 * made ready and the work is carried out from its start, as often as that happens within the time. Work that
 * found every file ready answers as it would alone: at once, where it answers at once.
 */
export function carriedOver<Answer>(
  ready: (file: FileName) => Promise<void>,
  ends: number,
  late: (file: FileName) => Error,
  work: () => Answer,
): Answer | Promise<Awaited<Answer>> {
  const again = async (file: FileName): Promise<Awaited<Answer>> => {
    for (let waited = file; ; ) {
      if (performance.now() > ends) throw late(waited)
      await ready(waited)
      const attempt: Attempt = {}
      try {
        const value = await attempts.run(attempt, work)
        if (!attempt.notReady) return value
        waited = attempt.notReady
      } catch (error) {
        if (!isNotReady(error) && !attempt.notReady) throw error
        waited = attempt.notReady ?? (isNotReady(error) ? error.file : waited)
      }
    }
  }
  const attempt: Attempt = {}
  let value: Answer
  try {
    value = attempts.run(attempt, work)
  } catch (error) {
    if (isNotReady(error)) return again(error.file)
    if (attempt.notReady) return again(attempt.notReady)
    throw error
  }
  return attempt.notReady ? again(attempt.notReady) : value
}
