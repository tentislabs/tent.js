import type { Caller } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import { isStored, knownModel, wordsOf } from '../../core/internal.ts'
import type { Driver, Leave } from '../../flows/index.ts'
import type { AiEnv, Message, ToolCall } from '../face.ts'
import { written } from '../layer/writing.ts'
import type { AgentOf } from './agentOf.ts'
import { askTimeOf } from './agentOf.ts'
import type { Offered } from './tools.ts'
import { toolTries } from './tools.ts'

/** The answer to what a server asked for, as `connect` sends it on: its state and key, and the answer itself. */
interface Answered {
  state: string
  key?: string
  response: Record<string, unknown>
}

/** The steps of a run, as the runner hands them to the driver. */
type Steps = Parameters<Driver>[0]['step']

/** What a call of an outside tool is handed of its run. */
export interface OutsideRun {
  env: AiEnv
  agent: AgentOf
  description: Description
  starter: Caller
  step: Steps
  run: Parameters<Driver>[0]
}

/**
 * The ids of the pictures that the answer of an outside tool gave the model as images, or none. They travel in
 * the message of the answer, which its row of a conversation keeps, so that they are given again with the row.
 */
export function picturesOf(answer: Message): string[] {
  const files: unknown = Reflect.get(answer, 'files')
  return Array.isArray(files) ? files.map(String) : []
}

/** What a server asked for in a failure that passes it up: a question, or a model call, with its state and key. */
function askedOf(
  error: unknown,
): { question?: string; sample?: Record<string, unknown>; state: string; key?: string } | undefined {
  const fields: unknown = Reflect.get(Object(error), 'fields')
  if (!isStored(fields) || typeof fields.state !== 'string') return undefined
  const at = { state: fields.state, ...(typeof fields.key === 'string' ? { key: fields.key } : {}) }
  if (typeof fields.question === 'string') return { question: fields.question, ...at }
  if (typeof fields.sample !== 'string') return undefined
  try {
    const sample: unknown = JSON.parse(fields.sample)
    return isStored(sample) ? { sample, ...at } : undefined
  } catch {
    return undefined
  }
}

/** The messages of a model call that a server asked for, as the model is handed them: the text of each. */
function sampleMessages(sample: Record<string, unknown>): Message[] {
  const said = Array.isArray(sample.messages) ? sample.messages.filter(isStored) : []
  return said.map((one) => {
    const content = isStored(one.content) ? one.content : {}
    // A part that is no text, as a picture the server sends, is told by its kind alone: nothing of it is fetched.
    const text = content.type === 'text' ? String(content.text ?? '') : `[${String(content.type)}]`
    return { who: one.role === 'assistant' ? 'assistant' : 'user', text }
  })
}

/** The model that a service of an outside server names to answer the model calls it asks for, where it names one. */
function modelFor(r: OutsideRun, tool: string): string | undefined {
  const [service = ''] = tool.split('.')
  const mcp: unknown = r.description.services[service]?.mcp
  return isStored(mcp) && typeof mcp.model === 'string' ? mcp.model : undefined
}

/**
 * The model call that a server asked for, made by the model the service names, in a step of its own and on the
 * run's own count: its answer is the message of the standard that the server is sent.
 */
async function sampled(
  r: OutsideRun,
  model: string,
  sample: Record<string, unknown>,
  step: string,
): Promise<Record<string, unknown>> {
  const kept: unknown = await r.step(step, async () => {
    const end = await written(
      {
        env: r.env,
        model,
        method: 'reply',
        caller: r.starter,
        version: r.run.version,
        at: { run: r.run.id, step, repeat: 1 },
        signal: r.run.signal,
      },
      {
        ...(typeof sample.systemPrompt === 'string' ? { instructions: sample.systemPrompt } : {}),
        messages: sampleMessages(sample),
      },
    )
    return { role: 'assistant', content: { type: 'text', text: end.text ?? '' }, model, stopReason: 'endTurn' }
  })
  return isStored(kept) ? kept : {}
}

