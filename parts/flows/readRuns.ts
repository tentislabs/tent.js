import type { FileName, Files, Store } from '../data/index.ts'
import { endOf } from './ending.ts'
import type { RunsAsked, Runner, RunView } from './face.ts'
import { findIn } from './finding.ts'
import { pausedIn } from './pausing.ts'
import { fileOf } from './places.ts'
import { readRun } from './rows.ts'
import { holdsRuns } from './everyFile.ts'
import { readView } from './views.ts'

/** What a machine that runs no runner reads of the runs in its data. */
export interface RunsRead extends Pick<Runner, 'read' | 'find' | 'paused'> {
  /** How a run ended, as whoever waits for it is answered. Nothing for a run that has not ended, `false` for one that is not there. */
  ended(run: string): { answer: unknown } | { error: Error } | false | undefined
}

/**
 * Takes a store that holds the runs of an app and that another machine writes, and the files of its tenants
 * where it keeps any. Answers `read` and `find` of a
 * runner over it, and how a run ended. It only reads, and a store that holds no run table yet holds no run.
 */
export function readRuns(source: Store, files?: Files): RunsRead {
  const places = { store: source, ...(files ? { files } : {}) }
  /** The store that holds a run, where it holds the run tables: the file that the id names, and else the shared one. */
  const holding = (id: string): Store | undefined => {
    const file = fileOf(id)
    const store = file && files ? files.of(file) : source
    return store && holdsRuns(store) ? store : undefined
  }
  function find(o: RunsAsked & { of?: FileName }): RunView[]
  function find(o: RunsAsked & { of: 'all' }): Promise<RunView[]>
  function find(o: RunsAsked & { of?: FileName | 'all' }): RunView[] | Promise<RunView[]> {
    return findIn(places, o)
  }
  return {
    read(id) {
      const store = holding(id)
      return store ? readView(store, id) : undefined
    },
    find,
    paused: () => pausedIn(source),
    ended(id) {
      const store = holding(id)
      const run = store ? readRun(store, id) : undefined
      return run ? endOf(run) : false
    },
  }
}
