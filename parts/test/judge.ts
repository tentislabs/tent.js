import type { Judge } from '../core/index.ts'
import { number, text } from '../core/index.ts'
import type { JudgedRun } from '../core/internal.ts'
import { judgeInput, judgePrompt } from '../core/internal.ts'
import type { TestApp } from './testApp.ts'

/** What `judge` gives a case: the model that scores, the rule, the score at which it passes, and its kind. */
export type Judged = Judge

/** Whether what a case expects is a judgement. */
export const isJudged = (value: unknown): value is Judged =>
  typeof Reflect.get(Object(Reflect.get(Object(value), 'judge')), 'rule') === 'string'

/** Whether a model of the app is a function: it states what it takes and gives, or the call of a service. */
function isFunction(app: TestApp, model: string): boolean {
  const stored = app.description.models[model]
  return (
    stored !== undefined && (stored.call !== undefined || (stored.input !== undefined && stored.output !== undefined))
  )
}

/**
 * Takes a test app, a judgement, the task, the answer, and what a judge of our own reads beside them. Asks the
 * judge's model, outside any run, for a score and a reason: a model that writes with `fill`, held to their shape,
 * and a model of any other kind as a function, handed what a judge is handed. Answers them.
 */
export async function judged(
  app: TestApp,
  judgement: Judged,
  task: unknown,
  answer: unknown,
  o: JudgedRun = {},
): Promise<{ score: number; why: string }> {
  const { model } = judgement.judge
  const system = { as: { kind: 'system' } } as const
  const value: unknown = isFunction(app, model)
    ? await app.call(model, judgeInput(judgement, task, answer, o), system)
    : await app.call(
        `${model}.fill`,
        [{ score: number({ min: 0, max: 1 }), why: text() }, judgePrompt(judgement, task, answer, o)],
        system,
      )
  const score: unknown = Reflect.get(Object(value), 'score')
  const why: unknown = Reflect.get(Object(value), 'why')
  return { score: typeof score === 'number' ? score : 0, why: typeof why === 'string' ? why : '' }
}
