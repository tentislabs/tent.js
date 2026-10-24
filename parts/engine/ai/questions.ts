import { TentError } from '../../core/index.ts'
import { checkValue, fromJsonSchema } from '../../core/internal.ts'
import type { RunView } from '../../flows/index.ts'
import type { Opened } from '../opened.ts'

/** The error of an answer to a question that cannot be given: none waits there, or the answer does not fit. */
const notAnswered = (why: string): TentError =>
  new TentError('T0002', why, {
    fix: 'Answer a question that `working` lists, with `data` that fits its choices or its shape.',
  })

/** The question that waits at a step of a run, where a step of that name and pass waits with one: what it shows. */
export function questionAt(run: RunView, step: string, repeat?: number): Record<string, unknown> | undefined {
  const waits = run.steps.find(
    (one) => one.name === step && one.state === 'waiting' && (repeat === undefined || one.repeat === repeat),
  )
  const show: unknown = waits?.show
  return Reflect.get(Object(show), 'tool') === 'question' ? Object(Reflect.get(Object(show), 'input')) : undefined
}

/**
 * Holds an answer to a question to it: there is one, and it is one of the question's `choices`, or fits its
 * `shape`, a JSON Schema. Throws T0002 otherwise.
 */
export function heldAnswer(question: Record<string, unknown>, data: unknown): void {
  if (data === undefined) throw notAnswered('A question is answered with its answer as `data`.')
  const { choices, shape } = question
  if (Array.isArray(choices) && !choices.some((choice) => JSON.stringify(choice) === JSON.stringify(data)))
    throw notAnswered(`The answer is none of the choices of the question: ${JSON.stringify(choices).slice(0, 200)}.`)
  const misfits = shape === undefined ? [] : checkValue(fromJsonSchema(shape), data)
  if (misfits.length) throw notAnswered(`The answer does not fit the shape of the question: ${misfits[0].message}`)
}

/**
 * Takes an app, a run, a step and its pass, and the answer, for an approve from code rather than from the starter:
 * `runs.approve` and the program's own. Where the step waits with a question, only a run that the system started
 * is answered so, as an ask of such a run is, and with an answer that fits (T3101 otherwise, and T0002). A step
 * that waits with no question is left to the runner.
 */
export function answeredFromCode(o: Opened, run: string, step: string, data: unknown, repeat?: number): void {
  const runner = o.flows?.runner
  const one = runner?.read(run)
  const question = one ? questionAt(one, step, repeat) : undefined
  if (!one || !question) return
  const top = runner?.read(one.top) ?? one
  if (top.startedBy?.kind !== 'system')
    throw new TentError('T3101', `The question of the run ${run} is answered by the person who started it alone.`, {
      fix: 'Let the starter answer it with `approve` of the agent.',
    })
  heldAnswer(question, data)
}
