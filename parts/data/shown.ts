import { TentError } from '../core/index.ts'
import type { Plan } from '../core/internal.ts'
import { shownLayouts } from '../core/internal.ts'
import type { TableModel } from './model.ts'

/** What a table of the engine's own holds, by the word of `shows` that names it: the counts or the scores. */
const shownBy = (stored: string): string =>
  Object.entries(shownLayouts).find(([, layout]) => layout.name === stored)?.[0] ?? 'counts'

/** The error of what is not for a table that shows a table of the engine's own: it is read, and never written. */
const misused = (model: TableModel, what: string): TentError =>
  new TentError(
    'T2016',
    `The table ${model.name} shows the ${shownBy(String(model.stored))} of the engine: ${what} is not for it.`,
    { fix: 'Read it with a filter, a sort, a limit, `count` or `group`. Its rows are written by the engine alone.' },
  )

/** Holds a read of a table that shows a table of the engine's own to what reads it: no `search`, no `near` and no `history`. */
export function shownRead(model: TableModel, plan: Plan): void {
  if (!model.stored) return
  if (plan.history) throw misused(model, '`history`')
  if (plan.search !== undefined) throw misused(model, '`search`')
  if (plan.near !== undefined) throw misused(model, '`near`')
}

/** Holds a write to a table that shows a table of the engine's own: no write of any kind. */
export function shownWrite(model: TableModel): void {
  if (model.stored) throw misused(model, 'a write')
}
