import { TentError } from '../../core/index.ts'
import type { At } from '../../flows/index.ts'
import { gather } from '../counts/gather.ts'
import { modelAllowed } from '../counts/limits.ts'
import { modelUsed } from '../counts/models.ts'
import { runAllowed } from '../counts/perRun.ts'
import type { Opened } from '../opened.ts'

/** The numbers of a record that a worker sent, by name: anything else in it is left out. */
const numbersOf = (value: unknown): Record<string, number> =>
  Object.fromEntries(
    Object.entries(typeof value === 'object' && value !== null ? value : {}).filter(
      (one): one is [string, number] => typeof one[1] === 'number' && Number.isFinite(one[1]),
    ),
  )

/** The model that a `may` or a `did` names, which must be one of the version. */
function modelOf(o: Opened, message: Record<string, unknown>): string {
  const model = String(message.model)
  if (!Object.hasOwn(o.description.models, model))
    throw new TentError('T0002', `A worker names the model ${model.slice(0, 60)}, which is no model of the app.`)
  return model
}

/**
 * The `may` of a model call that the work on a worker is about to make itself. It is held here, by the writer, to
 * the limits of use of the model for the caller of the task, and to `perRun` of its run and the runs above it, so
 * that many workers do not pass them many times. Throws T7102 at a limit that was reached.
 */
export function mayModel(o: Opened, at: At, message: Record<string, unknown>): null {
  modelAllowed(o, { model: modelOf(o, message), caller: at.as })
  runAllowed(o, at.run)
  return null
}

/** The `did` of a model call that the work on a worker made: what it used is counted here, under its caller and its run. */
export function didModel(o: Opened, at: At, message: Record<string, unknown>): null {
  const model = modelOf(o, message)
  modelUsed(o, {
    name: model,
    answeredBy: typeof message.answeredBy === 'string' ? message.answeredBy : model,
    kind: String(message.call),
    caller: at.as,
    run: at.run,
    units: numbersOf(message.units),
    ms: typeof message.ms === 'number' ? message.ms : 0,
    ok: message.ok === true,
    ...(typeof message.code === 'string' ? { code: message.code } : {}),
  })
  return null
}

/** The `did` of a `fetch` that the work on a worker made itself: the row of `outgoing` is written, and it is counted. */
export function didFetch(o: Opened, at: At, message: Record<string, unknown>): null {
  const ms = typeof message.ms === 'number' ? message.ms : 0
  o.log.write('outgoing', {
    at: o.clock.now(),
    service: '',
    call: String(message.call ?? ''),
    ...(typeof message.status === 'number' ? { status: message.status } : {}),
    ms,
    run: at.run,
  })
  gather(o, 'fetch', { calls: 1, ms, ...(message.ok === true ? {} : { failed: 1 }) }, { caller: at.as })
  return null
}
