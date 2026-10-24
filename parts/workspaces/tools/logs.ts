import { boolean, text } from '../../core/index.ts'
import { runWorkspace } from '../opening.ts'
import type { ProjectTool } from './face.ts'

/** `logs`: the calls and the errors of the workspace's app, as `app.logs` answers them. */
export const logsTool: ProjectTool = {
  name: 'logs',
  about:
    'The newest calls, errors and slow queries of the app, the errors alone with errors, and only what was written within since, as "1 hour".',
  input: { errors: boolean({ optional: true }), since: text({ optional: true }) },
  writes: false,
  async run(at, input) {
    const app = await runWorkspace(at.held, at.one.workspace.id)
    return app.logs({
      ...(input.errors === true ? { errors: true } : {}),
      ...(typeof input.since === 'string' ? { since: input.since } : {}),
    })
  },
}
