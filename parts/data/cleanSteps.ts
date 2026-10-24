import type { TableLayout, TableStep } from './store.ts'

/**
 * Takes the layout a data file holds. Answers the steps that drop what was retired, and nothing else: each retired
 * table, and each retired column of a table that is still used.
 */
export function cleanSteps(layout: TableLayout[]): TableStep[] {
  return layout.flatMap((table): TableStep[] =>
    table.retired
      ? [{ do: 'dropTable', table: table.name }]
      : (table.unused ?? []).map((column) => ({ do: 'dropColumn', table: table.name, column })),
  )
}
