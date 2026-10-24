import { createRequire } from 'node:module'
import type { Files, Store } from '../../data/index.ts'

// The facts are answered at once, so the flows are loaded at once, and only for data that holds a run table.
const load = createRequire(import.meta.url)

/**
 * Takes a store that stands open. Answers, for each flow, the step names that its unfinished runs have saved or
 * wait at. Data that holds no run table says nothing, and nothing of the flows is loaded for it.
 */
export function waitingNames(store: Store): Record<string, string[]> {
  if (!store.layout().some((table) => table.name === '_t_runs')) return {}
  const flows: typeof import('../../flows/index.ts') = load('../../flows/index.ts')
  return flows.waitingStepNamesOf(store)
}

/**
 * Takes the files of an app that keeps a data file for each tenant. Answers a promise of the step names that the
 * unfinished runs of every file have saved or wait at: each file is visited, the closed ones too.
 */
export async function waitingNamesInFiles(files: Files): Promise<Record<string, string[]>> {
  if (!files.shared.layout().some((table) => table.name === '_t_runs')) return {}
  const flows = await import('../../flows/index.ts')
  return flows.waitingStepNamesOf(files)
}
