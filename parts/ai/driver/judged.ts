import type { Judge } from '../../core/index.ts'
import { number, text } from '../../core/index.ts'
import { judgeInput, judgePrompt } from '../../core/internal.ts'
import { calledAsFunction } from '../layer/asFunction.ts'
import { modelOf } from '../layer/record.ts'
import { filled } from '../layer/writing.ts'
import type { Running } from './running.ts'

/**
 * Takes a run, a judge, the step it is asked in, the task and the answer. Asks the judge's model for a score and a
 * reason as the starter, in that step, so its model call counts on the run: a model that writes with `fill`, held
 * to their shape, and a model of any other kind as a function, handed what a judge is handed. Answers them.
 */
export async function judgedIn(
  r: Running,
  judge: Judge['judge'],
  step: string,
  task: unknown,
  answer: unknown,
): Promise<{ score: number; why: string }> {
  const asking = {
    env: r.env,
    model: judge.model,
    caller: r.starter,
    version: r.run.version,
    at: { run: r.run.id, step, repeat: 1 },
    signal: r.run.signal,
  }
  const judged: Judge = { judge }
  const value: unknown = modelOf(r.env.description(r.run.version), judge.model).isFunction
    ? await calledAsFunction({ ...asking, method: 'call' }, judgeInput(judged, task, answer))
    : await filled(
        { ...asking, method: 'fill' },
        { score: number({ min: 0, max: 1 }), why: text() },
        { messages: [{ who: 'user', text: judgePrompt(judged, task, answer) }] },
      )
  const score: unknown = Reflect.get(Object(value), 'score')
  const why: unknown = Reflect.get(Object(value), 'why')
  return { score: typeof score === 'number' ? score : 0, why: typeof why === 'string' ? why : '' }
}
