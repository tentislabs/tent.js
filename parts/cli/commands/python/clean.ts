import { text } from '../../../core/index.ts'
import type { Command } from '../../command.ts'
import { cleanPython } from '../../../engine/index.ts'

/**
 * `tent python clean --older <time>` removes each Python environment of the install that was not used for that long,
 * 30 days where `--older` names no time, and keeps the others. None is left half.
 */
export const command: Command = {
  name: 'python clean',
  args: { older: text({ optional: true }) },
  needs: 'nothing',
  run: async ({ args }) => ({ value: await cleanPython(typeof args.older === 'string' ? { older: args.older } : {}) }),
}
