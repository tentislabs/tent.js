import { TentError } from '../../core/index.ts'
import type { CallContext } from '../context.ts'
import type { Opened } from '../opened.ts'
import type { Undone } from './undone.ts'
import { undoneBy } from './undone.ts'

const system = { kind: 'system' } as const

/**
 * Takes an app, the trace a run stands in, and the runs that are undone. Answers what they did outside the app, by
 * the calls out of the trace that each of them made: a mail sent, a service called, a fetch, the
 * oldest first.
 */
function outsideOf(o: Opened, trace: unknown, runs: Set<string>): Undone['outside'] {
  if (typeof trace !== 'string' || trace === '') return []
  return o.log.withTrace('outgoing', trace).flatMap((row) => {
    if (typeof row.run !== 'string' || !runs.has(row.run)) return []
    const service = String(row.service ?? '')
    const call = String(row.call ?? '')
    const kind = service === 'mail' ? service : service ? 'service' : 'fetch'
    return [{ kind, name: service ? `${service}.${call}` : call, at: Number(row.at) }]
  })
}

/**
 * Takes an app, the call that undoes, the id of a run, and whether the runs it started go with it and whether it
 * is dry. Takes back every row that the run wrote, from the moment it was made, and names in `outside` what the
 * runs did outside the app, from their trace. Throws T0001 for a run that is not there, and what an undo throws.
 */
export async function undoneOfRun(
  o: Opened,
  cx: CallContext,
  run: string,
  how: { started?: boolean; dry?: boolean },
): Promise<Undone> {
  const row: unknown = o.store.read({ from: '_t_runs', one: 'get', id: run }, system).value
  const created: unknown = Reflect.get(Object(row), 'createdAt')
  if (!(created instanceof Date))
    throw new TentError('T0001', `No run ${JSON.stringify(run).slice(0, 80)} is there.`, {
      fix: 'Name a run by its id, as `tent runs` lists it.',
    })
  // The runs it started stand under it, with it as their top.
  const runs = new Set([run])
  if (how.started === true) for (const one of o.flows?.runner.find({ top: run }) ?? []) runs.add(one.id)
  const undone = await undoneBy(o, cx, {
    matches: (by) => typeof by.run === 'string' && runs.has(by.run),
    from: created.getTime(),
    dry: how.dry === true,
  })
  return { ...undone, outside: outsideOf(o, Reflect.get(Object(row), 'trace'), runs) }
}
