import { finishedOf } from '../finished.ts'
import { sourceOf } from '../projectSource.ts'
import type { Step } from '../work.ts'

/**
 * Hands the source and the description, as the check reads them, to whoever the build was asked to hand them: they
 * are whole here, before the modules for a browser and the bundle are written, so the rules of a session of
 * development hold them while the rest of the build runs.
 */
export const step: Step = {
  order: 6.9,
  run: async (work) => {
    if (!work.options.checkable || !work.description) return
    work.options.checkable({ source: sourceOf(work), description: finishedOf(work, work.description) })
  },
}
