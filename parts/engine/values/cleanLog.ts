import type { Log } from '../log/file.ts'
import { scrubbed } from './scrub.ts'

/**
 * Takes the log of an app, and what answers every form in which a value that the engine holds may be written.
 * Answers a log that keeps no secret: in each text of each row that is written, every such form is replaced by
 * `[secret]` before the row is kept. So no log line, no message of an error and no trace holds one.
 */
export function cleanLog(log: Log, forms: () => string[]): Log {
  type Row = Parameters<Log['write']>[1]
  const cleaned = (row: Row, held: string[]): Row => {
    const clean: Row = {}
    for (const [name, value] of Object.entries(row))
      clean[name] = typeof value === 'string' ? scrubbed(value, held) : value
    return clean
  }
  return {
    write(table, row) {
      const held = forms()
      log.write(table, held.length ? cleaned(row, held) : row)
    },
    writeAll(table, rows) {
      // A span holds names, counts, sizes, times and codes alone, never a value: it is kept as it is, and asks no
      // secret of the disk for a request that writes nothing else.
      if (table === 'spans') return log.writeAll(table, rows)
      const held = forms()
      log.writeAll(table, held.length ? rows.map((row) => cleaned(row, held)) : rows)
    },
    rows: (table, o) => log.rows(table, o),
    withTrace: (table, trace) => log.withTrace(table, trace),
    traceOfRun: (run) => log.traceOfRun(run),
    last: (table) => log.last(table),
    dropBefore: (table, at) => log.dropBefore(table, at),
    forget: (callerId) => log.forget(callerId),
    close: () => log.close(),
  }
}
