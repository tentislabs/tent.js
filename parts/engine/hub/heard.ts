import { epochNumber } from '../held.ts'
import type { Opened } from '../opened.ts'
import type { Connected } from './held.ts'

/** What the hub tells the connections that asked for the write their watches hold. */
export interface Heard {
  /** A connection asked, with `{ t: 'at' }`: in the mode `test` it is told from now on. */
  asked(c: Connected): void
  /** The hub took a message of these connections, or a write: those that asked are told, once the groups have run. */
  told(connections: Iterable<Connected>): void
}

/**
 * Takes what the engine holds of an app, what answers once the groups of the hub have run, and what sends a
 * connection a message. Answers what the hub calls after it took a message of a page and after a write: in the mode
 * `test`, once no group waits for its run and none is under way, each connection that asked is told `at`, the write
 * that every answer of its watches holds, with the ids of the watches whose answer it holds now. So a test in a
 * real browser knows, by the record of the page alone, that a watch which was sent the answer it held already, and
 * one that the write did not touch, has landed. In every other mode nobody is told.
 */
export function heardOf(
  o: Opened,
  idle: () => Promise<void> | undefined,
  tell: (c: Connected, text: string) => void,
): Heard {
  const asking = new WeakSet<Connected>()
  const heard: Heard = {
    asked(c) {
      if (o.mode !== 'test') return
      asking.add(c)
      heard.told([c])
    },
    told(told) {
      const connections = [...told].filter((c) => asking.has(c))
      if (!connections.length) return
      void (async () => {
        for (let busy = idle(); busy; busy = idle()) await busy
        const { n, epoch } = o.machine.at()
        const at = `${epochNumber(epoch)}.${n}`
        for (const c of connections) {
          if (c.closed) continue
          const ids = [...c.watches.values()].filter((watch) => !watch.waiting).map((watch) => watch.id)
          tell(c, JSON.stringify({ t: 'at', at, ids }))
        }
      })().catch(() => undefined)
    },
  }
  return heard
}
