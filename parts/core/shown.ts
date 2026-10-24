import type { Description } from './description.ts'
import type { Type } from './type.ts'

/**
 * `_t_counts`: what the engine counted, one row for each day, thing that was used, caller where callers are
 * counted, and unit, with its amount. `day`, `name`, `answeredBy`, `caller` and `unit` are its key, `id` is unique,
 * and it carries an index over `user` and `day` and one over `caller` and `day`. It is declared here, since a table
 * of an app may show it, and the engine's table gives this same record.
 */
export const countsLayout: {
  name: string
  columns: Record<string, Type>
  key: string[]
  indexes: string[][]
  unique: string[][]
  search: string[]
} = {
  name: '_t_counts',
  columns: {
    id: { kind: 'text' },
    day: { kind: 'date' },
    name: { kind: 'text' },
    answeredBy: { kind: 'text' },
    caller: { kind: 'text' },
    user: { kind: 'text', optional: true },
    unit: { kind: 'text' },
    amount: { kind: 'number' },
    createdAt: { kind: 'date' },
    updatedAt: { kind: 'date' },
  },
  key: ['day', 'name', 'answeredBy', 'caller', 'unit'],
  indexes: [
    ['user', 'day'],
    ['caller', 'day'],
  ],
  unique: [['id']],
  search: [],
}

/**
 * `_t_scores`: the ratings that people gave the runs of agents, and the scores that a judge gave them, one row
 * for each, with the run, the agent, whether it is a rating or a score, the score, and the note of a person or
 * the reason of a judge. Its key is `id`, and it carries an index over `run` and one over `user`. It is declared
 * here, since a table of an app may show it, and the engine's table gives this same record.
 */
export const scoresLayout: typeof countsLayout = {
  name: '_t_scores',
  columns: {
    id: { kind: 'text' },
    run: { kind: 'text' },
    agent: { kind: 'text' },
    kind: { kind: 'choice', values: ['rating', 'score'] },
    score: { kind: 'number' },
    note: { kind: 'text', optional: true },
    why: { kind: 'text', optional: true },
    caller: { kind: 'text' },
    user: { kind: 'text', optional: true },
    createdAt: { kind: 'date' },
    updatedAt: { kind: 'date' },
  },
  key: ['id'],
  indexes: [['run'], ['user']],
  unique: [],
  search: [],
}

/** The tables of the engine that a table of an app may show, by the word of `shows`. */
export const shownLayouts: Record<string, typeof countsLayout> = { counts: countsLayout, scores: scoresLayout }

/**
 * Takes a description and the name of a table. Answers the columns of the table as the types, `tent.d.ts`, the
 * check and the data hold them: those it states, and for a table that states `shows` those of the engine's table
 * it shows, with `user` a link to `users` where the project has that table and no such column where it has none.
 */
export function tableColumns(description: Description, table: string): Record<string, unknown> {
  const stored = Object.hasOwn(description.tables, table) ? description.tables[table] : undefined
  const shown = typeof stored?.shows === 'string' ? shownLayouts[stored.shows] : undefined
  if (!shown) return Object(stored?.columns)
  const columns: Record<string, unknown> = {}
  for (const [column, type] of Object.entries(shown.columns))
    if (!['id', 'createdAt', 'updatedAt', 'user'].includes(column)) columns[column] = type
  if (Object.hasOwn(description.tables, 'users')) columns.user = { kind: 'link', table: 'users', optional: true }
  return columns
}
