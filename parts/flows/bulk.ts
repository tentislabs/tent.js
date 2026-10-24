import { TentError } from '../core/index.ts'
import type { Bulk, RunState } from './face.ts'
import type { Held } from './held.ts'
import { replayRun } from './moving.ts'
import { inEveryFile } from './everyFile.ts'
import { readIn } from './places.ts'
import type { RunRow } from './rows.ts'
import { readRunRows } from './rows.ts'
import { unfinished } from './states.ts'
import { filtersOf, stepsInOrder } from './views.ts'

/**
 * The runs that work on many runs at once acts on: of the flow, in every file of the app, the closed ones too,
 * with the key, in the states, and added at or after `since` and before `before` where they are given, the oldest
 * first. `only` narrows the states to those a work can act on.
 */
async function fitting(held: Held, o: Bulk, only?: RunState[]): Promise<RunRow[]> {
  const asked = o.state === undefined ? undefined : Array.isArray(o.state) ? o.state : [o.state]
  const states = only ? (asked ?? only).filter((one) => only.includes(one)) : asked
  const filters = filtersOf({
    flow: o.flow,
    ...(o.key === undefined ? {} : { key: o.key }),
    ...(states === undefined ? {} : { states }),
    ...(o.since === undefined ? {} : { since: o.since }),
    ...(o.before === undefined ? {} : { before: o.before }),
  })
  const found = (
    await inEveryFile(held.env.store, held.env.files, (store) => readRunRows(store, { all: filters }))
  ).flat()
  return found.sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1))
}

/**
 * Stops every run that has not ended and that the filter fits, each as `stop` stops one. With `dry` nothing is
 * stopped. Answers how many runs it acts on, and their ids.
 */
export async function stopAllOf(held: Held, o: Bulk, dry: boolean): Promise<{ count: number; runs: string[] }> {
  const runs = (await fitting(held, o, unfinished)).map((run) => run.id)
  if (!dry) for (const run of runs) held.stop(run)
  return { count: runs.length, runs }
}

/**
 * Replays every run that the filter fits, each as `replay` replays one, on the live version: from the step `from`
 * where the run saved one of that name, and else reusing every step that was done. With `dry` nothing is started.
 * Answers how many runs it acts on, their ids, and the ids of the new runs. Throws T0013 before a version is live.
 */
export async function replayAllOf(
  held: Held,
  o: Bulk & { from?: string },
  dry: boolean,
): Promise<{ count: number; runs: string[]; started: string[] }> {
  const runs = await fitting(held, o)
  const started: string[] = []
  const version = held.live
  if (!dry && version === undefined)
    throw new TentError('T0013', 'No version of the app is live yet, so no run can be replayed.', {
      fix: 'Replay the runs once the app is open.',
    })
  if (!dry && version !== undefined)
    for (const run of runs) {
      const saved = stepsInOrder(readIn(held.env, run.id), run.id)
      const from = saved.some((step) => step.name === o.from) ? o.from : undefined
      started.push(replayRun(held, run.id, { version, ...(from === undefined ? {} : { from }) }))
    }
  return { count: runs.length, runs: runs.map((run) => run.id), started }
}
