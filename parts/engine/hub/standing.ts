import { epochNumber } from '../held.ts'
import type { Opened } from '../opened.ts'

/** Where a machine stands among the machines of its app, as the hub asks it: no answer leaves before its write is settled. */
export interface Standing {
  /** The write that this machine holds now, with its text in the form of `Tent-At`. Nothing for an app on one machine. */
  at(): { n: number; text: string } | undefined
  /** Answers once a write is settled on this machine, and nothing where it is settled already. It is refused where the machine is closed first. */
  settled(n: number): Promise<void> | undefined
  /** Answers once this machine holds what a watch says its page has seen, and nothing where it holds it already. */
  holds(seen: unknown): Promise<void> | undefined
}

/**
 * Takes what the engine holds of an app. Answers where its machine stands, for the hub. An app on one machine
 * waits for nothing and names no write, and nothing of the link between machines is asked for it.
 */
export function standingOf(o: Opened): Standing {
  const gone = (): Error => new Error('the machine was closed')
  return {
    at() {
      const { machine } = o
      if (!machine.many()) return undefined
      const { reader, writer } = machine
      const [n, epoch] = reader ? [reader.applied(), reader.epoch()] : [writer?.n() ?? 0, writer?.epoch() ?? '']
      return { n, text: `${epochNumber(epoch)}.${n}` }
    },
    settled(n) {
      const { machine } = o
      if (!machine.many()) return undefined
      const { reader, writer } = machine
      if (reader) {
        if (reader.settled() >= n) return undefined
        // A watch cannot be handed to the writer: it waits for as long as its write is not settled here.
        const wait = async (): Promise<void> => {
          while (!(await reader.untilSettled(n, 60_000))) if (o.closed || o.machine.reader !== reader) throw gone()
        }
        return wait()
      }
      return writer && writer.settled() < n ? writer.held(n, false) : undefined
    },
    holds(seen) {
      const { reader } = o.machine
      // The writer holds every write that it ever answered: it waits for nothing.
      if (!reader || seen === undefined || seen === null) return undefined
      return reader.sees(seen)
    },
  }
}
