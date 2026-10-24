import { TentError } from '../../core/index.ts'
import { isStored, toJsonSchema, wordsOf } from '../../core/internal.ts'
import type { Message, ToolCall } from '../face.ts'
import type { AgentOf } from './agentOf.ts'
import { askTimeOf } from './agentOf.ts'
import { passedOut } from './guards.ts'
import type { Running } from './running.ts'
import { errorText } from './tools.ts'

/** The names of the engine's own tools that hand a conversation over and ask the person a question. */
export const handOverTool = 'handOver'
export const questionTool = 'question'

/** The tool `handOver`, for an agent that states `handsOver`: its input names one of them and says why. */
export function handOverOffered(agent: AgentOf): { name: string; about: string; input: object } | undefined {
  if (!agent.handsOver.length) return undefined
  const input = toJsonSchema({
    kind: 'object',
    shape: { to: { kind: 'choice', values: agent.handsOver }, why: { kind: 'text' } },
  })
  return { name: handOverTool, about: wordsOf(agent.words, 'handOver'), input }
}

/** The tool `question`, for an agent that states `questions`: a question, and the choices or the shape of its answer. */
export function questionOffered(agent: AgentOf): { name: string; about: string; input: object } | undefined {
  if (!agent.questions) return undefined
  const input = toJsonSchema({
    kind: 'object',
    shape: {
      question: { kind: 'text', lines: 'many' },
      choices: { kind: 'list', of: { kind: 'json' }, optional: true },
      shape: { kind: 'json', optional: true },
    },
  })
  return { name: questionTool, about: wordsOf(agent.words, 'question'), input }
}

/** Whether the door finds an agent for the starter: it states `access`, and its rule lets the starter in. */
function doorFinds(r: Running, to: string): boolean {
  const flow = r.env.description(r.run.version).flows[to]
  const access: unknown = flow?.access ?? Reflect.get(Object(flow?.agent), 'access')
  return access !== undefined && r.env.may(to) !== false
}

/**
 * Takes a run, the numbers of the call, and a call of `handOver`. Holds it to the agents of `handsOver` (T0002)
 * and to the door of the one it names: an agent that states no `access` is found by no person, and one whose
 * rule the starter does not pass is not theirs (T3101). Saves it as the step `tool N.M handOver`, whose answer is
 * `{ to, why }`. Answers the message the model is handed.
 */
export async function handedOver(r: Running, n: number, m: number, call: ToolCall): Promise<Message> {
  const input: Record<string, unknown> = isStored(call.input) ? call.input : {}
  const to = typeof input.to === 'string' ? input.to : ''
  const why = typeof input.why === 'string' ? input.why : ''
  const { words } = r.agent
  if (!r.agent.handsOver.includes(to))
    return {
      who: 'tool',
      id: call.id,
      error: errorText(new TentError('T0002', `to: one of ${r.agent.handsOver.join(', ')}`), words),
    }
  // Asked for the starter at the hand-over, so no text steers past it.
  if (!doorFinds(r, to)) return { who: 'tool', id: call.id, error: errorText({ code: 'T3101' }, words) }
  const result = await r.step(`tool ${n}.${m} ${handOverTool}`, () => ({ to, why }), { tries: 1 })
  return { who: 'tool', id: call.id, result }
}

/** The agent a call of `handOver` handed the conversation to, where its answer says one. */
export function handedTo(calls: ToolCall[], answers: Message[]): string | undefined {
  for (const call of calls) {
    if (call.tool !== handOverTool) continue
    const answer = answers.find((one) => one.id === call.id && one.error === undefined)
    const to: unknown = Reflect.get(Object(answer?.result), 'to')
    if (typeof to === 'string') return to
  }
  return undefined
}

/**
 * Takes a run, the numbers of the call, and a call of `question`. The question meets the `out` guards first, and
 * one they refuse is answered to the model as refused, shown to nobody. The step `question N.M` waits for the
 * starter as a wait for a person does, showing the question with its choices and its shape; `approve` answers it,
 * with the answer as its `data`, which the engine holds to them. Answers the message the model is handed: the
 * answer, or that the person did not answer.
 */
export async function questionAsked(r: Running, n: number, m: number, call: ToolCall): Promise<Message> {
  const input: Record<string, unknown> = isStored(call.input) ? call.input : {}
  const { words } = r.agent
  if (typeof input.question !== 'string')
    return { who: 'tool', id: call.id, error: errorText(new TentError('T0002', 'question: required'), words) }
  const asked = {
    question: input.question,
    ...(Array.isArray(input.choices) ? { choices: input.choices } : {}),
    ...(input.shape === undefined ? {} : { shape: input.shape }),
  }
  const told = [input.question, ...(Array.isArray(input.choices) ? [JSON.stringify(input.choices)] : [])].join('\n')
  if (!(await passedOut(r, `${n}.${m}`, told)))
    return { who: 'tool', id: call.id, error: `Error T7131: ${wordsOf(words, 'guarded')}` }
  const said = await r.step.waitFor(`${questionTool} ${n}.${m}`, {
    timeout: askTimeOf(r.agent),
    show: { tool: questionTool, input: asked },
  })
  if (!('approved' in said) || said.approved !== true)
    return { who: 'tool', id: call.id, error: errorText({ code: 'T7111' }, words) }
  return { who: 'tool', id: call.id, result: said.data ?? null }
}
