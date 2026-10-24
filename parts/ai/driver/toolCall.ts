import { TentError } from '../../core/index.ts'
import type { Leave } from '../../flows/index.ts'
import type { Message, ToolCall } from '../face.ts'
import { answerTool, typedValue } from './answer.ts'
import { handOverTool, handedOver, questionAsked, questionTool } from './person.ts'
import { namedCall } from './listed.ts'
import { outsideCall, pictured } from './outside.ts'
import type { Running } from './running.ts'
import { sequenceCall } from './sequence.ts'
import { filedAnswer, sourceCall } from './sources.ts'
import type { Offered } from './tools.ts'
import { errorText, toolTries } from './tools.ts'
import { askTimeOf } from './agentOf.ts'

/** What a tool call may do where nobody was asked: a tool that sends and asks nothing is trusted. */
export const leaveOf = (tool: Offered): Leave => (tool.sends && !tool.asks ? 'trusted' : 'none')

/**
 * Takes a run, the name of a step, a tool, its input, how it may act on the world, and what the step keeps to show.
 * Carries the call out in that step, as the starter: a tool of a source through its source, any other through the
 * runtime's call. Answers what it answered, and throws what it failed with.
 */
export function madeCall(
  r: Running,
  name: string,
  tool: Offered,
  input: unknown,
  o: { leave: Leave; show?: unknown },
): Promise<unknown> {
  const source = r.sources.find((one) => one.offered === tool)
  const at = { run: r.run.id, starter: r.starter, record: r.run.record }
  // The pictures a source answers are put as files of the run inside the step, so a step made again puts none.
  // A tool of an outside server is called with the run it is called in, and answers its result beside its files.
  const work = async (): Promise<unknown> => {
    if (source) return filedAnswer(r.env, r.starter, r.run.id, await sourceCall(r.env, source, at, input))
    if (tool.kind !== 'outside') return r.env.call(tool.entry.tool, [input])
    const answer: unknown = await r.env.call(tool.entry.tool, [input, { run: r.run.id }])
    return typeof answer === 'object' && answer !== null && 'result' in answer ? answer.result : answer
  }
  return r.step(name, work, {
    leave: o.leave,
    ...(o.show === undefined ? {} : { show: o.show }),
    tries: toolTries(tool),
  })
}

/** Carries one tool call out in its step, and answers the message the model is handed of it. */
export async function toolCall(r: Running, n: number, m: number, asked: ToolCall): Promise<Message | Message[]> {
  const { words } = r.agent
  if (asked.tool === 'sequence' && r.agent.sequence) return sequenceCall(r, n, m, asked)
  // The typed answer is checked against its type, and a value that does not fit goes back to the model.
  if (asked.tool === answerTool && r.agent.output) {
    const typed = typedValue(r.agent, asked)
    if ('error' in typed) return { who: 'tool', id: asked.id, error: errorText(typed.error, words) }
    return { who: 'tool', id: asked.id, result: typed.value }
  }
  if (asked.tool === handOverTool && r.agent.handsOver.length) return handedOver(r, n, m, asked)
  if (asked.tool === questionTool && r.agent.questions) return questionAsked(r, n, m, asked)
  // Told as a list, a tool is called by its name with `call`: the step is named after the tool it names.
  const listed = r.agent.tell === 'list' && asked.tool === 'call' ? namedCall(r.told, asked) : undefined
  if (listed && 'error' in listed) return { who: 'tool', id: asked.id, error: errorText(listed.error, words) }
  const call = listed ? listed.call : asked
  const tool = listed ? listed.tool : r.offered.find((one) => one.entry.told === call.tool && r.agent.tell !== 'list')
  if (!tool) return { who: 'tool', id: call.id, error: errorText(new TentError('T0001', 'no such tool'), words) }
  let leave = leaveOf(tool)
  if (tool.asks) {
    const answer = await r.step.waitFor(`ask ${n}.${m}`, {
      timeout: askTimeOf(r.agent),
      show: { tool: call.tool, input: call.input },
    })
    if (answer.approved !== true) return { who: 'tool', id: call.id, error: errorText({ code: 'T7111' }, words) }
    leave = 'agreed'
  }
  try {
    if (tool.kind === 'outside')
      return await outsideCall({ ...r, description: r.env.description(r.run.version) }, { n, m, call, tool, leave })
    const answer = await madeCall(r, `tool ${n}.${m} ${call.tool}`, tool, call.input, { leave })
    // A tool of a source may give the model pictures, as an outside tool does.
    if (tool.kind === 'source' && Array.isArray(Reflect.get(Object(answer), 'files')))
      return await pictured({ ...r, description: r.env.description(r.run.version) }, call.id, answer)
    return { who: 'tool', id: call.id, result: answer }
  } catch (error) {
    // A tool whose work would pass `perRun` of this run, or of one above it, ends the run: the limit is the run's.
    if (error instanceof TentError && error.code === 'T7102' && error.fields?.limit === 'perRun') throw error
    return { who: 'tool', id: call.id, error: errorText(error, words) }
  }
}
