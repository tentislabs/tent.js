import { TentError } from '../../core/index.ts'
import type { Description, ToolSpec } from '../../core/internal.ts'
import {
  checkValue,
  eachOneWords,
  limitDefaults,
  sequenceWords,
  toJsonSchema,
  toolList,
  wordsOf,
} from '../../core/internal.ts'
import type { Message, ToolCall } from '../face.ts'
import { namesOf } from '../layer/names.ts'
import { answerOffered } from './answer.ts'
import { handOverOffered, questionOffered } from './person.ts'
import type { AgentOf } from './agentOf.ts'
import type { Offered } from './tools.ts'
import { requestTools } from './tools.ts'

/** What a `model` step hands the provider before the conversation: the instructions, and the tools. */
export interface Start {
  instructions?: string
  tools?: { name: string; about: string; input: object }[]
}

/** What is known of the run that the start is made for. */
export interface StartOf {
  description: Description
  agent: AgentOf
  offered: Offered[]
  called: boolean
  specs: ToolSpec[]
  // The tools of outside servers, as a sequence knows them.
  outside: ToolSpec[]
  // Whether the run offers `sequence`: the agent states it and the engine was handed a reader of source.
  sequence: boolean
  // Whether the model has `typedAnswers`, which makes `fill` a name of a sequence.
  typed: boolean
  // How many entries an answer holds at most before the model is told to write one sequence.
  after: number
  // The tools of outside servers that are held back in this run, which no list holds.
  held?: string[]
}

/** The words of the `sequence` tool: its first line, `fill` where the model has `typedAnswers`, when it pays, each tool told under another name, and the value words. */
function sequenceAbout(s: StartOf, tools: { name: string }[]): string {
  const renamed = [...namesOf(tools).given]
    .filter(([name, made]) => name !== made)
    .map(([name, made]) => sequenceWords.renamed.replace('{}', made).replace('{}', name))
  return [
    wordsOf(s.agent.words, 'sequence'),
    ...(s.typed ? [sequenceWords.fill] : []),
    sequenceWords.pays,
    ...renamed,
    ...sequenceWords.values,
  ].join('\n')
}

const sequenceInput = toJsonSchema({ kind: 'object', shape: { run: { kind: 'text', lines: 'many' } } })
const callInput = toJsonSchema({
  kind: 'object',
  shape: { name: { kind: 'text' }, input: { kind: 'json', optional: true } },
})

/** The engine's own tools that an agent's options give a model, beside `call` and `sequence`, in a fixed order. */
const engineTools = (s: StartOf): { name: string; about: string; input: object }[] =>
  [answerOffered(s.agent), handOverOffered(s.agent), questionOffered(s.agent)].filter((one) => one !== undefined)

/**
 * Takes what is known of a run. Answers the start of each of its `model` steps, fixed by the form: with `'tools'`
 * the agent's instructions, and its tools in the order it lists them, then `sequence`, then the engine's own
 * tools its options give, then the tools of the sources; with `'list'` the engine's words for the list, the list,
 * and the instructions, with `call`, `sequence` and the engine's own tools. Nothing of it holds a time, a caller or a run.
 */
export function requestStart(s: StartOf): Start {
  const own = s.offered.filter((one) => one.kind !== 'source')
  const sources = s.offered.filter((one) => one.kind === 'source')
  if (s.agent.tell === 'list') {
    const listed = toolList(s.description, s.agent.name, { called: s.called, specs: s.specs, held: s.held ?? [] })
    const instructions = [
      `${wordsOf(s.agent.words, 'list')}\n${listed.own}`,
      ...(s.agent.instructions ? [s.agent.instructions] : []),
      ...(listed.sources ? [listed.sources] : []),
    ].join('\n\n')
    const tools = [{ name: 'call', about: wordsOf(s.agent.words, 'call'), input: callInput }]
    if (s.sequence) tools.push({ name: 'sequence', about: sequenceAbout(s, tools), input: sequenceInput })
    tools.push(...engineTools(s))
    return { instructions, tools }
  }
  const tools = requestTools(own)
  if (s.sequence) tools.push({ name: 'sequence', about: sequenceAbout(s, tools), input: sequenceInput })
  tools.push(...engineTools(s), ...requestTools(sources))
  return {
    ...(s.agent.instructions ? { instructions: s.agent.instructions } : {}),
    ...(tools.length ? { tools } : {}),
  }
}

/** The error of a call of the list whose input does not fit: a line for each field, and the two lines of the tool. */
function misfit(s: StartOf, tool: Offered, messages: string[]): TentError {
  const { own, sources } = toolList(s.description, s.agent.name, {
    called: s.called,
    specs: s.specs,
    held: s.held ?? [],
  })
  const lines = [...own.split('\n'), ...sources.split('\n')]
  const at = lines.findIndex((line) => line.startsWith(`${tool.entry.told}(`))
  const two = at >= 0 ? lines.slice(at, at + 2) : []
  return new TentError('T0002', [...messages, ...two].join('\n'))
}

/**
 * Takes what is known of a run and a call that the model made with `call`. Answers the tool it names and its input,
 * or the error the model is answered with: T0001 for a name that the list does not hold, and T0002 for an input
 * that does not fit, with the two lines of that tool from the list.
 */
export function namedCall(s: StartOf, call: ToolCall): { tool: Offered; call: ToolCall } | { error: TentError } {
  const given: unknown = call.input
  const name = typeof given === 'object' && given !== null ? Reflect.get(given, 'name') : undefined
  const input = typeof given === 'object' && given !== null ? (Reflect.get(given, 'input') ?? {}) : {}
  const tool = s.offered.find((one) => one.entry.told === name)
  if (!tool) return { error: new TentError('T0001', 'no such tool') }
  const misfits = checkValue(tool.input, input)
  if (misfits.length)
    return {
      error: misfit(
        s,
        tool,
        misfits.map((one) => one.message),
      ),
    }
  return { tool, call: { id: call.id, tool: tool.entry.told, input } }
}

/** The length of a tool's answer past which an agent with `sequence` is told to write one: `limits.sequenceAfter` of the project. */
export function sequenceAfter(description: Description): number {
  const limits: unknown = Reflect.get(Object(description.project), 'limits')
  const stated: unknown = Reflect.get(Object(limits), 'sequenceAfter')
  return typeof stated === 'number' ? stated : (limitDefaults.project.sequenceAfter ?? 10)
}

/**
 * Takes what is known of a run, the answers of one round in the order of their calls, and whether the run was told
 * already. Answers the answers with the line after the first that is a list of more than `after` entries, in a
 * run that offers `sequence`, once in the run.
 */
export function withEachOne(s: StartOf, answers: Message[], kept: { told: boolean }): Message[] {
  if (!s.sequence || kept.told) return answers
  return answers.map((answer) => {
    if (kept.told || !Array.isArray(answer.result) || answer.result.length <= s.after) return answer
    kept.told = true
    return { ...answer, result: `${JSON.stringify(answer.result)}\n${eachOneWords}` }
  })
}
