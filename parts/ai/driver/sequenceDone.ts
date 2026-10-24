import { TentError } from '../../core/index.ts'
import { errorText } from './tools.ts'

/** One call that a sequence made: its place, its tool, its input, and what it answered. */
export interface Made {
  at: number[]
  tool: string
  input: unknown
  answer: unknown
}

/** The order of two places of a sequence, number by number: the order of the names of their steps. */
function before(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const [x, y] = [a[i] ?? 0, b[i] ?? 0]
    if (x !== y) return x - y
  }
  return 0
}

/**
 * Takes the calls a sequence made and the size a tool's answer is held to. Answers what was done, as a list of
 * `{ tool, input, answer }` in the order of the names of their steps; where it passes the size, answers are left
 * out from the oldest on, each marked as left out.
 */
export function doneList(made: Made[], most: number): object[] {
  const done: object[] = [...made]
    .sort((a, b) => before(a.at, b.at))
    .map((one) => ({ tool: one.tool, input: one.input, answer: one.answer }))
  for (let i = 0; i < done.length && JSON.stringify(done).length > most; i++)
    done[i] = { ...done[i], answer: undefined, leftOut: true }
  return done
}

/**
 * Takes what ended a sequence, its line, the calls it made, and the agent's words and size of an answer.
 * Answers what the model is handed: the error in the words a tool call is answered with, the line of the sequence,
 * and under it what was done.
 */
export function failedText(
  error: unknown,
  line: number,
  made: Made[],
  o: { words: Record<string, string>; result: number },
): string {
  return `${errorText(error, o.words)} On line ${line} of the sequence.\n${JSON.stringify(doneList(made, o.result))}`
}

/** An error that ends the sequence whole: an `all` that goes on past failures passes it on. */
export function ending(error: TentError): TentError {
  Object.defineProperty(error, 'endsSequence', { value: true })
  return error
}

/** What a tool's failure is to a sequence: its own error where a caller would be told it, and else T0009 with its reference. */
export function toldError(error: unknown, words: Record<string, string>): unknown {
  if (Reflect.get(Object(error), 'endsSequence') === true) return error
  const text = errorText(error, words)
  if (!text.startsWith('Error T0009')) return error
  const ref: unknown = Reflect.get(Object(error), 'ref')
  const told = new TentError('T0009', `Something went wrong.${typeof ref === 'string' ? ` Reference ${ref}.` : ''}`)
  if (typeof ref === 'string') Object.defineProperty(told, 'ref', { value: ref })
  return told
}
