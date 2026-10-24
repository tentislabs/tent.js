import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import type { RunView } from '../../flows/index.ts'
import { isAgentRun } from '../ai/working.ts'
import { ruled } from '../door/rule.ts'
import { byOfCaller, startedBy } from './words.ts'
import type { Opened } from '../opened.ts'
import { flowRuled } from './allowed.ts'

/**
 * Whether a caller may follow a run: the starter of the run at the top of its calls, of a run of an agent
 * whose `access` lets them in, of a run that runs as its starter under a run they may follow, or of a run of a
 * flow whose `follow` lets them in. Throws T0001 otherwise: the caller learns nothing of it.
 */
export function mayFollow(o: Opened, run: RunView, caller: Caller): void {
  // On a reader the runs are read from its own data.
  const r = o.flows?.runner ?? o.runsRead
  const top = r?.read(run.top)
  const notFound = new TentError('T0001', `No run ${JSON.stringify(run.id).slice(0, 80)} is there.`, {
    fix: 'Follow a run that the caller started, or one under it.',
  })
  if (!r || !top || !startedBy(top.startedBy, byOfCaller(caller))) throw notFound
  const flow = Object.hasOwn(o.description.flows, run.flow) ? o.description.flows[run.flow] : undefined
  const record: Record<string, unknown> = Object(flow ?? o.description.functions[run.flow])
  // A run that runs as the system, or stands under one that does, is followed by its own `follow` alone: an
  // agent, which has none, is followed by nobody there.
  const ofSystem = (): boolean => {
    for (let at: RunView | undefined = run; at; at = at.parent ? r.read(at.parent) : undefined)
      if (at.as !== 'starter' && !isAgentRun(o, at)) return true
    return false
  }
  const agent = isAgentRun(o, run)
  const rule: unknown = agent
    ? ofSystem()
      ? undefined
      : (record.access ?? Reflect.get(Object(record.agent), 'access'))
    : record.follow
  // The rule of an agent is asked as at its start, a rule made with `allow` on the input of the run.
  const lets = (): boolean =>
    agent ? !flowRuled(o, run.flow, rule, run.input, caller) : !('needs' in ruled(rule, caller))
  if (rule !== undefined && lets()) return
  const above = run.parent ? r.read(run.parent) : undefined
  if (run.as !== 'starter' || !above || ofSystem()) throw notFound
  mayFollow(o, above, caller)
}
