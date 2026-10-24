import type { ChangeDb } from '../db.ts'
import type { Definition } from '../definition.ts'
import { record } from '../definition.ts'
import type { RowOf } from '../plan.ts'

/** What the `run` of a backfill is handed beside its row: the `db` of a change, and the moment it runs at. */
interface BackfillHanded {
  db: ChangeDb
  now: Date
}

/** A table definition as a backfill names it, with the columns of its rows. */
type Named<C> = { readonly definition: string; readonly options: { columns?: C } }

/** The options of `backfill`. */
export interface BackfillOptions<C> {
  table: Named<C>
  run: (row: RowOf<C>, o: BackfillHanded) => unknown
  page?: number
  fills?: Extract<keyof C, string>
  system?: string
  was?: string | readonly string[]
}

/** What `backfill` returns: the definition, which only records its options. */
type BackfillDefinition<Name extends string, C> = Definition<'backfill', Name, BackfillOptions<C>>

/**
 * Takes the name of a backfill and its options, of which `table` and `run` are required. Answers the definition,
 * which only records them. At the switch to the version that holds it, the engine hands `run` every row of the
 * table once, in every data file that holds it, `page` rows to a write.
 */
export function backfill<const Name extends string, C>(name: Name, o: BackfillOptions<C>): BackfillDefinition<Name, C>
export function backfill(name: string, o: object): object {
  return record('backfill', name, o)
}
