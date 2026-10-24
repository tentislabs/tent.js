import type { Opened } from '../opened.ts'

/**
 * Answers once the newest write of an app is settled: at once on one machine, and on a writer with readers once
 * the readers that are waited for hold it. So a `work` message, and a `saved`, rest on a write that a reader which
 * takes over holds too.
 */
export async function settledNow(o: Opened): Promise<void> {
  const { writer } = o.machine
  if (!o.machine.many() || !writer) return
  await writer.held(writer.n(), false)
}
