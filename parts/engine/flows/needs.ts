import type { Description } from '../../core/internal.ts'
import type { Opened } from '../opened.ts'

/**
 * Tells the flows of an app which version runs now. An app that had no runner, and whose running version needs
 * one, is given it here, on the machine that writes: when another version runs, and when a reader took over.
 */
export async function flowsOf(o: Opened): Promise<void> {
  if (o.flows) await o.flows.live(o.version)
  else if (!needsFlows(o.description)) return
  // A reader starts no runner and no timer of the app: it reads the runs that its writer carries out.
  else if (o.machine.reader) o.runsRead ??= (await import('../../flows/index.ts')).readRuns(o.store, o.files)
  else await (await import('./starting.ts')).startRunner(o)
}

/**
 * Whether an app needs a runner: it holds a flow, an action that states `worker` or `background`, or a column
 * that work fills. Any other app starts none, and loads nothing of the flows.
 */
export function needsFlows(description: Description): boolean {
  if (Object.keys(description.flows).length) return true
  if (
    Object.values(description.functions).some(
      (one) => one.worker !== undefined || one.background !== undefined || one.imports === true,
    )
  )
    return true
  return Object.values(description.tables).some((table) =>
    Object.values(Object(table.columns)).some((column) => Reflect.get(Object(column), 'by') !== undefined),
  )
}
