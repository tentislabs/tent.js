import type { Caller } from '../../core/index.ts'
import type { RunView, Runner } from '../../flows/index.ts'
import { byOfCaller, startedBy } from '../flows/words.ts'
import type { Opened } from '../opened.ts'
import { wireError } from '../wire.ts'
import { writingOf } from './told.ts'
import { isStored } from '../../core/internal.ts'

/** What reads the runs of an app: its runner, and on a reader what reads them from its own data. */
export type RunsReading = Pick<Runner, 'read' | 'find'>

/** One ask that waits for a person, as `working` and a run message list it. */
export interface WaitingAsk {
  run: string
  step: string
  repeat: number
  n: number
  tool: string
  input: unknown
  call?: string
}

const ended = (state: string): boolean => state === 'done' || state === 'failed' || state === 'stopped'

/** Whether a run is a run of an agent: its flow states `agent`. */
export function isAgentRun(o: Opened, run: RunView): boolean {
  const flow = Object.hasOwn(o.description.flows, run.flow) ? o.description.flows[run.flow] : undefined
  return flow?.agent !== undefined
}

/**
 * Takes the name of a step. Answers the numbers and the tool of a `tool` step of an agent: `tool 1.2 refund`
 * of a tool call of the model, and `tool 1.2.3 refund`, and deeper, of a call of a sequence. Nothing for another step.
 */
export function toolStepOf(name: string): { numbers: number[]; tool: string } | undefined {
  const found = /^tool (\d+(?:\.\d+)+) (.+)$/.exec(name)
  return found ? { numbers: found[1].split('.').map(Number), tool: found[2] } : undefined
}

/** The tool that a tool call of the model in a `tool` step called, by the name of the step: `tool 1.2 refund` called `refund`. */
export function toolOfStep(name: string): string | undefined {
  const step = toolStepOf(name)
  return step?.numbers.length === 2 ? step.tool : undefined
}

/**
 * The tool call of a run of an agent that a step of it made: the tool and the input that the model asked for,
 * which the `model` step before it saved.
 */
function callOf(run: RunView, step: string): { tool: string; input: unknown } | undefined {
  const found = toolStepOf(step)
  // A call of a sequence names no call of the model.
  const [n, m, deeper] = found?.numbers ?? []
  if (!found || m === undefined || deeper !== undefined) return undefined
  const model = run.steps.find((one) => one.name === `model ${n}`)
  const calls: unknown = Reflect.get(Object(model?.result), 'calls')
  const call: unknown = Array.isArray(calls) ? calls[Number(m) - 1] : undefined
  return { tool: found.tool, input: isStored(call) ? call.input : undefined }
}

/**
 * The tool call of the run at the top of a run's calls that the run happened under: walked up from the run, by the
 * step of each run above that called the one below, to the `tool` step of the top run.
 */
function topCallOf(runner: RunsReading, run: RunView): { tool: string; input: unknown } | undefined {
  let below = run
  for (let above = run.parent ? runner.read(run.parent) : undefined; above; ) {
    if (!above.parent) return below.parentStep ? callOf(above, below.parentStep.name) : undefined
    below = above
    above = runner.read(above.parent)
  }
  return undefined
}

/** The runs below a run, at every depth, that are not finished. */
function underOf(runner: RunsReading, run: RunView): RunView[] {
  const all = runner.find({ top: run.top })
  const below = (one: RunView): boolean => {
    for (
      let at = one.parent ? runner.read(one.parent) : undefined;
      at;
      at = at.parent ? runner.read(at.parent) : undefined
    )
      if (at.id === run.id) return true
    return false
  }
  return all.filter((one) => one.id !== run.id && !ended(one.state) && below(one))
}

/**
 * The asks that wait in a run and in the runs under it: an `ask` step of an agent, with its tool and its input,
 * and an ask on demand of any run, with the tool call of the top run it happened under and the name of what was
 * refused. A wait that a flow made for itself is no ask.
 */
