import type { TableLayout, TableStep } from '../data/index.ts'
import { runsTable, scheduleTable, stepsTable } from './tables.ts'

/**
 * Takes the tables that a data file holds, and whether a run table that it lacks is made. Answers the steps that
 * bring the run tables it holds to their layout: each column and each index that an earlier layout lacked is added,
 * which leaves every row as it was. Nothing for a file whose run tables are as this layout has them.
 */
export function runTableSteps(held: TableLayout[], o: { make: boolean }): TableStep[] {
  const steps: TableStep[] = []
  for (const layout of [runsTable, stepsTable, scheduleTable]) {
    const there = held.find((one) => one.name === layout.name)
    if (!there) {
      if (o.make) steps.push({ do: 'addTable', table: layout.name, layout })
      continue
    }
    for (const [column, type] of Object.entries(layout.columns))
      if (!Object.hasOwn(there.columns, column)) steps.push({ do: 'addColumn', table: layout.name, column, to: type })
    for (const columns of layout.indexes)
      if (!there.indexes.some((one) => one.join('\n') === columns.join('\n')))
        steps.push({ do: 'addIndex', table: layout.name, columns })
  }
  return steps
}
