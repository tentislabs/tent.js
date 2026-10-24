import { TentError } from '../core/index.ts'
import type { Adding } from './adding.ts'
import type { By } from './face.ts'
import type { FlowOf } from './flowOf.ts'
import { eventOf, inputOf } from './handed.ts'
import type { Held } from './held.ts'
import type { RunRow, Source } from './rows.ts'
import { readRunRows } from './rows.ts'
import { unfinished } from './states.ts'
import type { Counted } from './together.ts'
import { isWritten } from '../core/internal.ts'

/** A key as a row keeps it: text, and a value of another kind as its JSON. Nothing for no value. */
export function keyText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  return typeof value === 'string' ? value : JSON.stringify(value)
}

const writes = ['added', 'changed', 'removed']

/**
 * The key of a run that is added: what its start says, else what the `key` of its flow answers over its input and
 * its event, as the code of the flow is handed them, and else the id of the row of a table trigger. Nothing for a
 * run that has none.
 */
export function keyOfRun(held: Held, o: Adding, flow: FlowOf, input: unknown, event: unknown): string | undefined {
  if (o.key !== undefined) return o.key
  if (flow.record.key !== undefined) {
    const arrow = held.env.arrow?.(o.version, o.flow, 'key')
    const description = held.env.description(o.version)
    return arrow && keyText(arrow({ input: inputOf(flow.record, input), event: eventOf(description, event) }))
  }
  if (isWritten(event) && writes.includes(String(event.kind)) && isWritten(event.row)) return keyText(event.row.id)
  // The thread of a conversation is what a run of an agent is about.
  return o.thread
}

/**
 * Takes where the runs are read and a start. Answers the oldest run of the flow that has not ended and is counted
 * with the start: of its key, or any where the flow has no key. Nothing where there is none.
 */
export function underWay(source: Source, start: Counted): RunRow | undefined {
  const runs = readRunRows(
    source,
    {
      all: [
        { col: 'flow', is: start.flow },
        ...(start.key === undefined ? [] : [{ col: 'key', is: start.key }]),
        { col: 'state', in: unfinished },
      ],
    },
    { sort: [{ by: 'createdAt' }] },
  )
  return runs.find((run) => run.key === start.key)
}

/**
 * Whether a start may be answered a run that is under way: where it is the system's, which reads every run, or
 * comes from the caller who started that run. Throws T7103 for any other, and answers nothing of the run.
 */
export function mayJoin(by: By, run: RunRow): void {
  const started = run.startedBy
  const same = started.kind === by.kind && started.id === by.id && by.id !== undefined
  if (by.kind === 'system' || same) return
  throw new TentError('T7103', `A run of ${run.flow} for this key is under way, and the flow joins a start to it.`, {
    fix: 'Start it again once that run has ended, or as the caller who started it.',
  })
}
