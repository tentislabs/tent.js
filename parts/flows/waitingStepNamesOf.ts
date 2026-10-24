import type { Files, Store } from '../data/index.ts'
import { readRunRows } from './rows.ts'
import { holdsRuns, inEveryFile } from './everyFile.ts'
import { unfinished } from './states.ts'
import { stepsInOrder } from './views.ts'

type Names = Map<string, Set<string>>

/** Adds the step names that the unfinished runs of one store have saved or wait at. A store with no run table adds none. */
function addFrom(source: Store, names: Names): void {
  if (!holdsRuns(source)) return
  for (const run of readRunRows(source, { col: 'state', in: unfinished })) {
    const held = names.get(run.flow) ?? new Set<string>()
    names.set(run.flow, held)
    for (const step of stepsInOrder(source, run.id)) held.add(step.name)
  }
}

const sorted = (names: Names): Record<string, string[]> =>
  Object.fromEntries([...names].sort(([a], [b]) => (a < b ? -1 : 1)).map(([flow, held]) => [flow, [...held].sort()]))

/** Visits the shared file and every file of a tenant, the closed ones too. */
async function fromFiles(files: Files): Promise<Record<string, string[]>> {
  const names: Names = new Map()
  await inEveryFile(files.shared, files, (store) => addFrom(store, names))
  return sorted(names)
}

/**
 * Takes the store of an app, or its files where it keeps a data file for each tenant. Answers, for each flow, the
 * step names that its unfinished runs have saved or wait at, each name once and in the order of the names: of
 * files a promise, since every file is visited. It only reads, and needs no runner.
 */
export function waitingStepNamesOf(source: Store): Record<string, string[]>
export function waitingStepNamesOf(source: Files): Promise<Record<string, string[]>>
export function waitingStepNamesOf(
  source: Store | Files,
): Record<string, string[]> | Promise<Record<string, string[]>> {
  if ('shared' in source) return fromFiles(source)
  const names: Names = new Map()
  addFrom(source, names)
  return sorted(names)
}
