import type { Type } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import { checkValue, toJsonSchema, wordsOf } from '../../core/internal.ts'
import type { ToolCall } from '../face.ts'
import type { AgentOf } from './agentOf.ts'

/** The name of the engine's own tool that ends a run with its typed answer. */
export const answerTool = 'answer'

/** The type that the input of `answer` is: the type of `output` where it is a record, and else a record of it as `value`. */
const inputOf = (output: Type): Type =>
  output.kind === 'object' ? output : { kind: 'object', shape: { value: output } }

/** The tool `answer` as a provider is handed it, for an agent that states `output`: nothing for one that does not. */
export function answerOffered(agent: AgentOf): { name: string; about: string; input: object } | undefined {
  if (!agent.output) return undefined
  return { name: answerTool, about: wordsOf(agent.words, 'answer'), input: toJsonSchema(inputOf(agent.output)) }
}

/**
 * Takes an agent that states `output` and a call of `answer` that the model made. Answers the value of the run,
 * held to the type, or the error the model is answered with: T0002 with a line for each field that does not fit.
 */
export function typedValue(agent: AgentOf, call: ToolCall): { value: unknown } | { error: TentError } {
  const output = agent.output
  if (!output) return { error: new TentError('T0001', 'no such tool') }
  const misfits = checkValue(inputOf(output), call.input)
  if (misfits.length) return { error: new TentError('T0002', misfits.map((one) => one.message).join('\n')) }
  return { value: output.kind === 'object' ? call.input : Reflect.get(Object(call.input), 'value') }
}

/** The error of a run of an agent that states `output` and ended with no call of `answer`. */
export const noAnswer = (agent: string): TentError =>
  new TentError('T7130', `The agent ${agent} ended its run with no call of \`answer\`.`, {
    fix: 'Tell the model in the instructions to give its answer with the tool `answer`, or take `output` away.',
  })
