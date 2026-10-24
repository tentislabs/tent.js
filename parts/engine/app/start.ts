import { TentError } from '../../core/index.ts'
import { lengthOf, msOf } from '../../core/internal.ts'
import type { App } from '../app.ts'
import { threadOf } from '../ai/started.ts'
import { holderOf } from '../ai/handedOver.ts'
import { byOfCaller, inputFor } from '../flows/words.ts'
import type { Opened } from '../opened.ts'
import { heldOpen } from '../opened.ts'
import { callerNamed } from '../program.ts'
import { versionFor } from '../gradual/release.ts'

/**
 * What the program that starts a run of an agent gives it, as plain data saved with the run: its narrowed
 * limits, with `time` in milliseconds, and the sources of its tools. Nothing for a flow, or where nothing is given.
 */
function givenOf(record: Record<string, unknown>, how: unknown): { given?: object } {
  if (record.agent === undefined) return {}
  const limits: unknown = Reflect.get(Object(how), 'limits')
  const sources: unknown = Reflect.get(Object(how), 'sources')
  const time: unknown = Reflect.get(Object(limits), 'time')
  const span = typeof time === 'string' ? lengthOf(time) : undefined
  const narrowed =
    typeof limits === 'object' && limits !== null
      ? { ...limits, ...(span ? { time: span.n * msOf(span.unit) } : {}) }
      : undefined
  const named = Array.isArray(sources)
    ? sources.map((one) => ({
        name: String(Reflect.get(Object(one), 'name')),
        context: Reflect.get(Object(one), 'context'),
      }))
    : undefined
  if (!narrowed && !named) return {}
  return { given: { ...(narrowed ? { limits: narrowed } : {}), ...(named ? { sources: named } : {}) } }
}

/**
 * `app.start`: starts a run of a flow as the caller that `as` names, and does not wait: it answers the id of the
 * run, or `{ dropped: true }` for a start that the pace of the flow dropped, also on a reader. The promise is refused with T0001 for a name that is no flow of the app, and with T0002 for an input that
 * does not fit the `input` of the flow.
 */
export const member =
  (o: Opened): App['start'] =>
  async (name, input, how) => {
    heldOpen(o)
    const named = typeof name === 'string' ? name : String(Reflect.get(Object(name), 'definition'))
    const record = Object.hasOwn(o.description.flows, named) ? o.description.flows[named] : undefined
    if (!record || (!o.flows && !o.machine.reader))
      throw new TentError('T0001', `No flow named ${JSON.stringify(named).slice(0, 80)} can be started.`, {
        fix: 'Name a flow of the app: `tent map` lists them.',
      })
    const caller = callerNamed(Reflect.get(Object(how), 'as'))
    // On a reader the start is the writer's, as every write is.
    const started = await o.machine.sent('start', [named, input], caller, false, () => {
      // A start of an agent on a conversation that it handed over is the start of the one that holds it.
      const held = holderOf(o, named, record, input)
      const given = inputFor(o, held.name, held.record, input, caller)
      const run = o.flows?.runner.add({
        flow: held.name,
        // While a release goes, a run starts on the version its starter is given, and ends on it.
        version: versionFor(o, caller) ?? o.version,
        startedBy: byOfCaller(caller),
        ...(given === undefined ? {} : { input: given }),
        ...threadOf(held.record, given),
        ...givenOf(held.record, how),
      })
      return { run }
    })
    const run = String(Reflect.get(Object(started), 'run'))
    // The runner answers a start that its pace dropped with no id.
    return run === '' ? { dropped: true } : { run }
  }
