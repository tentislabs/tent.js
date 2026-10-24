import type { Caller, Judge } from '../../core/index.ts'
import { fingerprint, number, TentError, text } from '../../core/index.ts'
import { judgeInput, judgePrompt } from '../../core/internal.ts'
import { callerText, rowIds } from '../../data/index.ts'
import { callerOfBy } from '../flows/words.ts'
import type { RunView } from '../../flows/index.ts'
import type { Opened } from '../opened.ts'
import { table } from '../tables/scores.ts'
import { appModelCall } from './appCall.ts'
import { toolStepOf } from './working.ts'

const system: Caller = { kind: 'system' }

/** One rating of a person, or one score of a judge, of a run of an agent. */
interface Scored {
  run: string
  agent: string
  kind: 'rating' | 'score'
  score: number
  note?: string
  why?: string
  // Who gave it: the starter of the run for a rating, and the system for a score.
  by: Caller
  // The person the run is of, whom a row of a score names too, so that they read the scores of their own runs.
  of?: string
}

/** Keeps one rating or score in the engine's table of them, in a write of its own. */
export function kept(o: Opened, one: Scored): void {
  if (!Number.isFinite(one.score))
    throw new TentError('T0002', 'A rating is a number.', { fields: { score: 'type' }, fix: 'Rate with a number.' })
  const now = new Date(o.clock.now())
  o.store.write((tx) =>
    tx.add(
      table.name,
      {
        id: rowIds.next(),
        run: one.run,
        agent: one.agent,
        kind: one.kind,
        score: one.score,
        ...(one.note === undefined ? {} : { note: one.note }),
        ...(one.why === undefined ? {} : { why: one.why }),
        caller: callerText(one.by),
        ...(one.by.user || one.of ? { user: one.by.user?.id ?? one.of } : {}),
        createdAt: now,
        updatedAt: now,
      },
      system,
    ),
  )
}

/** The agent at the top of the calls of a run, whose runs are rated: nothing for a run of no agent. */
function ratedAgent(o: Opened, run: RunView): string | undefined {
  const top = o.flows?.runner.read(run.top) ?? run
  return o.description.flows[top.flow]?.agent === undefined ? undefined : top.flow
}

/**
 * `runs.rate(run, { score, note })`: a rating kept with a run of an agent, as the rating of the run's starter,
 * for code that states `system` and has held its own rule. Throws T0001 for a run that is no run of an agent.
 */
export function rateRun(o: Opened, run: string, given: unknown): void {
  const found = o.flows?.runner.read(run)
  const agent = found ? ratedAgent(o, found) : undefined
  if (!found || !agent) throw new TentError('T0001', `No run ${JSON.stringify(run).slice(0, 80)} of an agent is there.`)
  const by = callerOfBy(o, found.startedBy)
  const score: unknown = Reflect.get(Object(given), 'score')
  const note: unknown = Reflect.get(Object(given), 'note')
  kept(o, {
    run,
    agent,
    kind: 'rating',
    score: Number(score),
    ...(typeof note === 'string' ? { note } : {}),
    by,
  })
}

/** Whether a run is one of the share that is scored: by the fingerprint of its id, so a run is scored or not for good. */
function inShare(run: string, share: number): boolean {
  if (share >= 1) return true
  if (share <= 0) return false
  return Number.parseInt(fingerprint(run).slice(0, 8), 16) / 2 ** 32 < share
}

/** What each tool of a run answered, by its steps, which a judge of what the tools answered reads. */
const answeredIn = (run: RunView): { tool: string; answer: unknown }[] =>
  run.steps.flatMap((step) => {
    const tool = toolStepOf(step.name)?.tool
    const answer: unknown = step.result ?? step.error
    return tool && step.state !== 'waiting' ? [{ tool, answer }] : []
  })

/** Whether a model of the app is a function: it states what it takes and gives, or the call of a service. */
function isFunction(o: Opened, model: string): boolean {
  const stored = Object.hasOwn(o.description.models, model) ? o.description.models[model] : undefined
  return (
    stored !== undefined && (stored.call !== undefined || (stored.input !== undefined && stored.output !== undefined))
  )
}

/**
 * Takes an app and a run that ended done. Where its agent states `score` and the run is of its share, has the
 * judge score its answer after the run ended, outside it, as the system: so its model call is counted on the
 * judge's model and on no `perRun` of the run, and nobody waits for it. Keeps the score in the engine's table of
 * them, with the starter of the run as the person it is of. A judge that fails is written to the log.
 */
export async function scoreWhenDue(o: Opened, id: string): Promise<void> {
  const run = o.flows?.runner.read(id)
  const flow = run && run.top === run.id ? o.description.flows[run.flow] : undefined
  const score: unknown = Reflect.get(Object(flow?.agent), 'score')
  const judged: unknown = Reflect.get(Object(score), 'with')
  const share: unknown = Reflect.get(Object(score), 'share')
  if (!run || !flow || typeof share !== 'number' || !inShare(run.id, share)) return
  const judge: Judge = { judge: Object(judged) }
  const task = String(Reflect.get(Object(run.input), 'message') ?? '')
  const end: unknown = run.answer
  const value: unknown = Reflect.get(Object(end), 'value')
  const said = String(Reflect.get(Object(end), 'text') ?? '')
  const answer = [said, ...(value === undefined ? [] : [JSON.stringify(value)])].join('\n')
  const told = {
    tools: answeredIn(run),
    agent: {
      ...(typeof flow.about === 'string' ? { about: flow.about } : {}),
      instructions: String(Reflect.get(Object(flow.agent), 'instructions') ?? ''),
    },
  }
  const model = judge.judge.model
  try {
    const given: unknown = isFunction(o, model)
      ? await appModelCall(o, model, judgeInput(judge, task, answer, told), system)
      : await appModelCall(
          o,
          `${model}.fill`,
          [{ score: number({ min: 0, max: 1 }), why: text() }, judgePrompt(judge, task, answer, told)],
          system,
        )
    const why: unknown = Reflect.get(Object(given), 'why')
    const of = run.startedBy?.kind === 'user' ? run.startedBy.id : undefined
    kept(o, {
      run: run.id,
      agent: run.flow,
      kind: 'score',
      score: Number(Reflect.get(Object(given), 'score')),
      ...(typeof why === 'string' ? { why } : {}),
      by: system,
      ...(of ? { of } : {}),
    })
  } catch (error) {
    o.log.write('lines', {
      at: o.clock.now(),
      level: 'error',
      message: `The judge of ${run.flow} did not score the run ${run.id}.`,
      data: JSON.stringify({ error: String(error) }),
    })
  }
}
