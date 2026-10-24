import type { TentError } from '../../core/index.ts'
import type { Runner } from '../../flows/index.ts'
import type { Asked } from '../door/call.ts'
import { callerOf, refusedBy, ruled } from '../door/rule.ts'
import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { loggedCall, namedRun, waitedRun } from './runCall.ts'
import { byOfCaller, inputFor } from './words.ts'
import { starterOf } from './starter.ts'
import { flowLetsIn } from './allowed.ts'

/**
 * A flow that is called through the door, or by a program: it passes the flow's `access` and the types of its
 * `input`, starts a run, waits for it, and answers the flow's answer, and nothing where the flow states no
 * `output`. It is held to `actionTime`: a run that outlasts it goes on, and the caller is answered T0008 with the
 * id of the run in `fields.run`. The same call with `{ run }` alone waits for that run again, and with
 * `{ run, stop: true }` stops it, for the caller who started it. Answers nothing for a name that is no flow, and
 * for a flow that states no `access` where the caller is not the system: such a flow is not found.
 */
export function offeredFlow(
  o: Opened,
  runner: Runner,
  name: string,
  given: unknown,
  asked: Asked,
): Promise<unknown> | undefined {
  const { flows } = o.description
  const record = Object.hasOwn(flows, name) ? flows[name] : undefined
  if (!record || record.agent !== undefined) return undefined
  const { caller } = asked
  if (record.access === undefined && caller.kind !== 'system') return undefined
  return loggedCall(o, name, caller, async () => {
    const denied = (rule: string, needs: string): TentError => {
      o.log.write('denied', { at: o.clock.now(), name, ...callerOf(caller), rule })
      return refusedBy(name, needs, caller)
    }
    const said = ruled(record.access, caller)
    if ('needs' in said) throw denied(said.rule, said.needs)
    const named = namedRun(runner, given, name, 'flow', byOfCaller(caller))
    if (named === 'stopped') return undefined
    let run: string
    if (named) run = named.run
    else {
      const input = inputFor(o, name, record, given, caller)
      flowLetsIn(o, name, record.access, input, caller)
      // A visitor who starts a run is given a visitor id, so that they may follow it.
      run = runner.add({
        flow: name,
        version: o.version,
        startedBy: starterOf(caller),
        ...(input === undefined ? {} : { input }),
      })
    }
    // A start that `pace.drop` dropped is answered so, and waits for no run.
    if (run === '') return { dropped: true }
    const answer = await waitedRun(o, runner, run, {
      name,
      called: 'flow',
      most: storedLimit(o.description, 'actionTime'),
      limit: '`limits.actionTime`',
      // A call of MCP is told at once that its run waits for a person, so that the client may ask them.
      ...(asked.runAsks ? { asks: caller } : {}),
    })
    // Only what the `output` of the flow names leaves: a flow that states none answers nothing.
    return record.output === undefined ? undefined : answer
  })
}
