import type { Opened, Stale } from '../opened.ts'

/**
 * Tells what went stale of the public answers of an app, at once and apart from the write that made it so: the
 * event `page.stale` is raised to the program that holds the engine, and handed to each flow that listens to it,
 * which a write of its own starts with the tries of any flow.
 */
export function tellStale(o: Opened, stale: Stale): void {
  queueMicrotask(() => {
    if (o.closed) return
    o.raise('page.stale', { app: o.app, ...stale })
    const runner = o.flows?.runner
    if (!runner) return
    try {
      o.store.write((tx) => runner.fired(tx, { event: 'page.stale', data: stale }))
    } catch (error) {
      // A machine that stands back starts no run: the writer is told the same write and raises it there.
      o.log.write('lines', {
        at: o.clock.now(),
        level: 'warn',
        message: `page.stale reached no flow: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  })
}
