import { callerText } from '../../data/index.ts'
import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import type { StorePlan } from '../../data/index.ts'
import type { Opened } from '../opened.ts'

import { summed } from './book.ts'
import { dayOf } from './day.ts'
import { isStored } from '../../core/internal.ts'

/** The error of a limit of use that was reached, naming the limit and the unit. */
export const reached = (what: string, limit: string, unit: string, most: number): TentError =>
  new TentError('T7102', `${what} reached its limit \`${limit}\` of ${most} ${unit}.`, {
    fields: { limit, unit },
    fix: `Call again on the next day, or raise \`limits.${limit}\` of it.`,
  })

/**
 * The filter of the rows that a model's limits count: today's, of the calls it was asked for and of those it
 * answered, and with a caller, that caller's alone.
 */
function rowsOf(o: Opened, model: string, caller?: string): StorePlan['where'] {
  const day = { col: 'day', is: dayOf(o) }
  const its = {
    any: [
      { col: 'name', is: model },
      { col: 'answeredBy', is: model },
    ],
  }
  return { all: [day, its, ...(caller === undefined ? [] : [{ col: 'caller', is: caller }])] }
}

/**
 * Takes an app and a model call that is about to be made: the model and the caller. Holds the model to its
 * `limits.perDay`, and for a model counted by caller to `perCallerPerDay`, against what was counted today, each unit
 * apart: what the model was asked for and what it answered for another. Throws T7102 at a unit that was reached.
 */
export function modelAllowed(o: Opened, asked: { model: string; caller: Caller }): void {
  const record = Object.hasOwn(o.description.models, asked.model) ? o.description.models[asked.model] : undefined
  const limits = isStored(record?.limits) ? record.limits : {}
  const held: [string, unknown, string | undefined][] = [
    ['perDay', limits.perDay, undefined],
    ['perCallerPerDay', limits.perCallerPerDay, record?.countBy === 'app' ? undefined : callerText(asked.caller)],
  ]
  for (const [limit, units, caller] of held) {
    if (!isStored(units) || (limit === 'perCallerPerDay' && caller === undefined)) continue
    const used = summed(o, rowsOf(o, asked.model, caller))
    for (const [unit, most] of Object.entries(units))
      if (typeof most === 'number' && (used[unit] ?? 0) >= most)
        throw reached(`The model ${asked.model}`, limit, unit, most)
  }
}
