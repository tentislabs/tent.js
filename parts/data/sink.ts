import type { Cancel, Clock } from '../core/internal.ts'
import type { Wrote } from './context.ts'
import type { FileName } from './fileName.ts'
import type { By, Bytes, Row, TableLayout, TableStep } from './store.ts'

/**
 * One committed write as a sink is handed it: its number, the time of its commit, and what it wrote. A row holds
 * the vector of each of its vector columns, as a `Float32Array`. A write of one tenant's file holds that file,
 * and the write that removes tenants holds the file of each that is gone: a sink removes the rows of those
 * tenants of the tenant tables. A sink that states `records` is handed more: the store's own record of the
 * write, which a store of the first moment applies to hold what the data holds; by whom the write was made; the
 * tables of its raw texts, or `all` where they are not known; `fetch` for a tenant's file that was taken whole and
 * that no record holds; and with each changed row what it held before.
 */
export interface SinkChange {
  n: number
  at: number
  rows?: Wrote[]
  raw?: { text: string; values: unknown[] }[]
  layout?: TableStep[]
  file?: FileName
  gone?: FileName[]
  record?: Bytes
  by?: By
  tables?: string[]
  all?: true
  fetch?: true
}

/**
 * All that the data of an app holds, a table at a time: a table of a tenant's file with that file. A row holds
 * the vector of each of its vector columns as a sink was handed it, as a `Float32Array`.
 */
export interface Whole {
  n: number
  layout: TableLayout[]
  tables: AsyncIterable<{ table: string; rows: Row[]; file?: FileName }>
}

/**
 * A continuous copy: it is handed every committed write of the app's tables, in order, with a number that grows by
 * one. `start` is told the number the data stands at and answers the number the sink holds, with `all: true` where
 * it asks for the engine's own tables too. `held`, `source` and `renew` are for a copy that is the place of
 * record. `records`: the store records each write for this sink, which is handed the record, as the archive of the
 * engine is; the data keeps nothing of it.
 */
export interface ChangeSink {
  held?: true
  records?: true
  source?: () => Promise<Whole>
  renew?: (whole: Whole) => Promise<void>
  start(n: number): number | { n: number; all: true } | Promise<number | { n: number; all: true }>
  wrote(change: SinkChange): void | Promise<void>
}

const ofTheApp = (table: string): boolean => !table.startsWith('_t_')

/** A change as a sink that does not record is handed it: with no record, and nothing that comes with one. */
function plainOf(change: SinkChange): SinkChange {
  const { record: _record, by: _by, tables: _tables, all: _all, fetch: _fetch, ...plain } = change
  return plain
}

/** The bytes of what waits, as JSON: a raw SQL write may hand a large whole number as a value, which JSON has no form of. */
export const waitingSize = (value: unknown): number =>
  JSON.stringify(value, (_, one) => (typeof one === 'bigint' ? String(one) : one)).length

/**
 * The bytes a change that waits for a sink holds: the rest as JSON, or, where it holds a record, twice the record,
 * which holds the bytes of its rows as well.
 */
function sizeOf(change: SinkChange): number {
  const { record } = change
  return record ? record.length * 2 : waitingSize(change)
}

/** What a sink that records is handed of a change beside its rows: the record, by whom, and its tables. */
function recordOf(change: SinkChange): Partial<SinkChange> {
  const { record, by, tables, all, fetch } = change
  return {
    ...(record ? { record } : {}),
    ...(by ? { by } : {}),
    ...(tables ? { tables } : {}),
    ...(all ? { all } : {}),
    ...(fetch ? { fetch } : {}),
  }
}

/** A change as a sink that did not ask for the engine's own tables is handed it: a write that touched those alone has no rows. */
function forTheApp(change: SinkChange): SinkChange {
  const rows = change.rows?.filter((one) => ofTheApp(one.table))
  const layout = change.layout?.filter((one) => ofTheApp(one.table))
  return {
    n: change.n,
    at: change.at,
    ...(rows?.length ? { rows } : {}),
    ...(change.raw ? { raw: change.raw } : {}),
    ...(layout?.length ? { layout } : {}),
    ...(change.file ? { file: change.file } : {}),
    ...(change.gone ? { gone: change.gone } : {}),
  }
}

