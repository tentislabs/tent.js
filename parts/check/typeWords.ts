import type { Finding } from '../core/index.ts'
import type { Description } from '../core/internal.ts'
import { columnsOf } from './columns.ts'

/** The columns that every row has beside those of its table. */
const ofEveryRow = ['id', 'createdAt', 'updatedAt']

/** The names of the fields of a type, as the type checker prints a record, and whether it left some out. */
function printedFields(type: string): { names: string[]; whole: boolean } {
  const names = type
    .split(';')
    .map((field) => /^\s*(?:readonly )?([A-Za-z_$][\w$]*)\??:/.exec(field)?.[1])
    .filter((name) => name !== undefined)
  return { names, whole: !type.includes('...') }
}

/**
 * Takes a description and a finding of the type checker. Where the checker says that a name does not exist on a
 * row of a table, answers the finding with the table and its columns after the checker's own words, and every
 * other finding as it is. The row is known by its fields, which are those of one table.
 */
export function withColumns(description: Description, finding: Finding): Finding {
  const read = /^TS(?:2339|2551): Property '[^']+' does not exist on type '\{([^}]*)\}'/.exec(finding.message)
  if (!read) return finding
  const { names, whole } = printedFields(read[1])
  if (!ofEveryRow.every((name) => names.includes(name))) return finding
  const tables = Object.keys(description.tables).filter((table) => {
    const columns = [...ofEveryRow, ...Object.keys(columnsOf(description, table))]
    return names.every((name) => columns.includes(name)) && (!whole || columns.length === names.length)
  })
  if (tables.length !== 1) return finding
  const columns = [...ofEveryRow, ...Object.keys(columnsOf(description, tables[0]))].map((name) => `\`${name}\``)
  const listed = columns.length > 1 ? `${columns.slice(0, -1).join(', ')} and ${columns.at(-1)}` : columns[0]
  return { ...finding, message: `${finding.message} The table \`${tables[0]}\` has the columns ${listed}.` }
}