/**
 * Takes a run and one call of a tool of an outside server that the model asked for. Calls it in its step, with
 * what the tool call may do. A question with yes and no that the server puts is an ask of the step, which the
 * starter answers; the answer goes back to the server in a step of its own. A picture of the answer reaches a model
 * that takes pictures as an image, and is told to any other as a file that was kept, with its id.
 */
export async function outsideCall(
  r: OutsideRun,
  o: { n: number; m: number; call: ToolCall; tool: Offered; leave: Leave },
): Promise<Message[]> {
  const name = `tool ${o.n}.${o.m} ${o.call.tool}`
  // The model's input goes to the server as it is: the person's answer travels beside it, from the ask alone.
  const made = (step: string, answered?: Answered): Promise<unknown> =>
    r.step(
      step,
      () =>
        r.env.call(o.tool.entry.tool, [
          o.call.input,
          { files: true, run: r.run.id, ...(answered ? { answered } : {}) },
        ]),
      { leave: o.leave, tries: toolTries(o.tool) },
    )
  let answer: unknown
  try {
    answer = await made(name)
  } catch (error) {
    const asked = askedOf(error)
    const model = modelFor(r, o.tool.entry.tool)
    const at = asked ? { state: asked.state, ...(asked.key ? { key: asked.key } : {}) } : undefined
    if (asked?.sample && model && at) {
      const response = await sampled(r, model, asked.sample, `model ${o.n}.${o.m} for ${o.call.tool}`)
      answer = await made(`${name} answered`, { ...at, response })
    } else if (asked?.question !== undefined && at) {
      const said = await r.step.waitFor(`ask ${o.n}.${o.m} question`, {
        timeout: askTimeOf(r.agent),
        show: { tool: o.call.tool, question: asked.question },
      })
      const action = said.approved === true ? 'accept' : 'decline'
      answer = await made(`${name} answered`, { ...at, response: { action } })
    } else throw error
  }
  return pictured(r, o.call.id, answer)
}

/**
 * Takes a run, the id of a call and what its tool answered: `{ result, files }`, each file of the run as its id and
 * its kind, or any other answer, which is the result itself. Answers the messages the model is handed: a picture
 * reaches a model that takes pictures as an image, given again with the row of the answer, and is told to any other
 * as a file that was kept, with its id.
 */
export async function pictured(
  r: Pick<OutsideRun, 'env' | 'agent' | 'description' | 'starter'>,
  id: string,
  answer: unknown,
): Promise<Message[]> {
  const result = isStored(answer) ? answer.result : answer
  const files = isStored(answer) && Array.isArray(answer.files) ? answer.files.filter(isStored) : []
  const told: Message = { who: 'tool', id, result }
  if (!files.length) return [told]
  const model = Object.hasOwn(r.description.models, r.agent.model) ? r.description.models[r.agent.model] : {}
  const sees = (knownModel(model).abilities ?? []).includes('images')
  const pictures = files.filter((one) => String(one.kind).startsWith('image/'))
  if (sees && pictures.length) {
    const images = await Promise.all(
      pictures.map(async (one) => ({
        bytes: await r.env.files.bytes(String(one.id), r.starter),
        kind: String(one.kind),
      })),
    )
    const others = files.filter((one) => !String(one.kind).startsWith('image/'))
    const answer: Message & { files: string[] } = {
      ...told,
      result: withKept(r, result, others),
      files: pictures.map((one) => String(one.id)),
    }
    return [answer, { who: 'user', images }]
  }
  return [{ ...told, result: withKept(r, result, files) }]
}

/** An answer with the engine's words for each file of it that the model is told of as a kept file. */
function withKept(r: Pick<OutsideRun, 'agent'>, result: unknown, files: Record<string, unknown>[]): unknown {
  if (!files.length) return result
  const words = files.map((one) =>
    wordsOf(r.agent.words, String(one.kind).startsWith('audio/') ? 'soundKept' : 'pictureKept', String(one.id)),
  )
  const text = typeof result === 'string' ? result : JSON.stringify(result ?? null)
  return [text, ...words].filter(Boolean).join('\n')
}
