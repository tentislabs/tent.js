import type { Runner } from '../../flows/index.ts'
import { starterOf } from '../flows/starter.ts'
import type { Asked } from '../door/call.ts'
import { callerOf, refusedBy, ruled } from '../door/rule.ts'
import { loggedCall, namedRun, waitedRun } from '../flows/runCall.ts'
import { byOfCaller } from '../flows/words.ts'
import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { holderOf } from './handedOver.ts'
import { agentInput, agentRecordOf, threadOf } from './started.ts'

/**
 * An agent that is called through the door, or by a program: it passes the agent's `access` and the
 * checks of a start, starts a run, and answers `{ run }` at once. Where the call waits, as at `/api/`, it waits for
 * the run and answers `{ text }`, held to `actionTime`: a run that outlasts it goes on, and the caller is answered
 * T0008 with the id of the run in `fields.run`. The same call with `{ run }` alone waits for that run again, and
 * with `{ run, stop: true }` stops it, for the caller who started it. Answers nothing for a name that is no
 * agent, and for one that states no `access` where the caller is not the system: such an agent is not found.
 */
export function offeredAgent(
  o: Opened,
  runner: Runner,
  name: string,
  given: unknown,
  asked: Asked & { waits?: true },
): Promise<unknown> | undefined {
  const record = Object.hasOwn(o.description.flows, name) ? o.description.flows[name] : undefined
  const own = record ? agentRecordOf(record) : undefined
  if (!record || !own) return undefined
  const { caller } = asked
  if (own.access === undefined && caller.kind !== 'system') return undefined
  return loggedCall(o, name, caller, async () => {
    const said = ruled(own.access, caller)
    if ('needs' in said) {
      o.log.write('denied', { at: o.clock.now(), name, ...callerOf(caller), rule: said.rule })
      throw refusedBy(name, said.needs, caller)
    }
    const named = namedRun(runner, given, name, 'agent', byOfCaller(caller))
    if (named === 'stopped') return undefined
    let run: string
    if (named) run = named.run
    else {
      // A start on a conversation that this agent handed over is the start of the one that holds it, under its rule.
      const held = holderOf(o, name, record, given)
      const input = agentInput(o, held.name, held.record, given, caller, { access: true })
      run = runner.add({
        flow: held.name,
        version: o.version,
        startedBy: starterOf(caller),
        input,
        ...threadOf(held.record, input),
      })
      if (!asked.waits) return { run }
    }
    return waitedRun(o, runner, run, {
      name,
      called: 'agent',
      most: storedLimit(o.description, 'actionTime'),
      limit: '`limits.actionTime`',
      // A call of MCP is told at once that its run waits for a person, so that the client may ask them.
      ...(asked.runAsks ? { asks: caller } : {}),
    })
  })
}