export function asksOf(o: Opened, runner: RunsReading, run: RunView): WaitingAsk[] {
  const asks: WaitingAsk[] = []
  for (const one of [run, ...underOf(runner, run)]) {
    const agent = isAgentRun(o, one)
    for (const step of one.steps) {
      if (step.state !== 'waiting') continue
      const show: Record<string, unknown> = isStored(step.show) ? step.show : {}
      // A question waits as an ask does, and is shown and answered among them.
      const asking = step.name.startsWith('ask ') || step.name.startsWith('question ')
      if (agent && asking && typeof show.tool === 'string') {
        // An ask of a run that another run called is shown with the tool call of the top run it happened under.
        const top = one.parent ? topCallOf(runner, one) : undefined
        asks.push({
          run: one.id,
          step: step.name,
          repeat: step.repeat,
          n: step.ask ?? 1,
          tool: top?.tool ?? show.tool,
          input: top ? top.input : show.input,
          // The ask of a sequence shows the calls its walk listed, and whether more may follow.
          ...(Array.isArray(show.sequence) ? { sequence: show.sequence, more: show.more === true } : {}),
        })
      } else if (step.ask !== undefined && typeof show.call === 'string') {
        const top = one.parent ? topCallOf(runner, one) : callOf(one, step.name)
        asks.push({
          run: one.id,
          step: step.name,
          repeat: step.repeat,
          n: step.ask,
          tool: top?.tool ?? '',
          input: top?.input,
          call: show.call,
        })
      }
    }
  }
  return asks
}

/** Whether a step of a run carries an ask that a person may answer, by its name and its pass. */
export function asksAt(o: Opened, runner: RunsReading, run: RunView, step: string): boolean {
  return asksOf(o, runner, run).some((one) => one.run === run.id && one.step === step)
}

/** The entry of `working` of one run: its state, its error, the text so far, the runs under it and what waits. */
function entryOf(o: Opened, runner: RunsReading, run: RunView): Record<string, unknown> {
  const writing = writingOf(o, run.id)
  const flow = Object.hasOwn(o.description.flows, run.flow) ? o.description.flows[run.flow] : undefined
  const reasoning = Reflect.get(Object(Reflect.get(Object(flow?.agent), 'reasoning')), 'show') === true
  return {
    id: run.id,
    run: run.id,
    state: run.state,
    ...(run.state === 'failed' && run.error ? { error: wireError(run.error, o.mode !== 'live').error } : {}),
    ...(writing?.text ? { text: writing.text } : {}),
    ...(reasoning && writing?.reasoning ? { reasoning: writing.reasoning } : {}),
    under: underOf(runner, run).map((one) => ({
      run: one.id,
      tool: one.parentStep ? (toolOfStep(one.parentStep.name) ?? one.flow) : one.flow,
      state: one.state,
    })),
    asks: asksOf(o, runner, run),
    ...(run.state === 'queued' ? { message: Reflect.get(Object(run.input), 'message') } : {}),
  }
}

/** The place of a state in the order of `working`: the run that works, the runs that wait, the queue, the last one. */
const placeOf = (state: string): number =>
  state === 'running' ? 0 : state === 'waiting' ? 1 : state === 'queued' ? 2 : 3

/**
 * `working` of an agent: the caller's runs of it that are not finished, and their latest one that is, on that
 * conversation where `thread` is given, each as its entry, with an unfinished run of someone else that holds the
 * conversation as `{ run, state, theirs: true }`. With `run`, the entry of that one run, where it is a run of an
 * agent below one of the caller's own.
 */
export function workingOf(
  o: Opened,
  runner: RunsReading,
  agent: string,
  caller: Caller,
  asked: { thread?: string; run?: string },
): Record<string, unknown>[] {
  const by = byOfCaller(caller)
  if (asked.run !== undefined) {
    const one = runner.read(asked.run)
    const top = one ? runner.read(one.top) : undefined
    if (!one || !top || top.flow !== agent || !startedBy(top.startedBy, by) || !isAgentRun(o, one)) return []
    return [entryOf(o, runner, one)]
  }
  const runs = runner.find({ flow: agent, ...(asked.thread === undefined ? {} : { thread: asked.thread }) })
  const mine = runs.filter((one) => startedBy(one.startedBy, by))
  const open = mine.filter((one) => !ended(one.state)).sort((a, b) => placeOf(a.state) - placeOf(b.state))
  const [latest] = mine.filter((one) => ended(one.state))
  const entries = [...open, ...(latest ? [latest] : [])].map((one) => entryOf(o, runner, one))
  if (asked.thread === undefined) return entries
  const theirs = runs.find(
    (one) => !startedBy(one.startedBy, by) && (one.state === 'running' || one.state === 'waiting'),
  )
  return theirs ? [{ id: theirs.id, run: theirs.id, state: theirs.state, theirs: true }, ...entries] : entries
}
