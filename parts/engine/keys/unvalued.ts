import { isWritten } from '../../core/internal.ts'

// The columns of a row of the log that may hold a value of the app, by table: an error's words and calls, a line's data.
const valued: Record<string, string[]> = { errors: ['message', 'stack'], lines: ['data'] }

/** A row of a table of the log without the columns that may hold a value. */
function rowShown(table: string, row: unknown): unknown {
  const drop = valued[table] ?? []
  return isWritten(row) ? Object.fromEntries(Object.entries(row).filter(([key]) => !drop.includes(key))) : row
}

/** A span of a trace's tree with the rows written under it, and every span under it, without their values. */
function spanShown(span: unknown): unknown {
  if (!isWritten(span)) return span
  return {
    ...span,
    ...(Array.isArray(span.rows)
      ? {
          rows: span.rows.map((one: unknown) =>
            isWritten(one) ? { ...one, row: rowShown(String(one.table), one.row) } : one,
          ),
        }
      : {}),
    ...(Array.isArray(span.under) ? { under: span.under.map(spanShown) } : {}),
  }
}

/**
 * What the log answers a key: no value that a row could hold - the words and calls of an error, the data of a
 * line - at any depth of a trace's tree, so that no `private` or `sealed` value of the app leaves through it.
 * Names, codes, counts, times and traces stay, as a span holds them.
 */
export function logShown(told: unknown): unknown {
  if (!isWritten(told)) return told
  const table = (name: string): object =>
    Array.isArray(told[name]) ? { [name]: told[name].map((row: unknown) => rowShown(name, row)) } : {}
  return {
    ...told,
    ...table('errors'),
    ...table('lines'),
    ...(Array.isArray(told.spans) ? { spans: told.spans.map(spanShown) } : {}),
  }
}

/** The code of an error, which names what failed and holds none of its words. */
const codeOf = (error: unknown): object => {
  const code: unknown = typeof error === 'object' && error !== null ? Reflect.get(error, 'code') : undefined
  return code === undefined ? {} : { code: String(code) }
}

/** One step of a run as a key is shown it: its name, state, try, time and code, and not what it was handed or answered. */
function stepShown(step: unknown): unknown {
  if (!isWritten(step)) return step
  return {
    name: step.name,
    repeat: step.repeat,
    state: step.state,
    ...(step.ms === undefined ? {} : { ms: step.ms }),
    ...(step.ask === undefined ? {} : { ask: step.ask }),
    ...(step.error ? { error: codeOf(step.error) } : {}),
  }
}

/**
 * A run as `runs show` answers a key: where it stands, its steps and its trace, and none of its values - not what
 * it was handed, the event that woke it, what it answered, nor what each step showed or answered.
 */
export function runShown(run: unknown): unknown {
  if (!isWritten(run)) return run
  const kept = ['id', 'flow', 'kind', 'version', 'state', 'startedBy', 'as', 'top', 'thread', 'parent', 'parentStep']
  return {
    ...Object.fromEntries(Object.entries(run).filter(([key]) => kept.includes(key))),
    ...(run.error ? { error: codeOf(run.error) } : {}),
    ...(Array.isArray(run.steps) ? { steps: run.steps.map(stepShown) } : {}),
    ...(run.trace ? { trace: run.trace } : {}),
  }
}
