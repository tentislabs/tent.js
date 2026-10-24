import { mark } from '../mark.ts'

/** A judge: the model that scores an answer against a rule from 0 to 1, the score at which it passes, and its kind. */
export interface Judge {
  readonly judge: {
    model: string
    rule: string
    pass: number
    words?: string
    // A judge of our own: of what the tools answered, or of the task of the agent.
    kind?: 'fromTools' | 'onTask'
  }
}

/** How a judge is told what it takes beside its model. */
interface JudgeOptions {
  pass?: number
  words?: string
}

// The rules of the two judges of our own.
const fromToolsRule = 'The answer holds only what the tools answered: nothing in it comes from anywhere else.'
const onTaskRule = 'The answer stays on the task of the agent, as its instructions give it.'

// The words a judge is asked with, which `words` of its options may give anew.
const asked =
  'You are grading an answer. Read the task, the answer and the rule. Give a score from 0 to 1 for how well the answer keeps the rule, and one sentence of reason.'

/** The name of a model as a judge is handed it: its definition, or its name. */
const nameOf = (model: unknown): string =>
  typeof model === 'string' ? model : String(Reflect.get(Object(model), 'definition'))

const made = (model: unknown, rule: string, o: JudgeOptions, kind?: 'fromTools' | 'onTask'): Judge =>
  mark({
    judge: {
      model: nameOf(model),
      rule,
      pass: o.pass ?? 0.7,
      ...(o.words === undefined ? {} : { words: o.words }),
      ...(kind ? { kind } : {}),
    },
  })

/**
 * Takes a model, a rule, and `{ pass, words }`. Answers a judge: the model scores an answer against the rule from 0
 * to 1, with its reason, and the answer passes at `pass`, 0.7 where it is left out. `judge.fromTools(model)` holds
 * an answer to what the tools of its run answered, and `judge.onTask(model)` to the task of its agent.
 */
export const judge = Object.assign(
  (model: unknown, rule: string, o: JudgeOptions = {}): Judge => made(model, rule, o),
  {
    fromTools: (model: unknown, o: JudgeOptions = {}): Judge => made(model, fromToolsRule, o, 'fromTools'),
    onTask: (model: unknown, o: JudgeOptions = {}): Judge => made(model, onTaskRule, o, 'onTask'),
  },
)

/** What a judge of our own reads of a run beside its answer: what each tool answered, and the task of its agent. */
export interface JudgedRun {
  tools?: { tool: string; answer: unknown }[]
  agent?: { about?: string; instructions?: string }
}

/**
 * Takes a judge, the task, the answer, and what a judge of our own reads beside them. Answers what a judge is
 * handed, the same wherever an answer is judged: `{ task, answer, rule }`, with `answered` for a judge of what the
 * tools answered and `agent` for one of the task. A model that is a function is handed this as its input.
 */
export function judgeInput(
  { judge }: Judge,
  task: unknown,
  answer: unknown,
  o: JudgedRun = {},
): Record<string, unknown> {
  return {
    task,
    answer,
    rule: judge.rule,
    ...(judge.kind === 'fromTools' ? { answered: o.tools ?? [] } : {}),
    ...(judge.kind === 'onTask' ? { agent: o.agent ?? {} } : {}),
  }
}

/** The prompt a judge's model that writes is asked: the words of a judge, and what `judgeInput` gives, as JSON. */
export const judgePrompt = (judged: Judge, task: unknown, answer: unknown, o: JudgedRun = {}): string =>
  `${judged.judge.words ?? asked}\n\n${JSON.stringify(judgeInput(judged, task, answer, o))}`
