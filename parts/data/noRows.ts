import type { ReadAnswer } from './store.ts'

/**
 * Takes a plan. Answers what it reads where nothing holds its rows: a tenant with no file yet, a file with no
 * tenant, and a table that a file does not hold yet. A count is zero, one row is nothing, and rows are none.
 */
export const noRows = (plan: { count?: true; one?: string }): ReadAnswer['value'] =>
  plan.count ? 0 : plan.one === undefined ? [] : undefined
