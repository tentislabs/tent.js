import { boolean, text } from '../../core/index.ts'
import type { Command } from '../command.ts'
import { askedOfRunning, noneRuns } from '../reach.ts'

/**
 * Makes a reader the writer, for a writer that is known to be stopped. It first says what this machine knows and
 * what it may lack: its kind and its number, when its writer last answered it a beat, since when it was not
 * current, the number of every other reader it was told of, with those that hold more than it, and how many files
 * of tenants it is still fetching. With `--yes` it then takes over, and answers the epoch and the number of its
 * last write beside that. Without, it changes nothing. The machine is started without `--reads` from then on. It
 * starts no engine.
 */
export const command: Command = {
  name: 'take-over',
  args: { data: text({ optional: true }), yes: boolean({ optional: true }) },
  needs: 'engine',
  run: async ({ args, folder }) => {
    const at = { folder, data: args.data }
    const looked = await askedOfRunning(at, 'take-over', { look: true })
    if (!looked) return noneRuns('take-over')
    if (looked.findings || args.yes !== true) return { ...looked, value: { ...Object(looked.value), took: false } }
    const took = await askedOfRunning(at, 'take-over', {})
    if (!took || took.findings) return took ?? noneRuns('take-over')
    return { value: { ...Object(looked.value), took: true, ...Object(took.value) } }
  },
}
