import { fingerprint } from '../../core/index.ts'
import type { Message, ReplyEnd } from '../face.ts'
import type { Asked } from './writing.ts'

// What a provider takes as the name of a tool: letters, digits, `_` and `-`, 64 at most.
const takes = /^[A-Za-z0-9_-]{1,64}$/

/** The name a tool is handed to a provider under: its own where the provider takes it, and a short one made of it otherwise. */
function takenName(name: string, taken: Set<string>): string {
  if (takes.test(name) && !taken.has(name)) return name
  const plain = name.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 52)
  let made = `${plain}_${fingerprint(name).slice(0, 8)}`
  for (let n = 2; taken.has(made); n++) made = `${plain}_${fingerprint(`${name}\n${n}`).slice(0, 8)}`
  return made
}

/** The names of a request's tools, each with the name it is handed under, and the way back. */
export interface Names {
  given: Map<string, string>
  back: Map<string, string>
}

/** Makes the names of the tools of a request: each its own where the provider takes it. */
export function namesOf(tools: { name: string }[]): Names {
  const given = new Map<string, string>()
  const back = new Map<string, string>()
  const taken = new Set<string>()
  for (const { name } of tools) {
    const made = takenName(name, taken)
    taken.add(made)
    given.set(name, made)
    back.set(made, name)
  }
  return { given, back }
}

/** A request with every name of a tool in it as the provider is handed it: its tools, and the calls of its conversation. */
export function handedUnder(request: Asked, names: Names): Asked {
  const under = (name: string): string => names.given.get(name) ?? name
  const messages: Message[] = request.messages.map((message) =>
    message.calls ? { ...message, calls: message.calls.map((call) => ({ ...call, tool: under(call.tool) })) } : message,
  )
  return {
    ...request,
    messages,
    ...(request.tools ? { tools: request.tools.map((tool) => ({ ...tool, name: under(tool.name) })) } : {}),
  }
}

/** The end of an answer with each call it asks for under the tool's own name again. */
export const mappedBack = (end: ReplyEnd, names: Names): ReplyEnd => ({
  ...end,
  calls: end.calls.map((call) => ({ ...call, tool: names.back.get(call.tool) ?? call.tool })),
})
