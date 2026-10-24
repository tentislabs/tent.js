import type { Store } from '../data/index.ts'
import { readOf } from './rows.ts'
import { runsTable } from './tables.ts'

/**
 * Takes the store of an app. Answers the versions that its runs which have not ended are pinned to, each once: the
 * engine keeps their code loadable. It only reads, and needs no runner.
 */
export function neededVersions(source: Store): string[] {
  const groups = readOf(source, {
    from: runsTable.name,
    where: { col: 'state', in: ['queued', 'running', 'waiting'] },
    group: { by: ['version'], values: { runs: { count: true } } },
  })
  return (Array.isArray(groups) ? groups : []).map((one) => String(Object(one).version)).sort()
}
