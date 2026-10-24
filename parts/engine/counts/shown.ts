import type { Description } from '../../core/internal.ts'
import { countsLayout } from '../../core/internal.ts'
import type { Touched } from '../../data/index.ts'

/**
 * Takes a description and what a write touched. Answers it with each touch of the engine's table of counts told
 * again under the name of the table that shows it, where the project has one: so a live query over that table is
 * made anew when the counts are written.
 */
export function withShown(description: Description, touched: Touched[]): Touched[] {
  const shown = Object.entries(description.tables).find(([, table]) => table.shows === 'counts')?.[0]
  if (!shown) return touched
  const counted = touched.filter((one) => one.table === countsLayout.name)
  return counted.length ? [...touched, ...counted.map((one) => ({ ...one, table: shown }))] : touched
}
