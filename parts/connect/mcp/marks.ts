import type { Description } from '../../core/internal.ts'
import { isStored, sendsOut } from '../../core/internal.ts'
import type { Offered } from './offered.ts'
import { onlyReads } from './offered.ts'

/** The marks of a tool as the standard names them: hints to a chat app, and no guard. */
export interface Marks {
  readOnlyHint: boolean
  destructiveHint?: boolean
  openWorldHint: boolean
}

/** The name of a tool that an agent lists: its name, or the `tool` of its entry. */
const toolOf = (entry: unknown): string => (isStored(entry) ? String(entry.tool) : String(entry))

/** Whether a tool sends data out: an agent when one of its tools does. */
function sends(description: Description, one: Offered): boolean {
  if (one.kind !== 'agent') return sendsOut(description, one.name)
  const agent = isStored(one.record.agent) ? one.record.agent : {}
  const tools = Array.isArray(agent.tools) ? agent.tools : []
  return tools.some((entry) => sendsOut(description, toolOf(entry)))
}

/**
 * The marks of an offered function, written from its definition. A query only reads. A change does not; it is
 * destructive when it asks a person, and not destructive when every write of it adds a row; otherwise the mark
 * is left out, so that the standard's own careful default holds. An action and a flow are a change that is not
 * plain, and one that states `changes: false` only reads. Every tool is open to the world when it sends data out.
 */
export function marksOf(description: Description, one: Offered): Marks {
  const destructive =
    one.record.danger === 'ask'
      ? { destructiveHint: true }
      : one.kind === 'change' &&
          Array.isArray(one.record.writes) &&
          one.record.writes.length > 0 &&
          one.record.writes.every((write) => isStored(write) && write.add !== undefined)
        ? { destructiveHint: false }
        : {}
  const reads = onlyReads(one)
  return { readOnlyHint: reads, ...(reads ? {} : destructive), openWorldHint: sends(description, one) }
}

/** The title of a tool: its name turned into words, a capital first, and a space before each capital and each run of digits. */
export function titleOf(name: string): string {
  const words = name
    .replace(/([A-Z])/g, ' $1')
    .replace(/(\d+)/g, ' $1')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
