import type { Description } from '../core/internal.ts'
import { knownModel, isStored } from '../core/internal.ts'
import type { Written } from './rule.ts'
import { writtenIn } from './rule.ts'
import type { Source } from '../build/index.ts'

/** An agent of a project: as its file writes it, its name, and its record as the description holds it. */
export interface AgentOf {
  written: Written
  name: string
  record: Record<string, unknown>
}

/** Every agent that the files of a project write, with its record, in the order of the files. */
export function agentsOf(description: Description, source: Source): AgentOf[] {
  const found: AgentOf[] = []
  for (const written of writtenIn(source)) {
    if (written.word !== 'agent') continue
    const flow = Object.hasOwn(description.flows, written.name) ? description.flows[written.name] : undefined
    if (isStored(flow?.agent)) found.push({ written, name: written.name, record: flow.agent })
  }
  return found
}

/** The abilities of a model: those it states, or those the list of models gives it. Nothing where neither does. */
export function abilitiesOf(description: Description, model: string): string[] | undefined {
  const record = Object.hasOwn(description.models, model) ? description.models[model] : undefined
  if (!record) return undefined
  // A model over a service call is a function, which the check does not hold to abilities of writing.
  if (record.provider === 'service') return undefined
  return knownModel(record).abilities
}
