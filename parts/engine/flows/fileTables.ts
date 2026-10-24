import type { Description } from '../../core/internal.ts'
import type { TableLayout } from '../../data/index.ts'
import { needsFlows } from './needs.ts'

/**
 * Takes the description of an app that keeps a data file for each tenant, and the tables of the engine. Answers
 * those tables with the run tables where the app needs a runner: a run lives in the file it was added in, so a
 * file of a tenant may hold them. An app that needs none loads nothing of the flows.
 */
export async function withRunTables(description: Description, tables: TableLayout[]): Promise<TableLayout[]> {
  if (!needsFlows(description)) return tables
  const { runsTable, stepsTable } = await import('../../flows/index.ts')
  const there = new Set(tables.map((one) => one.name))
  return [...tables, ...[runsTable, stepsTable].filter((one) => !there.has(one.name))]
}
