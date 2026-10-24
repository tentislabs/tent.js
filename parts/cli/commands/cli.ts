import { commandLine } from '../commandLine.ts'
import type { Command } from '../command.ts'

/**
 * `tent cli <target> <words>`: the runner of an app's own command line, as a command of the player, with no
 * launcher. It prints by itself, and ends as the command it ran ends.
 */
export const command: Command = {
  name: 'cli',
  args: {},
  needs: 'nothing',
  raw: true,
  run: ({ words, folder }) => commandLine(words, folder),
}
