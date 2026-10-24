import type { Description } from '../description.ts'
import { knownModel } from '../models.ts'
import { isStored } from '../record.ts'
import type { ToolSpec } from '../shared.ts'
import type { LineTold } from '../toolLine.ts'
import { asksIn, agentRecord, entriesOf, givenOf, inputOf } from '../toolLine.ts'
import { toolList } from '../toolList.ts'
import type { Type } from '../type.ts'

/** One tool of a run as a sequence knows it: the name it is told under, its definition or its spec, what it takes and gives. */
export interface RunTool {
  told: string
  tool?: string
  spec?: ToolSpec
  input: Record<string, Type>
  given?: Type
}

/** The tools a sequence of a run may call, by the names they are told under: the agent's own, then those of sources. */
export function runTools(description: Description, agent: string, o: LineTold = {}): Map<string, RunTool> {
  const tools = new Map<string, RunTool>()
  for (const entry of entriesOf(description, agent)) {
    const given = givenOf(description, entry.tool)
    tools.set(entry.told, {
      told: entry.told,
      tool: entry.tool,
      input: inputOf(description, entry.tool),
      ...(given ? { given } : {}),
    })
  }
  for (const spec of o.specs ?? []) tools.set(spec.name, { told: spec.name, spec, input: spec.input })
  return tools
}

/** Whether a call of a tool of the run asks a person before it runs, as its line says. */
export function toolAsks(description: Description, agent: string, told: string, o: LineTold = {}): boolean {
  const entry = o.specs?.some((one) => one.name === told)
    ? { tool: told, told }
    : entriesOf(description, agent).find((one) => one.told === told)
  return entry ? asksIn(description, agent, entry, o) : false
}

/** The two lines of one tool from the list of the run, as a finding about a call of it shows them. */
export function twoLinesOf(description: Description, agent: string, told: string, o: LineTold = {}): string {
  const { own, sources } = toolList(description, agent, o)
  const lines = [...own.split('\n'), ...sources.split('\n')]
  const at = lines.findIndex((line) => line.startsWith(`${told}(`))
  return at >= 0 ? lines.slice(at, at + 2).join('\n') : ''
}

/** Whether the model of an agent answers a typed value: what makes `fill` a name of its sequences. */
export function typedAnswers(description: Description, agent: string): boolean {
  const name = agentRecord(description, agent)?.model
  const stored =
    typeof name === 'string' && Object.hasOwn(description.models, name) ? description.models[name] : undefined
  if (!isStored(stored)) return false
  const { abilities } = knownModel(stored)
  // A model of which nothing is known is held to what its provider has, so its sequences may hold `fill`.
  return !abilities || abilities.includes('typedAnswers')
}
