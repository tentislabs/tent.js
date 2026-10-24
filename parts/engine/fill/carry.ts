import { TentError } from '../../core/index.ts'
import { checkValue } from '../../core/internal.ts'
import type { Type } from '../../core/index.ts'
import { called } from '../door/call.ts'
import type { Opened } from '../opened.ts'
import type { FillGroup } from './columns.ts'

const system = { kind: 'system' } as const

/** A stored type without what only a column holds, as a value is checked against it. */
function typeOf(stored: Record<string, unknown>): Type {
  const { by: _, old: __, optional: ___, ...type } = stored
  return Object(type)
}

/**
 * Takes an app, a fill group, the row's id, what its work is handed and the fingerprint of that, and how often it
 * was tried before. Calls the work as the system through steps 5 to 10 of the door, as work that reads nothing of
 * the store and that nobody waits for. Answers the value of each column of the group: the answer, or the field of
 * it that `take` names. Throws what the work threw, and T0009 for a value that does not fit its column.
 */
export async function carryFill(
  o: Opened,
  group: FillGroup,
  rowId: string,
  handed: { input: Record<string, unknown>; read: string },
  tries: number,
): Promise<Record<string, unknown>> {
  // The run of work that states `worker` or `background` is found by this call: a pass that starts again pays for no second one.
  const call = `${group.key}\n${rowId}\n${handed.read}\n${tries}`
  // The work runs as the system, under the starter of its column, which what it uses is counted under.
  const [first] = group.columns
  const caller = first ? { ...system, starter: `fill:${first.table}.${first.column}` } : system
  // A model that states `input` and `output` is called as a function, which counts under the starter of its column.
  const answer: unknown = Object.hasOwn(o.description.models, group.work)
    ? await import('../ai/appCall.ts').then(({ appModelCall }) => appModelCall(o, group.work, handed.input, caller))
    : await called(o, group.work, handed.input, { caller, fills: { call } })
  const values: Record<string, unknown> = {}
  for (const one of group.columns) {
    const value = one.take === undefined ? answer : Reflect.get(Object(answer), one.take)
    const [misfit] = value === undefined || value === null ? [] : checkValue(typeOf(one.type), value)
    if (misfit)
      throw new TentError(
        'T0009',
        `The work ${group.work} answered a value that does not fit ${one.table}.${one.column}: ${misfit.message}`,
        {
          fix: 'Answer a value of the type of the column, or the field that `take` names.',
        },
      )
    values[one.column] = value ?? null
  }
  return values
}
