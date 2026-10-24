import type { Definition } from '../definition.ts'
import { record } from '../definition.ts'
import type { TableRule } from '../helpers/rules.ts'
import type { TableMembers, WrittenFilter } from '../plan.ts'
import { tableMembers } from '../plan.ts'
import { keepPlan } from '../planOf.ts'
import type { Type } from '../type.ts'

/** The columns of a table, each a type by its name. */
type Columns = { readonly [name: string]: Type }

/** The options of `table`. */
interface TableOptions<C> {
  columns?: C
  owner?: Extract<keyof C, string>
  access?: { read?: TableRule; add?: TableRule; change?: TableRule; remove?: TableRule }
  search?:
    | readonly Extract<keyof C, string>[]
    | { columns: readonly Extract<keyof C, string>[]; by?: 'words' | 'pieces' }
  indexes?: readonly (readonly Extract<keyof C, string>[])[]
  unique?: readonly (readonly Extract<keyof C, string>[])[]
  keepHistory?: boolean
  removed?: readonly string[]
  tenant?: Extract<keyof C, string>
  shows?: 'counts' | 'scores'
  plain?: true
  was?: string | readonly string[]
  // How long a row lasts after its last write, or after the moment that `by` names: past it, the daily upkeep
  // removes it, of the rows that `where` names. In memory, a row is gone by itself once it lasted.
  lasts?: string | { for: string; by?: Extract<keyof C, string> | 'createdAt' | 'updatedAt'; where?: WrittenFilter<C> }
  // The rows live in the writer's memory alone.
  kept?: 'memory'
}

/** What `table` returns: the definition, and with it the plans, the writes and the triggers of the table. */
type TableDefinition<Name extends string, C> = Definition<'table', Name, TableOptions<C>> & TableMembers<C>

/** The columns of the engine's table of counts, which a table that states `shows: 'counts'` is, under its own name. */
type CountsColumns = {
  readonly day: { kind: 'date' }
  readonly name: { kind: 'text' }
  readonly answeredBy: { kind: 'text' }
  readonly caller: { kind: 'text' }
  readonly user: { kind: 'link'; table: 'users'; optional: true }
  readonly unit: { kind: 'text' }
  readonly amount: { kind: 'number' }
}

/** The columns of the engine's table of ratings and scores, which a table that states `shows: 'scores'` is. */
type ScoresColumns = {
  readonly run: { kind: 'text' }
  readonly agent: { kind: 'text' }
  readonly kind: { kind: 'choice'; values: ['rating', 'score'] }
  readonly score: { kind: 'number' }
  readonly note: { kind: 'text'; optional: true }
  readonly why: { kind: 'text'; optional: true }
  readonly caller: { kind: 'text' }
  readonly user: { kind: 'link'; table: 'users'; optional: true }
}

/**
 * Takes the name of a table and its options, of which `columns` is required but for a table that states `shows`.
 * Answers the definition, which only records them, with the members of a table.
 */
export function table<const Name extends string, const C extends Columns>(
  name: Name,
  o: TableOptions<C>,
): TableDefinition<Name, C>
/**
 * Takes the name of a table that shows the counts of the engine, and the rule of who reads them. Answers the
 * definition, with the members of a table whose columns are those of the counts: it is read and never written.
 */
export function table<const Name extends string>(
  name: Name,
  o: { shows: 'counts'; access: { read: TableRule }; was?: string | readonly string[] },
): TableDefinition<Name, CountsColumns>
/**
 * Takes the name of a table that shows the ratings and the scores of the runs of agents, and the rule of who
 * reads them. Answers the definition, with the members of a table whose columns are those of the engine's table.
 */
export function table<const Name extends string>(
  name: Name,
  o: { shows: 'scores'; access: { read: TableRule }; was?: string | readonly string[] },
): TableDefinition<Name, ScoresColumns>
// The plain form stands last again, so that a call that fits no form is told what is wrong with it in that form.
export function table<const Name extends string, const C extends Columns>(
  name: Name,
  o: TableOptions<C>,
): TableDefinition<Name, C>
export function table(name: string, o: object): object {
  const members = tableMembers(name)
  return keepPlan(Object.assign(record('table', name, o), members), members.plan)
}
