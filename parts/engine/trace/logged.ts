import type { Log } from '../log/file.ts'
import type { Opened } from '../opened.ts'
import { logSentOut } from './export.ts'
import { spanNow } from './span.ts'

/**
 * Takes the log of an app and the app. Answers a log in which every row names the trace and the span it was written
 * in, where one is under way, and whose lines and errors are also sent out beside the traces where the project
 * names an address for them. What it is handed has had its secrets taken out already.
 */
export function tracedLog(log: Log, o: Opened): Log {
  return {
    write(table, row) {
      const span = table === 'spans' ? undefined : spanNow()
      // A row that is a span itself is the span under way, and names its parent.
      const own = table === 'calls' || table === 'outgoing' || table === 'modelCalls' || table === 'slow'
      const named =
        span && row.trace === undefined
          ? { ...row, trace: span.trace, span: span.id, ...(own ? { parent: span.parent ?? '' } : {}) }
          : row
      log.write(table, named)
      if (table !== 'lines' && table !== 'errors') return
      const trace = typeof named.trace === 'string' ? named.trace : undefined
      const id = typeof named.span === 'string' ? named.span : undefined
      logSentOut(o, {
        at: typeof named.at === 'number' ? named.at : o.clock.now(),
        level: table === 'errors' ? 'error' : String(named.level ?? 'info'),
        message: String(named.message ?? ''),
        ...(trace ? { trace } : {}),
        ...(id ? { span: id } : {}),
        ...(typeof named.name === 'string' ? { name: named.name } : {}),
        ...(typeof named.ref === 'string' ? { ref: named.ref } : {}),
      })
    },
    writeAll: (table, rows) => log.writeAll(table, rows),
    rows: (table, given) => log.rows(table, given),
    withTrace: (table, trace) => log.withTrace(table, trace),
    traceOfRun: (run) => log.traceOfRun(run),
    last: (table) => log.last(table),
    dropBefore: (table, at) => log.dropBefore(table, at),
    forget: (callerId) => log.forget(callerId),
    close: () => log.close(),
  }
}
