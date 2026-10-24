import { changesTable, hereTable } from './tables.ts'

/**
 * Takes what a write touched. Answers it without what the keeping of its change wrote: the running fingerprint in
 * `_t_here` and the kept change itself, which no caller touched and no query reads.
 */
export function keptOut<T extends { table: string; ids: string[] }>(touched: T[]): T[] {
  return touched
    .filter((one) => one.table !== changesTable.name)
    .map((one) => (one.table === hereTable.name ? { ...one, ids: one.ids.filter((id) => id !== 'sum') } : one))
    .filter((one) => one.table !== hereTable.name || one.ids.length)
}
