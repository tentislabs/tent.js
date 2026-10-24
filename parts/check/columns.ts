import type { Source } from '../build/index.ts'
import type { Description } from '../core/internal.ts'
import type { Written } from './rule.ts'
import { writtenIn } from './rule.ts'
import { isStored } from '../core/internal.ts'

/** A type as it is stored: a record with its kind. */
export type StoredType = Record<string, unknown>

/** The columns of a table of a description, by their names, or none where the table is not there. */
export function columnsOf(description: Description, table: string): Record<string, StoredType> {
  const columns = Object.hasOwn(description.tables, table) ? description.tables[table].columns : undefined
  const found: Record<string, StoredType> = {}
  if (isStored(columns)) for (const [name, type] of Object.entries(columns)) if (isStored(type)) found[name] = type
  return found
}

/** A column that a name reaches: its table, its own name, and its type. */
export interface Reached {
  table: string
  column: string
  type: StoredType
}

/**
 * Takes a description, a table, and the name of a column as a plan writes it, which may run through links
 * (`customer.name`). Answers the column that the name reaches, or nothing where it reaches none.
 */
export function reached(description: Description, table: string, name: string): Reached | undefined {
  let at = table
  const parts = name.replace(/^-/, '').split('.')
  for (const [i, part] of parts.entries()) {
    const columns = columnsOf(description, at)
    if (!Object.hasOwn(columns, part)) return undefined
    const type = columns[part]
    if (i === parts.length - 1) return { table: at, column: part, type }
    if (type.kind !== 'link' || typeof type.table !== 'string') return undefined
    at = type.table
  }
  return undefined
}

/** The model that a vector type states, as its provider and its name, which is what two definitions of one model share. */
export function madeBy(description: Description, type: StoredType | undefined): string | undefined {
  const name = type?.kind === 'vector' && typeof type.model === 'string' ? type.model : undefined
  const model = name !== undefined && Object.hasOwn(description.models, name) ? description.models[name] : undefined
  return model ? `${String(model.provider)}/${String(model.name)}` : name
}

const named = new WeakMap<Source, Map<string, Written>>()

/** Every definition that the files of a project write, by its name. */
export function writtenByName(source: Source): Map<string, Written> {
  const held = named.get(source)
  if (held) return held
  const found = new Map(writtenIn(source).map((one) => [one.name, one]))
  named.set(source, found)
  return found
}

/** The lists of columns that a table states under an option, as `indexes` and `unique`. */
export function listsOf(table: Record<string, unknown>, option: string): string[][] {
  const lists = table[option]
  return Array.isArray(lists) ? lists.filter(Array.isArray).map((one) => one.map(String)) : []
}

/** The columns that a table states in `search`, in either of its two forms. */
export function searchOf(table: Record<string, unknown>): string[] {
  const search = table.search
  const columns = isStored(search) ? search.columns : search
  return Array.isArray(columns) ? columns.map(String) : []
}
