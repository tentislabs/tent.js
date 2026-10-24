import { where } from '../core/index.ts'
import type { FileName, Tx } from '../data/index.ts'
import type { StepAt } from './face.ts'
import type { Held } from './held.ts'
import { asSaved } from './kept.ts'
import { livesIn, storesOf } from './places.ts'
import type { Source } from './rows.ts'
import { changeRun, readOf, readRun, readStep, stepOf, writeStep } from './rows.ts'
import { isFinal } from './states.ts'
import { stepsTable } from './tables.ts'
import { isWritten } from '../core/internal.ts'

const keyFor = (run: string, at: StepAt): string => `${run}\n${at.repeat}\n${at.name}`

/** Notes that a step waits for an event. */
export function noteWait(held: Held, event: string, run: string, at: StepAt): void {
  const waiting = held.events.get(event) ?? new Map<string, { run: string; at: StepAt }>()
  held.events.set(event, waiting)
  waiting.set(keyFor(run, at), { run, at })
}

/** Notes that a step waits for its event no more. */
export function noWait(held: Held, event: string, run: string, at: StepAt): void {
  const waiting = held.events.get(event)
  waiting?.delete(keyFor(run, at))
  if (waiting?.size === 0) held.events.delete(event)
}

/**
 * Reads the steps that wait for an event, as after a restart: from the shared file and each file that is open,
 * or from the one file that was just opened.
 */
export function loadWaits(held: Held, one?: { store: Source; file?: FileName }): void {
  if (!one) held.events.clear()
  for (const { store } of one ? [one] : storesOf(held.env)) {
    const rows = readOf(store, { from: stepsTable.name, where: { col: 'state', is: 'waiting' } })
    for (const row of Array.isArray(rows) ? rows : []) {
      const step = stepOf(row)
      if (step?.waitsFor?.event !== undefined) noteWait(held, step.waitsFor.event, step.run, step)
    }
  }
}

/** Notes the waits of the runs of one file no more: the file closes, and the directory keeps their names. */
export function dropWaits(held: Held, file: FileName): void {
  for (const [event, waiting] of held.events) {
    for (const [key, { run }] of waiting) if (livesIn(run, file)) waiting.delete(key)
    if (waiting.size === 0) held.events.delete(event)
  }
}

/** Whether the data of an event fits the filter of a wait: a wait with no filter takes every event of its name. */
function fits(filter: object | undefined, data: unknown): boolean {
  if (!filter) return true
  return isWritten(data) && where([data], filter).length > 0
}

/**
 * Takes a write of one file, the name of an event and its data. Each step of a run of that file that waits for
 * the event, and whose `where` the data fits, is done with the data as its result, and its run is queued, as part
 * of that write. Answers the runs that were woken. A wait in another file is not this write's to wake.
 */
export function deliver(held: Held, tx: Tx, event: string, data: unknown, file?: FileName): string[] {
  const woken: string[] = []
  for (const { run, at } of held.events.get(event)?.values() ?? []) {
    if (!livesIn(run, file)) continue
    const step = readStep(tx, run, at)
    // A step that waits no more is left to its own pass, which takes it out of what is noted.
    if (step?.state !== 'waiting' || step.waitsFor?.event !== event || !fits(step.waitsFor.where, data)) continue
    const row = readRun(tx, run)
    if (!row || isFinal(row)) continue
    const result = asSaved({ data })
    writeStep(
      tx,
      run,
      at,
      {
        state: 'done',
        result: result.value,
        size: result.size,
        ask: null,
        wakeAt: null,
        endedAt: held.env.clock.now(),
      },
      false,
    )
    changeRun(tx, run, { state: 'queued', wakeAt: null })
    woken.push(run)
  }
  return woken
}
