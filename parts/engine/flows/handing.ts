import type { FileName, Store, Tx } from '../../data/index.ts'
import { rowIds } from '../../data/index.ts'
import type { Runner } from '../../flows/index.ts'
import { closingOf } from '../../flows/index.ts'
import type { Opened } from '../opened.ts'
import { table } from '../tables/sent.ts'
import type { Tenants } from './tenants.ts'

const system = { kind: 'system' } as const
const keyOf = (file: FileName | undefined): string => (file ? `${file.table} ${file.id}` : '')

/** What hands the events of one file to the runs of the others that wait for them. */
export interface RunHanding {
  /**
   * An event was emitted in a write of one file. Where a run of another file may wait for an event of its name,
   * the event is kept in that write, and handed on once the write has ended.
   */
  emitted(tx: Tx, from: FileName | undefined, event: string, data: unknown): void
  /** Hands on what is kept in the shared file and in each open file: what a stop left between a commit and its handing on. */
  left(): Promise<void>
}

/** Takes what the engine holds of an app that keeps a data file for each tenant, its runner, and what it keeps of the closed files. */
export function handingOf(o: Opened, runner: Runner, tenants: Tenants): RunHanding {
  // The files of which an event waits to be handed on, each once.
  const waiting = new Map<string, FileName | undefined>()
  let busy: Promise<void> | undefined

  const storeOf = (file: FileName | undefined): Store | undefined => (file ? o.files?.of(file) : o.store)

  /** Whether a run of the shared file, or of a file that is open, waits for an event of that name. */
  const waitsIn = (file: FileName | undefined, event: string): boolean => {
    const store = storeOf(file)
    return store !== undefined && closingOf(store, o.clock.now()).waits.includes(event)
  }

  /** Hands one event to the waits of one file, in a write of that file. */
  const handTo = async (to: FileName | undefined, event: string, data: unknown): Promise<void> => {
    if (to) await tenants.open(to)
    storeOf(to)?.write((tx) => runner.handed(tx, { event, data, ...(to ? { file: to } : {}) }))
  }

  /** Hands on every event that one file keeps, to each other file of which a run waits for it, and removes it. */
  const handFrom = async (from: FileName | undefined): Promise<void> => {
    const store = from && !o.tenantFiles?.isOpen(from) ? undefined : storeOf(from)
    const rows: unknown = store?.read({ from: table.name, sort: [{ by: 'id' }] }, system).value
    for (const row of Array.isArray(rows) ? rows : []) {
      const { id, event, data } = Object(row)
      // The shared file and each open file whose runs wait for the event, and each closed file that the directory names.
      const open = [undefined, ...(o.files?.open() ?? [])].filter(
        (one) => keyOf(one) !== keyOf(from) && waitsIn(one, String(event)),
      )
      const places = [...open, ...tenants.waitingFor(String(event))]
      for (const to of places) await handTo(to, String(event), data)
      storeOf(from)?.write((tx) => tx.remove(table.name, String(id), system))
    }
  }

  const drain = async (): Promise<void> => {
    while (waiting.size) {
      const [[key, from]] = waiting
      waiting.delete(key)
      try {
        await handFrom(from)
      } catch (error) {
        o.log.write('lines', {
          at: o.clock.now(),
          level: 'error',
          message:
            'An event could not be handed to the runs of another data file. It is kept, and handed on when the app starts.',
          data: JSON.stringify({ ...from, error: String(error) }),
        })
      }
    }
  }

  const later = (from: FileName | undefined): void => {
    waiting.set(keyOf(from), from)
    // The write that keeps the event has ended by then, committed or undone.
    setImmediate(() => {
      busy = (busy ?? Promise.resolve()).then(drain)
    })
  }

  return {
    emitted(tx, from, event, data) {
      const elsewhere = runner.waits().includes(event) || tenants.waitingFor(event).length > 0
      if (!elsewhere) return
      tx.add(
        table.name,
        { id: rowIds.next(), event, at: new Date(o.clock.now()), ...(data === undefined ? {} : { data }) },
        system,
      )
      later(from)
    },
    async left() {
      for (const from of [undefined, ...(o.files?.open() ?? [])]) waiting.set(keyOf(from), from)
      busy = (busy ?? Promise.resolve()).then(drain)
      await busy
    },
  }
}
