import type { Description } from './description.ts'
import type { LineTold } from './toolLine.ts'
import { entriesOf, givenOf, inputOf, toolLine, toolRecord } from './toolLine.ts'
import { fieldsText, typeText } from './typeText.ts'

/** The two lines of one tool in the list: its name, its input and its answer; then two spaces, its sentence and its line with no `Gives`. */
const twoLines = (first: string, sentence: string, line: string): string =>
  `${first}\n  ${[sentence, line].filter(Boolean).join(' ')}`

/**
 * Takes a description, an agent or a list of names for what MCP lists, and what is known of the run. Answers
 * the tools as text, two lines for each: `own`, the agent's own tools in the order it lists them, and `sources`,
 * the tools that sources gave the run. The input is written as the fields of a record, without the braces, and the
 * arrow and the type of the answer are left out where that type is not known. Handed the same, it writes the same
 * bytes.
 */
export function toolList(
  description: Description,
  agent: string | string[],
  o: LineTold = {},
): { own: string; sources: string } {
  const named = Array.isArray(agent)
  const entries = named
    ? agent.map((tool) => ({ tool, told: tool }))
    : entriesOf(description, agent).filter((one) => !o.held?.includes(one.told))
  const own = entries.map((entry) => {
    const given = givenOf(description, entry.tool)
    const first = `${entry.told}(${fieldsText(inputOf(description, entry.tool))})${given ? ` -> ${typeText(given)}` : ''}`
    const record = toolRecord(description, entry.tool)
    const own = 'about' in entry && typeof entry.about === 'string' ? entry.about : undefined
    const sentence = own ?? (typeof record?.about === 'string' ? record.about : '')
    const line = toolLine(description, named ? undefined : agent, entry.told, { ...o, gives: false })
    return twoLines(first, sentence, line)
  })
  const sources = (o.specs ?? []).map((spec) =>
    twoLines(
      `${spec.name}(${fieldsText(spec.input)})`,
      spec.about,
      toolLine(description, named ? undefined : agent, spec.name, { ...o, gives: false }),
    ),
  )
  return { own: own.join('\n'), sources: sources.join('\n') }
}
