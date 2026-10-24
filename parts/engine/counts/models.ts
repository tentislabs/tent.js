import { callerText } from '../../data/index.ts'
import type { Used } from '../../ai/index.ts'
import type { Caller } from '../../core/index.ts'
import { engineUnits } from '../../core/internal.ts'
import type { Opened } from '../opened.ts'

import type { Booked } from './book.ts'
import { book } from './book.ts'
import { dayOf } from './day.ts'
import { gather } from './gather.ts'
import { pastSpan } from '../trace/span.ts'
import { newRef } from '../door/failure.ts'

/** The most of the provider's own record of a call that one row of the log holds. */
const rawMost = 16_384

/** Whether a model is counted for the app as a whole, with the caller empty: one that states `countBy: 'app'`. */
function forTheApp(o: Opened, model: string): boolean {
  const record = Object.hasOwn(o.description.models, model) ? o.description.models[model] : undefined
  return record?.countBy === 'app'
}

/** The caller of a count as its column keeps one, and the user it is, or a key made for one. */
function countedAs(caller: Caller): { caller: string; user?: string } {
  const user = caller.user?.id
  return { caller: callerText(caller), ...(user ? { user } : {}) }
}

/**
 * Who a model call is counted under: its caller, and in a run that runs as the system the starter that the run holds,
 * so that a caller who calls a flow which runs as the system has the work counted under them, not under nobody.
 */
function countedFor(o: Opened, used: Used): Caller {
  if (used.caller.kind !== 'system' || !used.run) return used.caller
  const by = o.flows?.runner.read(used.run)?.startedBy
  if (by?.kind === 'user' && by.id !== undefined) return { kind: 'user', user: { id: by.id, roles: [] } }
  if (by?.kind === 'visitor') return { kind: 'nobody', ...(by.id === undefined ? {} : { visitor: by.id }) }
  return used.caller
}

/**
 * Takes an app and one try of a model call. Leaves out a unit that the provider reported under a name of the
 * engine's own, counts the try as `calls` and a failed one as `failed` too, writes each unit into `_t_counts` at
 * once, in a write of its own, since the limits of use rest on it, books it under its run, and writes one row of
 * `modelCalls` into the log, which names what the layer counted by its rule and what was left out.
 */
export function modelUsed(o: Opened, used: Used): void {
  const units: Record<string, number> = {}
  const leftOut: string[] = []
  for (const [unit, amount] of Object.entries(used.units ?? {}))
    if (engineUnits.includes(unit)) leftOut.push(unit)
    else if (Number.isFinite(amount)) units[unit] = amount
  units.calls = 1
  if (!used.ok) units.failed = 1
  // The bytes are the engine's own count of what the requests of the try sent and read, and no part of a run's use.
  const bytes = {
    ...(used.bytes?.in ? { bytesIn: used.bytes.in } : {}),
    ...(used.bytes?.out ? { bytesOut: used.bytes.out } : {}),
  }
  const day = dayOf(o)
  const whom = countedFor(o, used)
  const who = forTheApp(o, used.name) ? { caller: '' } : countedAs(whom)
  const amounts: Booked[] = Object.entries({ ...units, ...bytes }).map(([unit, amount]) => ({
    day,
    name: used.name,
    answeredBy: used.answeredBy,
    ...who,
    unit,
    amount,
  }))
  // A reader hands what its model calls used to its writer with its other counts: it writes nothing itself.
  if (o.machine.role() === 'reader')
    gather(
      o,
      used.name,
      { ...units, ...bytes },
      {
        caller: whom,
        answeredBy: used.answeredBy,
        limits: true,
        by: forTheApp(o, used.name) ? 'app' : 'caller',
      },
    )
  else o.store.write((tx) => book(o, tx, amounts))
  if (used.run && o.flows)
    o.flows.runner.used(used.run, { day: day.toISOString(), name: used.name, answeredBy: used.answeredBy, units })
  // The try is a span of the trace it was made in, with the model, what answered it, why, and the units it used.
  const span = pastSpan(
    o,
    {
      name: used.name,
      kind: 'model',
      facts: {
        model: used.name,
        answeredBy: used.answeredBy,
        reason: used.reason ?? 'asked',
        call: used.kind,
        ...units,
      },
    },
    used.ms,
    used.ok ? undefined : (used.code ?? 'T0009'),
  )
  const raw = used.raw === undefined ? undefined : JSON.stringify(used.raw)
  const counted = [
    ...(used.counted?.length ? ['rule'] : []),
    ...(leftOut.length ? [`left out ${leftOut.join(', ')}`] : []),
  ].join('; ')
  o.log.write('modelCalls', {
    at: o.clock.now(),
    name: used.name,
    answeredBy: used.answeredBy,
    reason: used.reason ?? '',
    kind: used.kind,
    run: used.run ?? '',
    caller: callerText(used.caller),
    units: JSON.stringify(units),
    counted,
    raw: raw === undefined ? '' : raw.slice(0, rawMost),
    ms: Math.round(used.ms),
    ok: used.ok,
    code: used.code ?? '',
    // The row is the span of the try.
    ...(span ? { trace: span.trace, span: span.id, parent: span.parent ?? '' } : {}),
  })
  // A try that its provider failed is an error of the model too: where the next try or model answered, the call
  // has no error, and this line is what says why the model failed.
  if (!used.ok && used.message !== undefined)
    o.log.write('errors', {
      ref: newRef(),
      at: o.clock.now(),
      name: used.answeredBy,
      message: `The model ${used.answeredBy} failed (${used.code ?? 'server'}): ${used.message}`,
      stack: '',
      ...(span ? { trace: span.trace, span: span.id } : {}),
    })
}