/** What hands a sink its changes. */
export interface Handing {
  /** Tells the sink the number the data stands at, and lets go of what waited for it. */
  start(n: number): void
  /** Hands the sink one more change, after those that wait. */
  push(change: SinkChange): void
  /** Lets go of what waits, and of every timer. */
  stop(): void
}

/**
 * Takes a sink, the most bytes that may wait for it, the wait after a failure, and the clock. Answers what hands
 * the sink its changes, one at a time and in order. A change that the sink fails on is handed again after the
 * wait, and then after six times that, each time. Past the bound of what waits, the sink is closed and what waited
 * is let go: it is told the number the data stands at before it is handed a write again. `noted` is told where the
 * sink answers another number at `start` than the data stands at, and where it is closed, each with the number the
 * data stands at. A sink that states `held` and `renew` and holds another number is handed `whole` first.
 */
export function handing(
  sink: ChangeSink,
  o: {
    kept: number
    wait: number
    clock: Clock
    noted?: (what: { sink: 'differs' | 'closed'; n: number }) => void
    // All that the data holds, for a sink that is the place of record and holds another number than the data.
    whole?: () => Whole
  },
): Handing {
  let state: 'starting' | 'open' | 'closed' = 'closed'
  let all = false
  let waiting: { change: SinkChange; size: number }[] = []
  let size = 0
  let busy = false
  let tries = 0
  let resting: Cancel | undefined
  // Counted up at each start and each close: what an earlier one still has under way is let go when it answers.
  let turn = 0

  const later = (run: () => void) => {
    tries++
    resting = o.clock.setTimer(o.clock.now() + (tries === 1 ? o.wait : o.wait * 6), () => {
      resting = undefined
      run()
    })
  }
  const letGo = () => {
    turn++
    resting?.()
    resting = undefined
    waiting = []
    size = 0
    busy = false
    tries = 0
  }
  const pump = () => {
    if (busy || resting || state !== 'open' || !waiting.length) return
    busy = true
    const mine = turn
    const [first] = waiting
    Promise.resolve()
      .then(() => {
        const change = sink.records ? first.change : plainOf(first.change)
        // A sink that records is handed the record of each write, whichever tables it asked for.
        return sink.wrote(all ? change : { ...forTheApp(change), ...recordOf(change) })
      })
      .then(
        () => {
          if (mine !== turn) return
          waiting.shift()
          size -= first.size
          tries = 0
          busy = false
          pump()
        },
        () => {
          if (mine !== turn) return
          busy = false
          later(pump)
        },
      )
  }
  const begin = (n: number) => {
    letGo()
    state = 'starting'
    const mine = turn
    const ask = () => {
      Promise.resolve()
        .then(() => sink.start(n))
        .then(
          async (answer) => {
            if (mine !== turn) return
            const differs = (typeof answer === 'object' ? answer.n : answer) !== n
            if (differs) o.noted?.({ sink: 'differs', n })
            all = typeof answer === 'object' && answer.all === true
            // A place of record that holds another number is handed everything anew before it takes a write: the
            // data decides, since every answer was given from it.
            if (differs && sink.held === true && sink.renew && o.whole)
              try {
                await sink.renew(o.whole())
              } catch {
                // A sink that fails to take everything is asked again from its start, after the wait.
                if (mine === turn) later(ask)
                return
              }
            if (mine !== turn) return
            state = 'open'
            tries = 0
            pump()
          },
          () => {
            if (mine === turn) later(ask)
          },
        )
    }
    ask()
  }

  return {
    start: begin,
    push(change) {
      // A sink that was closed is told where the data stands, this write with it, and is handed the writes after it.
      if (state === 'closed') {
        begin(change.n)
        return
      }
      // A change that the sink takes at once waits for nothing: what it holds is counted only where others wait.
      const bytes = waiting.length || busy || resting ? sizeOf(change) : 0
      waiting.push({ change, size: bytes })
      size += bytes
      if (size > o.kept) {
        letGo()
        state = 'closed'
        o.noted?.({ sink: 'closed', n: change.n })
      } else pump()
    },
    stop() {
      letGo()
      state = 'closed'
    },
  }
}
