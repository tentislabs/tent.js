import { text } from '../../core/index.ts'
import type { Command } from '../command.ts'
import { askedOfRunning, noneRuns } from '../reach.ts'

/**
 * Lists the writer and each reader of a running app, the writer first: its id, whether it is the writer, near or
 * far, its own address, the number of its last write, whether it is current, and since when it is joined. On a
 * reader it shows what the writer answers, and what the reader last held where the writer cannot be reached. It
 * starts no engine.
 */
export const command: Command = {
  name: 'machines',
  args: { data: text({ optional: true }) },
  needs: 'engine',
  run: async ({ args, folder }) =>
    (await askedOfRunning({ folder, data: args.data }, 'machines', {})) ?? noneRuns('machines'),
}
