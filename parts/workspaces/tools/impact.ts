import { text } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import { askerOfApp, describedAt, factsOf, impactOf, touchedIn } from '../../publish/index.ts'
import { runWorkspace } from '../opening.ts'
import { historyOf } from '../state.ts'
import { describedNow } from '../written.ts'
import type { ProjectTool } from './face.ts'

/**
 * `impact`: what a change will reach before it lands, as `tent impact` answers it with `--json`: the project as it
 * stands against the version that runs, or against a point that `against` names.
 */
export const impactTool: ProjectTool = {
  name: 'impact',
  about:
    'What the change of the project will reach before it lands, against the version that runs or a saved point: wider rights, breaks for callers outside, data, work under way, what each change reaches, the tests that touched it, and what now sends out.',
  input: { against: text({ min: 1, optional: true }) },
  writes: false,
  async run(at, input) {
    // The version that runs, with nothing of the change built into it.
    const app = await runWorkspace(at.held, at.one.workspace.id, { asItRuns: true })
    const { description: next } = await describedNow(at)
    if (!next) return impactOf({ against: 'running', live: app.description, next: app.description })
    const word = typeof input.against === 'string' ? input.against : undefined
    // A workspace in a box is never described in the program of the product: its points are read by what they keep.
    const live: Description = word
      ? await describedAt(historyOf(at.one), at.one.folders.data, word, { kept: at.form === 'box' })
      : app.description
    const facts = word ? {} : await factsOf(askerOfApp(app), live, next)
    const touched = touchedIn(at.one.folders.data)
    return impactOf({ against: word ?? 'running', live, next, facts: { ...facts, ...(touched ? { touched } : {}) } })
  },
}
