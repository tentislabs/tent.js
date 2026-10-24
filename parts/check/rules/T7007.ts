import type { Finding } from '../../core/index.ts'
import type { Rule } from '../rule.ts'
import { at } from '../rule.ts'
import { agentsOf } from '../agents.ts'
import { isStored } from '../../core/internal.ts'

const whoValues = ['user', 'assistant', 'tool', 'summary']

/** What a column of the memory table must be: answers what is wrong with it, or nothing. */
function wrongColumn(name: string, column: Record<string, unknown> | undefined, thread: string): string | undefined {
  if (!column) return `has no column \`${name}\``
  if (name === 'who') {
    const values = Array.isArray(column.values) ? column.values.map(String) : []
    if (column.kind !== 'choice' || whoValues.some((one) => !values.includes(one)))
      return "holds `who` as no `choice` of `'user'`, `'assistant'`, `'tool'` and `'summary'`"
  }
  if (
    name === 'text' &&
    (column.kind !== 'text' ||
      column.lines !== 'many' ||
      column.optional !== true ||
      column.max !== undefined ||
      column.pattern !== undefined)
  )
    return "holds `text` as no optional `text` with `lines: 'many'` and no `max` or `pattern`"
  if (name === 'data' && (column.kind !== 'json' || column.optional !== true))
    return 'holds `data` as no optional `json`'
  if (name === 'run' && (column.kind !== 'text' || column.optional !== true)) return 'holds `run` as no optional `text`'
  if (name === thread && column.kind !== 'link') return `holds the conversation's column \`${thread}\` as no \`link\``
  return undefined
}

/**
 * The table in `memory.in` that lacks what a memory table must have: `who`, `text`, `data`, `run`, the column of
 * the conversation as a link, an optional `owner` column, every other column optional or with a default, and no
 * `add` or `change` rule, since only the engine writes it.
 */
export const rule: Rule = {
  code: 'T7007',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    for (const { written, record } of agentsOf(description, source)) {
      const memory = isStored(record.memory) ? record.memory : undefined
      if (!memory) continue
      const name = String(memory.in)
      const table = Object.hasOwn(description.tables, name) ? description.tables[name] : undefined
      const fix = 'Write the table as a memory table, as `tent docs option.agent.memory` says.'
      if (!table) {
        found.push(at('T7007', written, undefined, `its memory names the table ${name}, which is not there.`, fix))
        continue
      }
      const columns: Record<string, unknown> = isStored(table.columns) ? table.columns : {}
      const thread = typeof memory.thread === 'string' ? memory.thread : 'thread'
      const said: string[] = []
      for (const column of ['who', 'text', 'data', 'run', thread]) {
        const wrong = wrongColumn(column, isStored(columns[column]) ? columns[column] : undefined, thread)
        if (wrong) said.push(wrong)
      }
      const owner = typeof table.owner === 'string' ? table.owner : undefined
      if (!owner) said.push('states no `owner`')
      else if (Reflect.get(Object(columns[owner]), 'optional') !== true)
        said.push(`holds its owner \`${owner}\` as a column that is not optional`)
      for (const [column, type] of Object.entries(columns))
        if (!['who', 'text', 'data', 'run', thread, owner].includes(column))
          if (isStored(type) && type.optional !== true && type.default === undefined)
            said.push(`holds \`${column}\`, which is neither optional nor has a default`)
      const access = isStored(table.access) ? table.access : {}
      for (const what of ['add', 'change']) if (access[what] !== undefined) said.push(`states an \`${what}\` rule`)
      if (said.length) found.push(at('T7007', written, undefined, `its memory table ${name} ${said.join(', ')}.`, fix))
    }
    return found
  },
}
